import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Mensaje recibido desde el formulario de contacto público. */
export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
  ip: string;
}

/**
 * Costura para el envío de correos (recuperación de contraseña y formulario de contacto).
 * Con `SMTP_HOST` configurado se usa {@link SmtpEmailSender}; sin él, {@link ConsoleEmailSender}
 * (desarrollo/tests), que solo escribe en el log.
 */
export interface EmailSender {
  sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void>;
  sendContactMessage(msg: ContactMessage): Promise<void>;
}

/** Token de inyección para `EmailSender`. */
export const EMAIL_SENDER = 'EMAIL_SENDER';

const resetBody = (code: string, expiresInMinutes: number) =>
  [
    'Hola,',
    '',
    `Tu código para recuperar la contraseña de Pockai es: ${code}`,
    '',
    `Caduca en ${expiresInMinutes} minutos. Si no lo has pedido tú, ignora este correo.`,
    '',
    '— Pockai',
  ].join('\n');

const contactBody = (m: ContactMessage) =>
  [`Nombre: ${m.name}`, `Email: ${m.email}`, `IP: ${m.ip}`, '', m.message].join('\n');

/** Quita saltos de línea de valores que van en cabeceras (asunto). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** Transporte por defecto: registra en la consola (dev/tests). */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void> {
    this.logger.log(`[password-reset] código de recuperación para ${email}: ${code} (caduca en ${expiresInMinutes} min)`);
  }

  async sendContactMessage(msg: ContactMessage): Promise<void> {
    this.logger.log(`[contact] de ${msg.name} <${msg.email}> (${msg.ip}): ${oneLine(msg.subject)}\n${msg.message}`);
  }
}

/** Transporte SMTP real (mailcow de pockai.world). */
@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly contactTo: string;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: Number(config.get('SMTP_PORT') ?? 465),
      secure: config.get<string>('SMTP_SECURE') !== 'false',
      // Si SMTP_HOST es una IP (red interna), nodemailer la usa sin resolverla y
      // fallaría el chequeo de host del cert; se verifica contra el nombre público.
      servername: config.get<string>('SMTP_TLS_SERVERNAME') || undefined,
      auth: config.get<string>('SMTP_USER')
        ? { user: config.get<string>('SMTP_USER'), pass: config.get<string>('SMTP_PASS') }
        : undefined,
    });
    // Todo sale desde el buzón de sistema (noreply@); contact@ solo recibe.
    this.from = config.get<string>('MAIL_FROM') ?? 'Pockai <noreply@pockai.world>';
    this.replyTo = config.get<string>('MAIL_REPLY_TO') || undefined;
    this.contactTo = config.get<string>('CONTACT_TO') ?? 'contact@pockai.world';
  }

  async sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      // Si el usuario responde, llega a soporte en vez de perderse en noreply@.
      replyTo: this.replyTo,
      to: email,
      subject: 'Tu código de recuperación de Pockai',
      text: resetBody(code, expiresInMinutes),
    });
  }

  async sendContactMessage(msg: ContactMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: this.contactTo,
      // Responder desde el buzón contesta directamente a quien escribió.
      replyTo: { name: oneLine(msg.name), address: msg.email },
      subject: `[Contacto] ${oneLine(msg.subject)}`,
      text: contactBody(msg),
    });
  }
}

/** Elige el transporte según la configuración: SMTP si hay `SMTP_HOST`, consola si no. */
export const emailSenderFactory = (config: ConfigService): EmailSender =>
  config.get<string>('SMTP_HOST') ? new SmtpEmailSender(config) : new ConsoleEmailSender();
