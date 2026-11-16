import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { ConsoleEmailSender, SmtpEmailSender, emailSenderFactory } from './email.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const config = (values: Record<string, unknown>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe('email.service', () => {
  const sendMail = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    sendMail.mockClear();
    (nodemailer.createTransport as jest.Mock).mockReset().mockReturnValue({ sendMail });
  });

  it('sin SMTP_HOST usa el transporte de consola', () => {
    expect(emailSenderFactory(config({}))).toBeInstanceOf(ConsoleEmailSender);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('con SMTP_HOST crea un transporte SMTP autenticado', () => {
    const sender = emailSenderFactory(
      config({ SMTP_HOST: 'mail.example.test', SMTP_PORT: 587, SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASS: 'p' }),
    );
    expect(sender).toBeInstanceOf(SmtpEmailSender);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'mail.example.test',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('el mensaje de contacto va al buzón con Reply-To del remitente y asunto en una línea', async () => {
    const sender = new SmtpEmailSender(
      config({ SMTP_HOST: 'h', CONTACT_TO: 'contact@pockai.world' }),
    );
    await sender.sendContactMessage({ name: 'Ana', email: 'ana@example.com', subject: 'a\r\nb', message: 'hola', ip: '1.2.3.4' });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        // Lo envía el buzón de sistema; contact@ solo recibe.
        from: 'Pockai <noreply@pockai.world>',
        to: 'contact@pockai.world',
        replyTo: { name: 'Ana', address: 'ana@example.com' },
        subject: '[Contacto] a b',
      }),
    );
    expect(sendMail.mock.calls[0][0].text).toContain('hola');
  });

  it('el código de recuperación va al usuario', async () => {
    const sender = new SmtpEmailSender(config({ SMTP_HOST: 'h', MAIL_REPLY_TO: 'contact@pockai.world' }));
    await sender.sendPasswordResetCode('jugador@example.com', '123456', 15);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from).toBe('Pockai <noreply@pockai.world>');
    expect(mail.replyTo).toBe('contact@pockai.world');
    expect(mail.to).toBe('jugador@example.com');
    expect(mail.text).toContain('123456');
    // Versión HTML con la plantilla de marca
    expect(mail.html).toContain('123456');
    expect(mail.html).toContain('<!DOCTYPE html>');
  });

  it('el correo de verificación lleva código y enlace (HTML y texto)', async () => {
    const sender = new SmtpEmailSender(config({ SMTP_HOST: 'h', PUBLIC_WEB_URL: 'https://pockai.world' }));
    const link = 'https://pockai.world/es/verify-email?token=abc';
    await sender.sendVerification('jugador@example.com', { code: '654321', link, expiresInMinutes: 1440 });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('jugador@example.com');
    expect(mail.subject).toMatch(/Verifica/);
    expect(mail.text).toContain('654321');
    expect(mail.text).toContain(link);
    expect(mail.html).toContain('654321');
    expect(mail.html).toContain(link);
    expect(mail.html).toContain('https://pockai.world/icon-512.png');
  });

  it('sendRaw envía HTML + texto con cabeceras extra y asunto en una línea', async () => {
    const sender = new SmtpEmailSender(config({ SMTP_HOST: 'h' }));
    await sender.sendRaw({ to: 'a@b.c', subject: 'Hola\r\nBcc: x', html: '<p>hola</p>', text: 'hola', headers: { 'List-Unsubscribe': '<https://x>' } });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.c', subject: 'Hola Bcc: x', html: '<p>hola</p>', text: 'hola', headers: { 'List-Unsubscribe': '<https://x>' } }),
    );
  });
});
