import * as crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string | Buffer,
  secret: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}
