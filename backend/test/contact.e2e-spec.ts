import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { EMAIL_SENDER } from '../src/modules/mail/email.service';

/**
 * Formulario de contacto (e2e): POST /v1/contact. El transporte de email se sustituye por un mock
 * para comprobar qué se envía sin depender de un SMTP real.
 */
describe('Contacto (e2e)', () => {
  let app: INestApplication;
  const sendContactMessage = jest.fn().mockResolvedValue(undefined);
  const api = () => request(app.getHttpServer());
  const body = {
    name: 'Ana',
    email: 'ana@example.com',
    subject: 'Duda',
    message: 'Hola, tengo una duda sobre mi Pockai.',
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue({ sendPasswordResetCode: jest.fn(), sendContactMessage })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => sendContactMessage.mockClear());

  it('acepta un mensaje válido (204) y lo envía', async () => {
    await api().post('/v1/contact').send(body).expect(204);
    expect(sendContactMessage).toHaveBeenCalledTimes(1);
    expect(sendContactMessage.mock.calls[0][0]).toMatchObject({ email: 'ana@example.com', subject: 'Duda' });
  });

  it('rechaza datos no válidos (400) sin enviar', async () => {
    const res = await api().post('/v1/contact').send({ ...body, email: 'nope' }).expect(400);
    expect(res.body.message).toMatch(/email/);
    expect(sendContactMessage).not.toHaveBeenCalled();
  });

  it('honeypot relleno: 204 sin enviar', async () => {
    await api().post('/v1/contact').send({ ...body, website: 'spam' }).expect(204);
    expect(sendContactMessage).not.toHaveBeenCalled();
  });
});
