import { otelLogCustomizer, PinoNestLogger, redact } from './log-serializer';

/**
 * Tests de la correlación y redacción de logs (T027, US4).
 * Verifican que `redact` enmascara secrets/PII y que el customizer inyecta traceId/spanId
 * solo cuando existe un contexto de trace activo.
 */
describe('log-serializer', () => {
  it('redacta token, apiKey, authorization y password', () => {
    const out = redact({
      token: 'abc123',
      apiKey: 'sk-123',
      authorization: 'Bearer xyz',
      password: 'test-password',
      user: 'alice',
    });
    expect(out.token).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.user).toBe('alice');
  });

  it('redacta claves anidadas de forma case-insensitive', () => {
    const out = redact({
      auth: { ClientSecret: 'top' },
      nested: { Token: 't', api_key: 'k' },
    });
    expect((out as Record<string, any>).auth.ClientSecret).toBe('[REDACTED]');
    expect((out as Record<string, any>).nested.Token).toBe('[REDACTED]');
    expect((out as Record<string, any>).nested.api_key).toBe('[REDACTED]');
  });

  it('no altera valores que no son secrets', () => {
    const out = redact({ message: 'GET /v1/pets 200', status: 200, count: 3 });
    expect(out.message).toBe('GET /v1/pets 200');
    expect(out.status).toBe(200);
    expect(out.count).toBe(3);
  });

  it('es no-destructivo: no muta el objeto original', () => {
    const original = { token: 'abc', plain: 'x' };
    const copy = original;
    redact(original);
    expect(original.token).toBe('abc');
    expect(copy.plain).toBe('x');
  });

  it('otelLogCustomizer preserva el mensaje y no añade traceId sin contexto', () => {
    const log = otelLogCustomizer({ msg: 'GET /v1/pets 200' });
    expect(log.msg).toBe('GET /v1/pets 200');
    expect((log as Record<string, unknown>).traceId).toBeUndefined();
    expect((log as Record<string, unknown>).spanId).toBeUndefined();
  });

  it('otelLogCustomizer redacta secrets presentes en el objeto', () => {
    const log = otelLogCustomizer({ msg: 'auth ok', accessToken: 'tok' });
    expect((log as Record<string, unknown>).accessToken).toBe('[REDACTED]');
  });
});

/**
 * PinoNestLogger: el bridge a pino debe mapear el level numérico de Nest al MÉTODO de pino
 * ('trace'/'debug'/'info'/'warn'/'error'). Regresión: usar el número como nombre de método
 * (`this.pino[30]`) es undefined y hace abort() al bootstrap de producción.
 */
describe('PinoNestLogger', () => {
  const methods = ['trace', 'debug', 'info', 'warn', 'error'] as const;

  function makeLogger() {
    const calls: string[] = [];
    const fakePino = {} as Record<string, (...args: unknown[]) => void>;
    for (const m of methods) {
      fakePino[m] = () => {
        calls.push(m);
      };
    }
    return { logger: new PinoNestLogger(fakePino), calls };
  }

  it.each([
    [10, 'trace'],
    [20, 'debug'],
    [30, 'info'],
    [40, 'warn'],
    [50, 'error'],
  ])('emite un level %i de Nest a pino.%s', (level, method) => {
    const { logger, calls } = makeLogger();
    (logger as any).emit(level, 'hola');
    expect(calls).toEqual([method]);
  });

  it('log() va a info y error() va a error', () => {
    const { logger, calls } = makeLogger();
    logger.log('hola', 'Ctx');
    logger.error('fallo');
    expect(calls).toEqual(['info', 'error']);
  });
});
