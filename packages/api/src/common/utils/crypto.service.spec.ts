import { CryptoService } from './crypto.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('CryptoService', () => {
  const TEST_KEY = crypto.randomBytes(32).toString('hex');

  function createService(key?: string, nodeEnv?: string): CryptoService {
    const config = {
      get: vi.fn().mockImplementation((name: string) => {
        if (name === 'CREDENTIALS_ENCRYPTION_KEY') return key;
        if (name === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
    };
    return new CryptoService(config as unknown as ConfigService);
  }

  describe('with encryption key', () => {
    let service: CryptoService;

    beforeEach(() => {
      service = createService(TEST_KEY);
    });

    it('should round-trip encrypt and decrypt', () => {
      const plaintext = 'my-secret-value';
      const encrypted = service.encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.startsWith('enc:')).toBe(true);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'same-value';
      const a = service.encrypt(plaintext);
      const b = service.encrypt(plaintext);
      expect(a).not.toBe(b);
      expect(service.decrypt(a)).toBe(plaintext);
      expect(service.decrypt(b)).toBe(plaintext);
    });

    it('should fail to decrypt with wrong key', () => {
      const encrypted = service.encrypt('secret');
      const wrongKeyService = createService(crypto.randomBytes(32).toString('hex'));
      expect(() => wrongKeyService.decrypt(encrypted)).toThrow();
    });

    it('should fail to decrypt tampered ciphertext (GCM auth)', () => {
      const encrypted = service.encrypt('secret');
      const parts = encrypted.split(':');
      // Tamper with the ciphertext portion
      const tampered = parts[3].replace(/[0-9a-f]/, (c: string) =>
        c === '0' ? '1' : '0',
      );
      const tamperedStr = `enc:${parts[1]}:${parts[2]}:${tampered}`;
      expect(() => service.decrypt(tamperedStr)).toThrow();
    });

    it('should round-trip encryptJSON and decryptJSON', () => {
      const obj = { token: 'ghp_abc123', username: 'admin' };
      const encrypted = service.encryptJSON(obj);
      expect(encrypted.startsWith('enc:')).toBe(true);
      expect(service.decryptJSON(encrypted)).toEqual(obj);
    });

    it('should handle empty string encryption', () => {
      const encrypted = service.encrypt('');
      expect(service.decrypt(encrypted)).toBe('');
    });

    it('should handle unicode content', () => {
      const plaintext = '密码: パスワード 🔑';
      const encrypted = service.encrypt(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('without encryption key', () => {
    let service: CryptoService;

    beforeEach(() => {
      service = createService(undefined);
    });

    it('should pass through plaintext when no key is configured', () => {
      expect(service.encrypt('secret')).toBe('secret');
    });

    it('should pass through on decrypt when no key is configured', () => {
      expect(service.decrypt('enc:aa:bb:cc')).toBe('enc:aa:bb:cc');
    });

    it('should pass through non-encrypted strings on decrypt', () => {
      expect(service.decrypt('plain-text')).toBe('plain-text');
    });

    it('should handle decryptJSON with plain JSON object', () => {
      const obj = { token: 'abc' };
      const result = service.decryptJSON(JSON.stringify(obj));
      expect(result).toEqual(obj);
    });
  });

  describe('onModuleInit', () => {
    it('should throw in production when encryption key is not set', () => {
      const service = createService(undefined, 'production');
      expect(() => service.onModuleInit()).toThrow(
        'CREDENTIALS_ENCRYPTION_KEY must be set in production',
      );
    });

    it('should not throw in non-production when encryption key is not set', () => {
      const service = createService(undefined, 'development');
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should not throw in production when encryption key is set', () => {
      const service = createService(TEST_KEY, 'production');
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });
});
