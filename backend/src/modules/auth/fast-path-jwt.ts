import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Claves RS256 para el "refresh JWT fast-path" (feature 009-edge-cdn, US3/T019).
 *
 * El origin firma el refresh JWT fast-path con la clave PRIVADA (RS256); el edge lo verifica de
 * forma stateless contra la clave PÚBLICA expuesta como JWKS. Esto permite resolver el refresh en
 * el edge sin tocar la base de datos ni distribuir el secreto simétrico de los access tokens.
 *
 * - En producción: `JWT_FASTPATH_PRIVATE_KEY` / `JWT_FASTPATH_PUBLIC_KEY` (PEM) por env.
 * - En desarrollo/tests: se genera un par RSA efímero al arrancar (solo 1 proceso ⇒ coherente).
 */
export interface FastPathKeys {
  privateKeyPem: string;
  publicKeyPem: string;
  kid: string;
}

@Injectable()
export class FastPathJwtService implements OnModuleInit {
  private readonly logger = new Logger(FastPathJwtService.name);
  private keys: FastPathKeys = {
    privateKeyPem: '',
    publicKeyPem: '',
    kid: 'petai-fastpath-ephemeral',
  };

  onModuleInit() {
    const priv = process.env.JWT_FASTPATH_PRIVATE_KEY;
    const pub = process.env.JWT_FASTPATH_PUBLIC_KEY;
    if (priv && pub) {
      this.keys = { privateKeyPem: priv, publicKeyPem: pub, kid: process.env.JWT_FASTPATH_KID || 'petai-fastpath-1' };
    } else {
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      this.keys = {
        privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
        publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }) as string,
        kid: 'petai-fastpath-ephemeral',
      };
      this.logger.warn('Fast-path: no hay JWT_FASTPATH_*_KEY por env; se generó un par RSA efímero (solo dev/test).');
    }
  }

  get kid(): string {
    return this.keys.kid;
  }

  /** Clave privada PEM (para firmar el refresh fast-path). */
  get privateKeyPem(): string {
    return this.keys.privateKeyPem;
  }

  /** Clave pública PEM. */
  get publicKeyPem(): string {
    return this.keys.publicKeyPem;
  }

  /**
   * Construye el JWKS público del fast-path (para que el edge lo consume vía
   * `JWT_PUBLIC_KEY_JWKS_URL`). Expone solo la clave pública (nunca la privada).
   */
  buildJwks(): { keys: Array<Record<string, unknown>> } {
    const jwk = crypto.createPublicKey(this.keys.publicKeyPem).export({ format: 'jwk' }) as {
      kty: string;
      n: string;
      e: string;
    };
    return {
      keys: [{ kty: jwk.kty || 'RSA', n: jwk.n, e: jwk.e, use: 'sig', alg: 'RS256', kid: this.keys.kid }],
    };
  }
}