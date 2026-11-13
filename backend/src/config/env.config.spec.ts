import { DEV_DEFAULTS, productionProblems, validateEnv } from './env.config';

const STRONG = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:s3cret@db.internal:5432/petai?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  AI_KEY_ENCRYPTION_KEY: 'c1'.repeat(32),
};

describe('validateEnv', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('en desarrollo y tests admite los valores por defecto', () => {
    expect(validateEnv({}).JWT_ACCESS_SECRET).toBe(DEV_DEFAULTS.JWT_ACCESS_SECRET);
    expect(validateEnv({ NODE_ENV: 'test' }).NODE_ENV).toBe('test');
  });

  it('en producción con configuración explícita y fuerte arranca', () => {
    expect(() => validateEnv(STRONG)).not.toThrow();
  });

  it.each([
    ['sin JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: undefined }, 'JWT_ACCESS_SECRET'],
    ['sin JWT_REFRESH_SECRET', { JWT_REFRESH_SECRET: undefined }, 'JWT_REFRESH_SECRET'],
    ['secreto corto', { JWT_ACCESS_SECRET: 'x'.repeat(20) }, 'JWT_ACCESS_SECRET'],
    ['secretos iguales', { JWT_REFRESH_SECRET: 'a'.repeat(40) }, 'distintos'],
    ['sin clave de cifrado de IA', { AI_KEY_ENCRYPTION_KEY: undefined }, 'AI_KEY_ENCRYPTION_KEY'],
    ['sin DATABASE_URL', { DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['SSRF desactivado', { AI_ALLOW_INSECURE_URLS: 'true' }, 'SSRF'],
    ['límite de intentos desactivado', { AUTH_RATE_LIMIT_DISABLED: 'true' }, 'AUTH_RATE_LIMIT_DISABLED'],
  ])('en producción se niega a arrancar: %s', (_name, override, fragment) => {
    const cfg: Record<string, unknown> = { ...STRONG, ...override };
    for (const k of Object.keys(cfg)) if (cfg[k] === undefined) delete cfg[k];
    expect(() => validateEnv(cfg)).toThrow(fragment);
  });

  it('lista todos los problemas a la vez', () => {
    const env = validateEnv({ NODE_ENV: 'development' });
    const problems = productionProblems({ ...env, NODE_ENV: 'production' });
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });

  it('rechaza valores mal formados', () => {
    expect(() => validateEnv({ AI_KEY_ENCRYPTION_KEY: 'corta' })).toThrow('inválida');
    expect(() => validateEnv({ TRUST_PROXY: '-1' })).toThrow('inválida');
    expect(() => validateEnv({ AUTH_REGISTER_MAX_PER_IP: '0' })).toThrow('inválida');
  });
});
