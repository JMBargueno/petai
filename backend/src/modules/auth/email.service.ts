import { Injectable, Logger } from '@nestjs/common';

/**
 * Costura para el envío de correos. La recuperación de contraseña necesita entregar un código por
 * email; el transporte real (SMTP/Resend/SES…) se configura por aquí sin tocar el flujo. Por defecto
 * se usa un transporte de consola (dev/tests): la cuenta externa de email queda pendiente, como marca
 * DEPLOY.md ("verificación de correo y recuperación de contraseña … requiere cuentas externas").
 */
export interface EmailSender {
  sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void>;
}

/** Token de inyección para `EmailSender`. */
export const EMAIL_SENDER = 'EMAIL_SENDER';

/**
 * Transporte por defecto: registra el código en la consola. En producción se sustituye por un envío
 * real con `{ provide: EMAIL_SENDER, useClass: MiSenderReal }`.
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void> {
    this.logger.log(`[password-reset] código de recuperación para ${email}: ${code} (caduca en ${expiresInMinutes} min)`);
  }
}
