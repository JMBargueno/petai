import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('v1'),
  DATABASE_URL: z.string().default('postgresql://petai_user:petai_password@localhost:5432/petai_dev?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('default-access-secret-minimum-16-characters'),
  JWT_REFRESH_SECRET: z.string().min(16).default('default-refresh-secret-minimum-16-characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  AI_KEY_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'AI_KEY_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  // Cuota mensual de tokens de IA por usuario (0 = sin límite). BYOK: la key es del usuario; managed: key del servidor.
  AI_MONTHLY_TOKEN_QUOTA_BYOK: z.coerce.number().int().min(0).default(0),
  AI_MONTHLY_TOKEN_QUOTA_MANAGED: z.coerce.number().int().min(0).default(500000),
  // Solo desarrollo/tests: permite baseUrl http o hacia direcciones privadas (anula la protección SSRF)
  AI_ALLOW_INSECURE_URLS: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,tauri://localhost'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    console.error('Configuración de entorno inválida:', result.error.format());
    throw new Error('Configuración de entorno inválida');
  }
  return result.data;
}
