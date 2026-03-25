import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly key: Buffer | null;
  private readonly logger = new Logger(CryptoService.name);

  constructor(private readonly config: ConfigService) {
    const keyHex = this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY');
    this.key = keyHex ? Buffer.from(keyHex, 'hex') : null;
    if (!this.key) {
      this.logger.warn('CREDENTIALS_ENCRYPTION_KEY not set — credentials stored in plaintext');
    }
  }

  onModuleInit(): void {
    if (!this.key && this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY must be set in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
  }

  encrypt(plaintext: string): string {
    if (!this.key) return plaintext;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.key || !ciphertext.startsWith('enc:')) return ciphertext;
    const parts = ciphertext.split(':');
    if (parts.length !== 4) return ciphertext;
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encrypted = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  encryptJSON(obj: Record<string, any>): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptJSON(ciphertext: string): Record<string, any> {
    const plaintext = this.decrypt(ciphertext);
    try {
      return JSON.parse(plaintext);
    } catch (error) {
      this.logger.debug(`Failed to parse decrypted JSON: ${error instanceof Error ? error.message : String(error)}`);
      return typeof ciphertext === 'object' ? ciphertext as any : {};
    }
  }
}
