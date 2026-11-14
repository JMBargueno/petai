import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import {
  VoiceController,
  VOICE_MAX_AUDIO_BYTES,
  voiceUploadOptions,
  type UploadedAudio,
} from './voice.controller';

/**
 * VoiceController — F-08 (STT multipart con límite propio + TTS binario en streaming)
 * y S-06 (cuota de peticiones de voz por usuario, que debe seguir aplicándose).
 */
describe('VoiceController', () => {
  const stt = { transcribe: jest.fn() };
  const tts = { synthesize: jest.fn() };
  const voiceConfig = {
    getEmotionParams: jest.fn(() => ({ basePitch: 0.2, baseSpeed: 1.05, intensity: 0.3, stability: 0.6 })),
    getSpeciesConfig: jest.fn(() => ({ timbre: 'custom' })),
    hasConfig: jest.fn(() => true),
  };

  /** Simula RedisService para la cuota S-06 (INCR + PEXPIRE); `failOpen` simula Redis caído. */
  function makeRedis(failOpen = false) {
    const counters = new Map<string, number>();
    const pexpire = jest.fn(async () => 1);
    const redis = {
      key: jest.fn((name: string) => `petai:test:${name}`),
      pexpire,
      run: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => {
        if (failOpen) return null;
        const client = {
          incr: jest.fn(async (key: string) => {
            const v = (counters.get(key) ?? 0) + 1;
            counters.set(key, v);
            return v;
          }),
          pexpire,
        };
        return fn(client);
      }),
      counters,
    };
    return redis;
  }

  const build = (redis = makeRedis()) =>
    new VoiceController(stt as never, tts as never, voiceConfig as never, redis as never);

  const makeFile = (): UploadedAudio => ({
    originalname: 'a.wav',
    mimetype: 'audio/wav',
    size: 4,
    buffer: Buffer.from([0x44, 0x49, 0x43, 0x4b]),
  });

  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    stt.transcribe.mockResolvedValue({ text: 'hola', language: 'detected', duration: 1000 });
    tts.synthesize.mockResolvedValue({ audio: Buffer.from('ID3fake-mp3'), durationMs: 2500 });
  });

  describe('transcribe (F-08: multipart/form-data con límite propio de ruta)', () => {
    it('recibe el audio como fichero y lo pasa binario al STT con el lang', async () => {
      const file = makeFile();
      await expect(build().transcribe({ id: 'u1' }, file, { lang: 'es' })).resolves.toMatchObject({ text: 'hola' });
      expect(stt.transcribe).toHaveBeenCalledWith(file.buffer, 'es');
    });

    it('sin lang → "auto"', async () => {
      await build().transcribe({ id: 'u1' }, makeFile(), {});
      expect(stt.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 'auto');
    });

    it('sin fichero → 400 y no se llama al proveedor', async () => {
      await expect(build().transcribe({ id: 'u1' }, undefined, {})).rejects.toThrow(BadRequestException);
      expect(stt.transcribe).not.toHaveBeenCalled();
    });

    it('límite de subida propio de la ruta: 5MB (>> 100KB del body parser por defecto)', () => {
      expect(VOICE_MAX_AUDIO_BYTES).toBe(5 * 1024 * 1024);
      expect(voiceUploadOptions.limits?.fileSize).toBe(VOICE_MAX_AUDIO_BYTES);
    });

    it('fichero demasiado grande → 413 (errorHandler de multer)', () => {
      let thrown: unknown;
      (voiceUploadOptions as unknown as {
        errorHandler: (err: unknown, file: unknown, cb: (e?: unknown) => void) => void;
      }).errorHandler({ code: 'LIMIT_FILE_SIZE', message: 'File too large' } as never, undefined, (e) => (thrown = e));
      expect(thrown).toBeInstanceOf(PayloadTooLargeException);
    });

    it('otro error de multer → 400', () => {
      let thrown: unknown;
      (voiceUploadOptions as unknown as {
        errorHandler: (err: unknown, file: unknown, cb: (e?: unknown) => void) => void;
      }).errorHandler({ code: 'OTHER', message: 'oops' } as never, undefined, (e) => (thrown = e));
      expect(thrown).toBeInstanceOf(BadRequestException);
    });
  });

  describe('S-06: cuota de peticiones de voz por usuario (conservada)', () => {
    it('la 21ª petición en la ventana → 429 sin llamar al proveedor', async () => {
      const c = build();
      for (let i = 0; i < 20; i++) await c.transcribe({ id: 'u1' }, makeFile(), {});
      const err = await c.transcribe({ id: 'u1' }, makeFile(), {}).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect(stt.transcribe).toHaveBeenCalledTimes(20);
    });

    it('clave de cuota por usuario con TTL de ventana', async () => {
      const redis = makeRedis();
      await build(redis).transcribe({ id: 'u1' }, makeFile(), {});
      expect(redis.counters.has('petai:test:voice:quota:u1')).toBe(true);
      expect(redis.pexpire).toHaveBeenCalledWith('petai:test:voice:quota:u1', 60_000);
    });

    it('los usuarios no comparten cuota', async () => {
      const redis = makeRedis();
      const c = build(redis);
      for (let i = 0; i < 20; i++) await c.transcribe({ id: 'u1' }, makeFile(), {});
      await expect(c.transcribe({ id: 'u2' }, makeFile(), {})).resolves.toMatchObject({ text: 'hola' });
      expect(redis.counters.has('petai:test:voice:quota:u2')).toBe(true);
    });

    it('fail-open: si Redis falla la llamada no se bloquea', async () => {
      await expect(build(makeRedis(true)).transcribe({ id: 'u1' }, makeFile(), {})).resolves.toMatchObject({
        text: 'hola',
      });
    });

    it('speak también cuenta contra la cuota', async () => {
      const c = build();
      for (let i = 0; i < 19; i++) await c.transcribe({ id: 'u1' }, makeFile(), {});
      await c.speak({ id: 'u1' }, { text: 'hola', speciesId: 'flamefox' }, makeRes() as never);
      const err = await c.speak({ id: 'u1' }, { text: 'hola', speciesId: 'flamefox' }, makeRes() as never).catch((e) => e);
      expect((err as HttpException).getStatus()).toBe(429);
    });
  });

  describe('speak (F-08: respuesta binaria audio/* en streaming)', () => {
    it('Content-Type audio/mpeg, mood/duración en cabeceras y cuerpo Buffer', async () => {
      const res = makeRes();
      await build().speak({ id: 'u1' }, { text: 'hola', speciesId: 'flamefox', mood: 'sad' }, res as never);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.type).toHaveBeenCalledWith('audio/mpeg');
      const headers = res.set.mock.calls[0][0] as Record<string, string>;
      expect(headers['X-Voice-Mood']).toBe('sad');
      expect(headers['X-Audio-Duration-Ms']).toBe('2500');
      expect(headers['Content-Disposition']).toContain('voice-flamefox-sad.mp3');
      const sent = res.send.mock.calls[0][0];
      expect(Buffer.isBuffer(sent)).toBe(true);
      expect(sent.toString()).toBe('ID3fake-mp3');
    });

    it('mood por defecto: happy', async () => {
      const res = makeRes();
      await build().speak({ id: 'u1' }, { text: 'hola', speciesId: 'flamefox' }, res as never);
      expect((res.set.mock.calls[0][0] as Record<string, string>)['X-Voice-Mood']).toBe('happy');
      expect(tts.synthesize).toHaveBeenCalledWith(expect.objectContaining({ mood: 'happy' }));
    });
  });
});