import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuthThrottleService } from '../auth/auth-throttle.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { EMAIL_SENDER, EmailSender } from '../mail/email.service';
import { contactSchema } from './dto/contact.schemas';

const HOUR = 60 * 60_000;
// Límites anti-abuso por hora: por IP y por email remitente.
const PER_IP = 5;
const PER_EMAIL = 5;

/**
 * Formulario de contacto público: valida, limita y reenvía el mensaje al buzón de contacto
 * (contact@pockai.world) con Reply-To del remitente y el tipo de mensaje en el asunto.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly throttle: AuthThrottleService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async submit(raw: unknown, ip: string): Promise<void> {
    const input = parseOrBadRequest(contactSchema, raw);
    // Honeypot relleno ⇒ bot: se responde igual que un envío correcto, sin enviar nada.
    if (input.website) {
      this.logger.warn(`Contacto descartado por honeypot (ip ${ip})`);
      return;
    }
    await this.throttle.consume(`contact-ip:${ip}`, PER_IP, HOUR);
    await this.throttle.consume(`contact-email:${input.email}`, PER_EMAIL, HOUR);

    try {
      await this.email.sendContactMessage({
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        type: input.type,
        source: input.source,
        ip,
      });
    } catch (err) {
      this.logger.error(`No se pudo enviar el mensaje de contacto: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo enviar el mensaje; inténtalo más tarde');
    }
  }
}
