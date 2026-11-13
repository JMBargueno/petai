import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Marca en keyIv de los secretos ligados a un contexto (AAD). Los anteriores no la llevan. */
const BOUND_PREFIX = 'v2:';

export interface EncryptedSecret {
  encryptedKey: string; // base64
  keyIv: string; // base64 (12 bytes); con prefijo "v2:" si el secreto está ligado a un contexto
  keyTag: string; // base64 (16 bytes, tag de autenticación GCM)
}

/** Cifrado AES-256-GCM de las API keys de los usuarios (BYOK). */
@Injectable()
export class KeyCryptoService {
  constructor(private readonly config: ConfigService) {}

  private masterKey(): Buffer {
    const hex = this.config.get<string>('AI_KEY_ENCRYPTION_KEY') ?? '';
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('AI_KEY_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
  }

  /**
   * `context` (p. ej. el id del usuario) se autentica junto al cifrado (AAD de GCM): el secreto solo
   * se descifra con el mismo contexto, así que no sirve copiado a la fila de otro usuario.
   */
  encrypt(plain: string, context?: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return {
      encryptedKey: encrypted.toString('base64'),
      keyIv: (context ? BOUND_PREFIX : '') + iv.toString('base64'),
      keyTag: cipher.getAuthTag().toString('base64'),
    };
  }

  /** Lanza si el contenido fue manipulado o la clave maestra no coincide. */
  decrypt(secret: EncryptedSecret, context?: string): string {
    const bound = KeyCryptoService.isBound(secret);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey(),
      Buffer.from(bound ? secret.keyIv.slice(BOUND_PREFIX.length) : secret.keyIv, 'base64'),
    );
    // Los secretos antiguos (sin marca) se cifraron sin contexto y se descifran igual
    if (bound) decipher.setAAD(Buffer.from(context ?? '', 'utf8'));
    decipher.setAuthTag(Buffer.from(secret.keyTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.encryptedKey, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** ¿El secreto ya está ligado a un contexto? (los anteriores a este formato no). */
  static isBound(secret: Pick<EncryptedSecret, 'keyIv'>): boolean {
    return secret.keyIv.startsWith(BOUND_PREFIX);
  }

  /** Versión enmascarada para mostrar al cliente: nunca se devuelve la key completa. */
  static mask(key: string): string {
    if (key.length <= 8) return '••••';
    return `${key.slice(0, 3)}…${key.slice(-4)}`;
  }
}
