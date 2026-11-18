import * as crypto from 'crypto';

/**
 * Enlaces de baja de los correos del panel: `<userId>.<hmac>` firmado con MAIL_UNSUBSCRIBE_SECRET
 * (o, si no está definido, un secreto derivado de JWT_ACCESS_SECRET). Sin estado ni caducidad: el
 * enlace de un correo antiguo debe seguir funcionando.
 */
export class UnsubscribeTokens {
  private readonly key: Buffer;

  constructor(secret: string | undefined, fallbackSecret: string) {
    this.key = secret
      ? Buffer.from(secret)
      : crypto.createHash('sha256').update(`pockai-unsubscribe:${fallbackSecret}`).digest();
  }

  private sign(userId: string): string {
    return crypto.createHmac('sha256', this.key).update(`unsub:${userId}`).digest('base64url');
  }

  create(userId: string): string {
    return `${userId}.${this.sign(userId)}`;
  }

  /** Devuelve el userId si la firma es válida; null si no. */
  verify(token: unknown): string | null {
    if (typeof token !== 'string' || token.length > 200) return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const userId = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(this.sign(userId));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? userId : null;
  }
}
