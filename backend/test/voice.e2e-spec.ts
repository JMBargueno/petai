import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as http from 'http';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Voz — STT/TTS (e2e) — camino feliz.
 *
 * Rutas cubiertas (voice.controller.ts):
 *   - POST /v1/voice/transcribe — STT (multipart/form-data: fichero `file` ≤ 5MB + campo `lang`)
 *   - POST /v1/voice/speak      — TTS (respuesta binaria en streaming, `audio/*`)
 *   - GET  /v1/voice/config/:speciesId — parámetros de voz por especie
 *
 * El proveedor real (Whisper / ElevenLabs) no está disponible en el entorno de pruebas, así que
 * el spec levanta un mock HTTP local (módulo nativo `http`, sin dependencias nuevas) y apunta
 * `WHISPER_BASE_URL` / `ELEVENLABS_BASE_URL` a ese mock antes de compilar el `AppModule`. Con ello
 * se ejercita el camino feliz de verdad (el controller + el service hacen una petición HTTP real
 * al proveedor y la interpretan), además de:
 *   - S-06 — cuota de peticiones de voz por usuario/minuto: la 21ª en la ventana → 429 sin llamar al proveedor.
 *   - S-19 — el cuerpo de error del proveedor nunca llega al cliente: cuando el mock devuelve un
 *     error con un payload «secreto», la respuesta es un 500 genérico sin ni el mensaje ni el cuerpo.
 */

/** Cadena que el mock inserta en el cuerpo de error del proveedor; jamás debe llegar al cliente (S-19). */
const PROVIDER_SECRET = 'SECRET_OPENAI_PROVIDER_TOKEN_abc123xyz';
/** Marcador que el mock busca en la petición para devolver un error del proveedor. */
const TRIGGER = 'TRIGGERERROR';

function startMockProvider(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (req.url?.startsWith('/audio/transcriptions')) {
          // STT: si la petición contiene el trigger, el proveedor devuelve un error con cuerpo «secreto».
          if (body.includes(TRIGGER)) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: { message: `rate limit exceeded for key ${PROVIDER_SECRET}` } }));
          } else {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ text: 'hola amiguito' }));
          }
        } else if (req.url?.startsWith('/text-to-speech/')) {
          // TTS: error del proveedor (cuerpo «secreto») o audio binario en el camino feliz.
          if (body.includes(TRIGGER)) {
            res.statusCode = 429;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: { message: `quota exhausted for account ${PROVIDER_SECRET}` } }));
          } else {
            // Cabecera MP3 de mentira: el service solo mide el tamaño para estimar la duración.
            const audio = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            res.statusCode = 200;
            res.setHeader('content-type', 'audio/mpeg');
            res.end(audio);
          }
        } else {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          res.end('{}');
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe('Voz — STT/TTS (e2e) — camino feliz', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: { url: string; close: () => Promise<void> };
  const api = () => request(app.getHttpServer());
  const createdUsers: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signup(): Promise<{ token: string; userId: string }> {
    const email = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@petai.local`;
    const reg = await api()
      .post('/v1/auth/register')
      .send({ email, password: 'Password123!' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const me = await api().get('/v1/me').set(auth(token)).expect(200);
    const userId = me.body.id as string;
    createdUsers.push(userId);
    return { token, userId };
  }

  beforeAll(async () => {
    provider = await startMockProvider();
    // Se fijan antes de compilar el AppModule: SttService/TtsService leen la base URL en el constructor.
    process.env.WHISPER_BASE_URL = provider.url;
    process.env.ELEVENLABS_BASE_URL = provider.url;

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const id of createdUsers) {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
    await provider.close();
  });

  it('transcribe: STT devuelve el texto del proveedor (camino feliz)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/v1/voice/transcribe')
      .set(auth(token))
      .field('lang', 'es')
      .attach('file', Buffer.from('RIFF-fake-wav-bytes'), 'audio.wav')
      .expect(200);
    expect(res.body.text).toBe('hola amiguito');
    expect(res.body.language).toBe('es');
    expect(typeof res.body.duration).toBe('number');
  });

  it('speak: TTS devuelve audio binario en streaming con mood/duración en cabeceras (camino feliz)', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/v1/voice/speak')
      .set(auth(token))
      .send({ text: 'hola amiguito', speciesId: 'flamefox', mood: 'happy' })
      .expect(200);
    expect((res.headers['content-type'] as string).includes('audio/mpeg')).toBe(true);
    expect(res.headers['x-voice-mood']).toBe('happy');
    expect(typeof res.headers['x-audio-duration-ms']).toBe('string');
    // El cuerpo es el audio binario del proveedor (un Buffer), no un JSON.
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('config/:speciesId devuelve los parámetros de voz de la especie', async () => {
    const { token } = await signup();
    const res = await api().get('/v1/voice/config/flamefox').set(auth(token)).expect(200);
    expect(res.body.speciesId).toBe('flamefox');
    expect(typeof res.body.isDefault).toBe('boolean');
    expect(typeof res.body.basePitch).toBe('number');
    expect(typeof res.body.baseSpeed).toBe('number');
    expect(res.body.emotions).toBeDefined();
  });

  it('S-06: la 21ª petición de voz en la ventana → 429 sin llamar al proveedor', async () => {
    const { token } = await signup();
    // 20 peticiones en la ventana, todas exitosas (200).
    for (let i = 0; i < 20; i++) {
      await api()
        .post('/v1/voice/transcribe')
        .set(auth(token))
        .attach('file', Buffer.from('RIFF-fake-wav-bytes'), 'audio.wav')
        .expect(200);
    }
    // La 21ª se bloquea por cuota antes de tocar el proveedor.
    const res = await api()
      .post('/v1/voice/transcribe')
      .set(auth(token))
      .attach('file', Buffer.from('RIFF-fake-wav-bytes'), 'audio.wav')
      .expect(429);
    expect(res.body.statusCode).toBe(429);
  });

  it('S-19: si el STT del proveedor falla, el cliente recibe un 500 genérico sin el cuerpo del proveedor', async () => {
    const { token } = await signup();
    // `lang` con el marcador hace que el mock devuelva un error con un payload «secreto».
    const res = await api()
      .post('/v1/voice/transcribe')
      .set(auth(token))
      .field('lang', TRIGGER)
      .attach('file', Buffer.from('RIFF-fake-wav-bytes'), 'audio.wav')
      .expect(500);
    expect(res.body.message).toBe('Error interno del servidor');
    // El cuerpo de error del proveedor (ni su token, ni su mensaje) no debe filtrar al cliente.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(PROVIDER_SECRET);
    expect(raw).not.toContain('rate limit exceeded');
  });

  it('S-19: si el TTS del proveedor falla, el cliente recibe un 500 genérico sin el cuerpo del proveedor', async () => {
    const { token } = await signup();
    const res = await api()
      .post('/v1/voice/speak')
      .set(auth(token))
      .send({ text: `hola ${TRIGGER}`, speciesId: 'flamefox' })
      .expect(500);
    expect(res.body.message).toBe('Error interno del servidor');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(PROVIDER_SECRET);
    expect(raw).not.toContain('quota exhausted');
  });
});
