import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ContactService } from './contact.service';
import type { EmailSender } from '../mail/email.service';

describe('ContactService', () => {
  const valid = {
    name: 'Ana',
    email: '  Ana@Example.com ',
    subject: 'Hola\r\nBcc: spam@evil.test',
    message: 'Un mensaje lo bastante largo.\nSegunda línea.',
  };
  let email: jest.Mocked<EmailSender>;
  let throttle: { consume: jest.Mock };
  let service: ContactService;

  beforeEach(() => {
    email = {
      sendPasswordResetCode: jest.fn(),
      sendContactMessage: jest.fn().mockResolvedValue(undefined),
      sendVerification: jest.fn(),
      sendRaw: jest.fn(),
    };
    throttle = { consume: jest.fn().mockResolvedValue(undefined) };
    service = new ContactService(throttle as any, email);
  });

  it('envía el mensaje saneado y limita por IP y por email', async () => {
    await service.submit(valid, '1.2.3.4');
    expect(email.sendContactMessage).toHaveBeenCalledWith({
      name: 'Ana',
      email: 'ana@example.com',
      subject: 'Hola  Bcc: spam@evil.test',
      message: 'Un mensaje lo bastante largo.\nSegunda línea.',
      type: 'other',
      source: 'web',
      ip: '1.2.3.4',
    });
    expect(throttle.consume).toHaveBeenCalledWith('contact-ip:1.2.3.4', 5, 3_600_000);
    expect(throttle.consume).toHaveBeenCalledWith('contact-email:ana@example.com', 5, 3_600_000);
  });

  it('pasa el tipo y el origen al correo', async () => {
    await service.submit({ ...valid, type: 'bug', source: 'android' }, '1.2.3.4');
    expect(email.sendContactMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'bug', source: 'android' }));
  });

  it('honeypot relleno: responde sin enviar ni consumir cupo', async () => {
    await service.submit({ ...valid, website: 'http://spam' }, '1.2.3.4');
    expect(email.sendContactMessage).not.toHaveBeenCalled();
    expect(throttle.consume).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, email: 'no-es-email' }],
    [{ ...valid, message: 'corto' }],
    [{ ...valid, name: '   ' }],
    [{ ...valid, subject: undefined }],
    [{ ...valid, message: 'x'.repeat(5001) }],
    [{ ...valid, type: 'spam' }],
    [{ ...valid, source: 'ios' }],
  ])('rechaza datos no válidos con 400', async (body) => {
    await expect(service.submit(body, '1.2.3.4')).rejects.toBeInstanceOf(BadRequestException);
    expect(email.sendContactMessage).not.toHaveBeenCalled();
  });

  it('si el transporte falla responde 503', async () => {
    email.sendContactMessage.mockRejectedValue(new Error('smtp caído'));
    await expect(service.submit(valid, '1.2.3.4')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
