import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { passwordResetEmail, verificationEmail } from './templates/transactional';

/** Mensaje recibido desde el formulario de contacto público. */
export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
  ip: string;
}

/** Datos del correo de verificación de cuenta. */
export interface VerificationMail {
  code: string;
  link: string;
  expiresInMinutes: number;
  displayName?: string | null;
}

/** Correo ya renderizado (envíos desde el panel de administración). */
export interface RawMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Cabeceras extra (p. ej. List-Unsubscribe). */
  headers?: Record<string, string>;
}

/**
 * Costura para el envío de correos (recuperación de contraseña, verificación de cuenta, formulario
 * de contacto y envíos del panel). Con `SMTP_HOST` configurado se usa {@link SmtpEmailSender}; sin él,
 * {@link ConsoleEmailSender} (desarrollo/tests), que solo escribe en el log.
 */
export interface EmailSender {
  sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void>;
  sendContactMessage(msg: ContactMessage): Promise<void>;
  /** Verificación de cuenta: código para la app + enlace a la web. */
  sendVerification(email: string, data: VerificationMail): Promise<void>;
  sendRaw(mail: RawMail): Promise<void>;
}

/** Token de inyección para `EmailSender`. */
export const EMAIL_SENDER = 'EMAIL_SENDER';

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

  async sendVerification(email: string, data: VerificationMail): Promise<void> {
    this.logger.log(
      `[verify-email] código para ${email}: ${data.code} · enlace: ${data.link} (caduca en ${data.expiresInMinutes} min)`,
    );
  }

  async sendRaw(mail: RawMail): Promise<void> {
    this.logger.log(`[mail] a ${mail.to}: ${oneLine(mail.subject)} (${mail.html.length} bytes de HTML)`);
  }
}

/** Transporte SMTP real (mailcow de pockai.world). */
@Injectable()
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly contactTo: string;
  private readonly webUrl: string;

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
    this.webUrl = config.get<string>('PUBLIC_WEB_URL') || 'https://pockai.world';
  }

  async sendPasswordResetCode(email: string, code: string, expiresInMinutes: number): Promise<void> {
    const mail = passwordResetEmail({ webUrl: this.webUrl, code, expiresInMinutes });
    await this.transporter.sendMail({
      from: this.from,
      // Si el usuario responde, llega a soporte en vez de perderse en noreply@.
      replyTo: this.replyTo,
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
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

  async sendVerification(email: string, data: VerificationMail): Promise<void> {
    const mail = verificationEmail({ webUrl: this.webUrl, ...data });
    await this.transporter.sendMail({
      from: this.from,
      replyTo: this.replyTo,
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }

  async sendRaw(mail: RawMail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      replyTo: this.replyTo,
      to: mail.to,
      subject: oneLine(mail.subject),
      text: mail.text,
      html: mail.html,
      headers: mail.headers,
    });
  }
}

/** Elige el transporte según la configuración: SMTP si hay `SMTP_HOST`, consola si no. */
export const emailSenderFactory = (config: ConfigService): EmailSender =>
  config.get<string>('SMTP_HOST') ? new SmtpEmailSender(config) : new ConsoleEmailSender();
