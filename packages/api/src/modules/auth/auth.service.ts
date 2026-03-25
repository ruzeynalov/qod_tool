import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../../database/prisma.service';

const scryptAsync = promisify(crypto.scrypt);

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  orgId: string;
  iat: number;
  exp: number;
}

interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.jwtSecret = secret;
  }

  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${key.toString('hex')}`;
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const [salt, storedKey] = hash.split(':');
      if (!salt || !storedKey) return false;
      const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
      return crypto.timingSafeEqual(
        Buffer.from(storedKey, 'hex'),
        derivedKey,
      );
    } catch (error) {
      this.logger.debug(`Password verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) return null;

    const isValid = await this.verifyPassword(password, user.password);
    if (!isValid) return null;

    const { password: _pw, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(user: {
    id: string;
    orgId: string;
    email: string;
    role: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };

    const accessToken = this.createToken(payload, this.jwtSecret, 8);
    const refreshToken = this.createToken({ ...payload, type: 'refresh' }, this.jwtSecret, 168); // 7 days
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string } | null> {
    const payload = this.verifyToken(refreshToken);
    if (!payload) return null;

    // Verify the token is a refresh token
    const rawPayload = JSON.parse(
      Buffer.from(refreshToken.split('.')[1], 'base64url').toString(),
    );
    if (rawPayload.type !== 'refresh') return null;

    const accessToken = this.createToken(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        orgId: payload.orgId,
      },
      this.jwtSecret,
      8,
    );
    return { accessToken };
  }

  async register(orgId: string, dto: RegisterDto) {
    // If any users exist in the system, registration is disabled
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw new ForbiddenException('Registration is disabled. Contact an administrator.');
    }

    const hashedPassword = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        orgId,
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
      },
    });

    const { password: _pw, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  createToken(
    payload: Record<string, unknown>,
    secret: string,
    expiresInHours = 8,
  ): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);

    const fullPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInHours * 3600,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString(
      'base64url',
    );

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signature] = parts;

      // Verify signature using timing-safe comparison
      const expectedSignature = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (signature.length !== expectedSignature.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
      }

      // Decode and parse payload
      const payload: TokenPayload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString(),
      );

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;

      return payload;
    } catch (error) {
      this.logger.debug(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
