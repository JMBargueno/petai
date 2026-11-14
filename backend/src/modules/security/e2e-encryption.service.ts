import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * E2eEncryptionService — Feature 026. Gestión de la public key P-256 del cliente para
 * chat IA E2E. El backend SOLO enruta el cifrado: nunca descifra ni lee el prompt
 * (solo aplica a modo BYOK). Aquí se valida y persiste la public key (PEM).
 */
@Injectable()
export class E2eEncryptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda la public key P-256 (PEM) del usuario. Revoca cualquier key previa activa.
   * @throws 400 si el PEM no parece una public key P-256 válida.
   */
  async storePublicKey(userId: string, publicKeyPem: string) {
    this.validatePublicKey(publicKeyPem);

    // Revoca claves activas previas (una key activa por user).
    await this.prisma.e2eKeyPair.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const keyPair = await this.prisma.e2eKeyPair.create({
      data: { userId, publicKey: publicKeyPem },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId,
          event: 'key_created',
          metadata: { type: 'e2e_public_key', id: keyPair.id },
        },
      })
      .catch(() => undefined);

    return {
      id: keyPair.id,
      createdAt: keyPair.createdAt,
      e2eEnabled: true,
      note: 'El backend solo enruta el cifrado; no descifra los mensajes (BYOK).',
    };
  }

  /** Devuelve la public key E2E activa del usuario (si existe). */
  async getActiveKey(userId: string) {
    const key = await this.prisma.e2eKeyPair.findFirst({
      where: { userId, revokedAt: null },
    });
    if (!key) return { e2eEnabled: false };
    return {
      e2eEnabled: true,
      publicKey: key.publicKey,
      createdAt: key.createdAt,
    };
  }

  /**
   * Valida que el PEM parezca una public key P-256. Validación de formato (no
   * criptográfica): acepta la cabecera estándar o un SPKI/DER codificado en base64.
   */
  private validatePublicKey(publicKeyPem: string): void {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') {
      throw new BadRequestException('publicKey es requerido');
    }
    const hasHeader = /-----BEGIN (EC )?PUBLIC KEY-----/.test(publicKeyPem);
    const base64Body = publicKeyPem
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s+/g, '');
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(base64Body);
    if (!hasHeader && !looksBase64) {
      throw new BadRequestException('El public key no parece un PEM/SPKI válido');
    }
  }
}