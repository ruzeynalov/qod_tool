import { createPrismaMock, PrismaMock } from '../../common/utils/prisma-mock';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let configService: { get: ReturnType<typeof vi.fn> };

  const JWT_SECRET = 'test-jwt-secret-key-for-testing';

  beforeEach(() => {
    prisma = createPrismaMock();
    configService = { get: vi.fn().mockReturnValue(JWT_SECRET) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
    );
  });

  describe('hashPassword()', () => {
    it('should return a hash different from the original password', async () => {
      const password = 'MySecurePassword123';
      const hash = await service.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });

    it('should include salt in the hash output', async () => {
      const password = 'MySecurePassword123';
      const hash = await service.hashPassword(password);

      // Format: salt:derivedKey (both hex-encoded)
      expect(hash).toContain(':');
      const [salt, key] = hash.split(':');
      expect(salt.length).toBeGreaterThan(0);
      expect(key.length).toBeGreaterThan(0);
    });

    it('should produce different hashes for the same password (random salt)', async () => {
      const password = 'MySecurePassword123';
      const hash1 = await service.hashPassword(password);
      const hash2 = await service.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword()', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'MySecurePassword123';
      const hash = await service.hashPassword(password);

      const result = await service.verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'MySecurePassword123';
      const hash = await service.hashPassword(password);

      const result = await service.verifyPassword('WrongPassword', hash);
      expect(result).toBe(false);
    });

    it('should return false for malformed hash', async () => {
      const result = await service.verifyPassword('password', 'not-a-valid-hash');
      expect(result).toBe(false);
    });
  });

  describe('validateUser()', () => {
    const mockUser = {
      id: 'user-uuid-1',
      orgId: 'org-uuid-1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'MEMBER',
      password: '', // will be set in test
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user without password when credentials are valid', async () => {
      const password = 'CorrectPassword123';
      const hash = await service.hashPassword(password);
      const userWithHash = { ...mockUser, password: hash };

      prisma.user.findUnique.mockResolvedValue(userWithHash);

      const result = await service.validateUser('test@example.com', password);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
      expect(result!.id).toBe(mockUser.id);
      expect(result!.email).toBe(mockUser.email);
    });

    it('should return null when user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('unknown@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null when password does not match', async () => {
      const hash = await service.hashPassword('CorrectPassword');
      const userWithHash = { ...mockUser, password: hash };

      prisma.user.findUnique.mockResolvedValue(userWithHash);

      const result = await service.validateUser('test@example.com', 'WrongPassword');

      expect(result).toBeNull();
    });

    it('should return null when user has no password (SSO-only)', async () => {
      const userNoPassword = { ...mockUser, password: null };

      prisma.user.findUnique.mockResolvedValue(userNoPassword);

      const result = await service.validateUser('test@example.com', 'anypassword');

      expect(result).toBeNull();
    });
  });

  describe('login()', () => {
    it('should return an object with accessToken', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MEMBER' as const,
      };

      const result = await service.login(user);

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('should produce a token with three dot-separated parts (header.payload.signature)', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN' as const,
      };

      const result = await service.login(user);
      const parts = result.accessToken.split('.');

      expect(parts).toHaveLength(3);
    });

    it('should embed userId, email, role, and orgId in the token payload', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN' as const,
      };

      const { accessToken } = await service.login(user);

      // Decode the payload (second part)
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString(),
      );

      expect(payload.userId).toBe(user.id);
      expect(payload.email).toBe(user.email);
      expect(payload.role).toBe(user.role);
      expect(payload.orgId).toBe(user.orgId);
    });

    it('should include an expiration (exp) in the token payload', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MEMBER' as const,
      };

      const { accessToken } = await service.login(user);
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString(),
      );

      expect(payload.exp).toBeDefined();
      expect(typeof payload.exp).toBe('number');
      // exp should be in the future
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('verifyToken()', () => {
    it('should verify a valid token and return the payload', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MEMBER' as const,
      };

      const { accessToken } = await service.login(user);
      const payload = service.verifyToken(accessToken);

      expect(payload).toBeDefined();
      expect(payload!.userId).toBe(user.id);
      expect(payload!.email).toBe(user.email);
    });

    it('should return null for a tampered token', async () => {
      const user = {
        id: 'user-uuid-1',
        orgId: 'org-uuid-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MEMBER' as const,
      };

      const { accessToken } = await service.login(user);
      // Tamper with the payload
      const parts = accessToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ userId: 'hacker', email: 'hack@evil.com', role: 'ADMIN', orgId: 'x' }),
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const result = service.verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    it('should return null for a completely invalid token', async () => {
      const result = service.verifyToken('not.a.real-token');
      expect(result).toBeNull();
    });

    it('should return null for an expired token', () => {
      // Create a token that expired 1 hour ago
      const payload = {
        userId: 'user-uuid-1',
        email: 'test@example.com',
        role: 'MEMBER',
        orgId: 'org-uuid-1',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600,
      };

      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payloadB64}`)
        .digest('base64url');
      const expiredToken = `${header}.${payloadB64}.${signature}`;

      const result = service.verifyToken(expiredToken);
      expect(result).toBeNull();
    });
  });

  describe('register()', () => {
    it('should create a user with hashed password and return user without password', async () => {
      const orgId = 'org-uuid-1';
      const dto = {
        email: 'new@example.com',
        password: 'SecurePass123',
        name: 'New User',
      };

      const createdUser = {
        id: 'user-uuid-new',
        orgId,
        email: dto.email,
        name: dto.name,
        role: 'MEMBER',
        password: 'hashed-password',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.register(orgId, dto);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          orgId,
          email: dto.email,
          name: dto.name,
          password: expect.any(String),
        },
      });

      // The stored password should be a hash, not the plain text
      const callArgs = prisma.user.create.mock.calls[0][0];
      expect(callArgs.data.password).not.toBe(dto.password);
      expect(callArgs.data.password).toContain(':');

      // Result should not contain password
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe(dto.email);
    });

    it('should propagate errors from prisma (e.g. unique constraint)', async () => {
      const orgId = 'org-uuid-1';
      const dto = {
        email: 'existing@example.com',
        password: 'SecurePass123',
        name: 'Existing User',
      };

      prisma.user.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`email`)'),
      );

      await expect(service.register(orgId, dto)).rejects.toThrow(
        'Unique constraint failed',
      );
    });
  });
});
