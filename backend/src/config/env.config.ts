import { z } from 'zod';

/** Valores por defecto SOLO para desarrollo: son públicos (están en el repositorio). */
export const DEV_DEFAULTS = {
  DATABASE_URL: 'postgresql://petai_user:petai_password@localhost:5432/petai_dev?schema=public',
  JWT_ACCESS_SECRET: 'default-access-secret-minimum-16-characters',
  JWT_REFRESH_SECRET: 'default-refresh-secret-minimum-16-characters',
  AI_KEY_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
} as const;

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('v1'),
  DATABASE_URL: z.string().default(DEV_DEFAULTS.DATABASE_URL),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default(DEV_DEFAULTS.JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().min(16).default(DEV_DEFAULTS.JWT_REFRESH_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  AI_KEY_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'AI_KEY_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales')
    .default(DEV_DEFAULTS.AI_KEY_ENCRYPTION_KEY),
  // Cuota mensual de tokens de IA por usuario (0 = sin límite). BYOK: la key es del usuario; managed: key del servidor.
  AI_MONTHLY_TOKEN_QUOTA_BYOK: z.coerce.number().int().min(0).default(0),
  AI_MONTHLY_TOKEN_QUOTA_MANAGED: z.coerce.number().int().min(0).default(500000),
  // Solo desarrollo/tests: permite baseUrl http o hacia direcciones privadas (anula la protección SSRF)
  AI_ALLOW_INSECURE_URLS: z.enum(['true', 'false']).default('false'),
  // Orígenes permitidos para CORS y WebSocket (separados por comas)
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost,https://tauri.localhost'),
  // Saltos de proxy de confianza (0 = sin proxy). Necesario para que el límite de intentos use la IP real.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Documentación Swagger: por defecto solo fuera de producción
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  // Límite de intentos de autenticación (en tests está desactivado salvo AUTH_RATE_LIMIT_FORCE=true)
  AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT: positiveInt(10),
  AUTH_LOGIN_MAX_FAILS_PER_IP: positiveInt(100),
  // Fallos sobre una misma cuenta desde cualquier IP (frena ataques repartidos entre muchas direcciones)
  AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT_GLOBAL: positiveInt(50),
  AUTH_LOGIN_WINDOW_MINUTES: positiveInt(15),
  AUTH_REGISTER_MAX_PER_IP: positiveInt(10),
  AUTH_REFRESH_MAX_PER_MINUTE: positiveInt(60),
  AUTH_RATE_LIMIT_DISABLED: z.enum(['true', 'false']).optional(),
  AUTH_RATE_LIMIT_FORCE: z.enum(['true', 'false']).optional(),
  // Límite global de peticiones por minuto, por usuario autenticado o por IP (en tests, desactivado salvo RATE_LIMIT_FORCE=true)
  RATE_LIMIT_PER_MINUTE: positiveInt(300),
  RATE_LIMIT_DISABLED: z.enum(['true', 'false']).optional(),
  RATE_LIMIT_FORCE: z.enum(['true', 'false']).optional(),
  // ---- Observabilidad (OpenTelemetry) ----
  // Sin OTEL_EXPORTER_OTLP_ENDPOINT el SDK no se arranca (observabilidad desactivada de forma segura).
  OTEL_SERVICE_NAME: z.string().default('petai-backend'),
  OTEL_SERVICE_VERSION: z.string().default('0.1.0'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['grpc', 'http']).default('grpc'),
  OTEL_TRACES_SAMPLER: z.string().default('parentbased_traceidratio'),
  // 1.0 en desarrollo; 10–20% en producción (FR-013).
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1.0),
  // 'prometheus' => las métricas las expone prom-client (no se envían por OTLP).
  OTEL_METRICS_EXPORTER: z.string().default('prometheus'),
  // Puerto del servidor de métricas (aislado del 3000). 0 = puerto efímero (tests).
  METRICS_PORT: z.coerce.number().int().min(0).default(9464),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * En producción el servidor se niega a arrancar si algún secreto es el valor público de desarrollo
 * (cualquiera podría falsificar tokens o descifrar las keys de IA guardadas) o si hay opciones que
 * desactivan protecciones.
 */
export function productionProblems(env: EnvConfig): string[] {
  const problems: string[] = [];
  const isDefault = (k: keyof typeof DEV_DEFAULTS) => env[k] === DEV_DEFAULTS[k];

  if (isDefault('JWT_ACCESS_SECRET') || env.JWT_ACCESS_SECRET.length < 32) {
    problems.push('JWT_ACCESS_SECRET debe definirse explícitamente con al menos 32 caracteres (no el valor por defecto)');
  }
  if (isDefault('JWT_REFRESH_SECRET') || env.JWT_REFRESH_SECRET.length < 32) {
    problems.push('JWT_REFRESH_SECRET debe definirse explícitamente con al menos 32 caracteres (no el valor por defecto)');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos');
  }
  if (isDefault('AI_KEY_ENCRYPTION_KEY')) {
    problems.push('AI_KEY_ENCRYPTION_KEY debe definirse explícitamente (64 hex); el valor por defecto es público');
  }
  if (isDefault('DATABASE_URL')) {
    problems.push('DATABASE_URL debe definirse explícitamente (la URL por defecto lleva credenciales públicas)');
  }
  if (env.AI_ALLOW_INSECURE_URLS === 'true') {
    problems.push('AI_ALLOW_INSECURE_URLS=true desactiva la protección SSRF y no puede usarse en producción');
  }
  if (env.AUTH_RATE_LIMIT_DISABLED === 'true') {
    problems.push('AUTH_RATE_LIMIT_DISABLED=true no puede usarse en producción');
  }
  if (env.RATE_LIMIT_DISABLED === 'true') {
    problems.push('RATE_LIMIT_DISABLED=true no puede usarse en producción');
  }
  return problems;
}

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('Configuración de entorno inválida:', result.error.format());
    throw new Error('Configuración de entorno inválida');
  }
  if (result.data.NODE_ENV === 'production') {
    const problems = productionProblems(result.data);
    if (problems.length > 0) {
      const message = `Configuración insegura para producción:\n - ${problems.join('\n - ')}`;
      console.error(message);
      throw new Error(message);
    }
  }
  return result.data;
}
