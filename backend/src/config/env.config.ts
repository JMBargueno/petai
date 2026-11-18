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
    // 5173: Vite (desktop) · 4200: Angular (web y panel admin) · tauri: webview de escritorio
    .default('http://localhost:5173,http://127.0.0.1:5173,http://localhost:4200,http://127.0.0.1:4200,tauri://localhost,http://tauri.localhost,https://tauri.localhost'),
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
  // ---- Seguridad (S-02 y S-08 del SDD de auditoría) ----
  // Solo desarrollo/tests: permite webhooks http o hacia destinos privados (anula la protección SSRF de webhooks).
  WEBHOOK_ALLOW_INSECURE: z.enum(['true', 'false']).default('false'),
  // DevKit (S-08): OFF por defecto; exige activación explícita y se rechaza en producción (productionProblems).
  DEVKIT_ENABLED: z.enum(['true', 'false']).default('false'),
  // Token opcional de alta entropía para acceso remoto a /dev/* fuera de loopback.
  DEVKIT_TOKEN: z.string().min(16).optional(),
  // Correos (separados por comas) que el seed / `authz:promote` promueven a superadmin. Solo bootstrap.
  SUPERADMIN_EMAILS: z.string().optional(),
  // ---- Sync offline (S-07 del SDD de auditoría) ----
  // Estado por usuario en Redis con TTL + topes duros; respaldo en memoria acotado si Redis cae.
  SYNC_STATE_TTL_MS: positiveInt(86400000),
  SYNC_MAX_DELTAS: positiveInt(2000),
  SYNC_MAX_SEEN_ACTIONS: positiveInt(1000),
  SYNC_MAX_ARGS_BYTES: positiveInt(4096),
  SYNC_MAX_PETS: positiveInt(100),
  SYNC_ENABLED: z.enum(['true', 'false']).default('true'),
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
  // ---- Actualizaciones de la app de escritorio ----
  // PAT de GitHub (solo lectura de Contents) para leer los releases del repo privado. Sin él no hay updates.
  GITHUB_RELEASES_TOKEN: z.string().optional(),
  GITHUB_RELEASES_REPO: z.string().default('JMBargueno/petai'),
  // ---- Spec-34: Facturación e IA Gestionada ----
  OPENROUTER_API_KEY: z.string().optional(),
  // Endpoint OpenAI-compatible de la IA gestionada (por defecto OpenRouter). Los e2e lo apuntan a un LLM simulado.
  OPENROUTER_BASE_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRODUCT_PRO: z.string().optional(),
  // Respaldo: Price ID fijo de Pro (price_...). Con STRIPE_PRODUCT_PRO el precio lo gestiona el panel
  // (se crea un Price nuevo en Stripe al cambiarlo) y esta variable solo se usa si no hay ninguno.
  STRIPE_PRICE_PRO: z.string().optional(),
  // Google Play Billing: cuenta de servicio (JSON o JSON en base64) con acceso a la Play Developer API.
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().optional(),
  GOOGLE_PLAY_PRODUCT_IDS: z.string().default('pockai_pro_monthly'),
  // RTDN (push de Pub/Sub autenticado): audiencia del token OIDC y cuenta de servicio emisora.
  GOOGLE_RTDN_AUDIENCE: z.string().optional(),
  GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  // Solo desarrollo/tests: acepta webhooks de Stripe sin firma y compras de Play sin verificar.
  // Prohibido en producción (productionProblems).
  BILLING_MOCK_ENABLED: z.enum(['true', 'false']).default('false'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),
  // URL pública de esta API (enlaces de baja de los correos y cabecera List-Unsubscribe). Ej.: https://game-api.pockai.world
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),
  // ---- IA del sistema (tareas internas sin usuario: historias de la aventura diaria) ----
  // Sin AI_SYSTEM_API_KEY se usa OPENROUTER_API_KEY; sin ninguna de las dos, la IA del sistema no llama.
  AI_SYSTEM_API_KEY: z.string().optional(),
  AI_SYSTEM_BASE_URL: z.string().url().optional(),
  // Semilla de BillingConfig.systemAi (después manda el panel de administración)
  AI_SYSTEM_MODEL: z.string().optional(),
  AI_SYSTEM_DAILY_BUDGET_USD: z.coerce.number().min(0).optional(),
  // Zona horaria del bucket diario de historias (por defecto, la de shared/game-data/stories.json)
  STORY_TZ: z.string().optional(),
  // 'false' apaga el generador nocturno de historias (los e2e lo llaman a mano)
  STORY_GENERATOR_ENABLED: z.enum(['true', 'false']).default('true'),
  AI_MANAGED_ENABLED: z.enum(['true', 'false']).default('true'),
  AI_MANAGED_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
  AI_MANAGED_FALLBACK_MODELS: z.string().default('meta-llama/llama-3.3-70b-instruct,deepseek/deepseek-chat'),
  AI_MANAGED_DAILY_BUDGET_USD: z.coerce.number().min(0).default(10),
  AI_MANAGED_MAX_CONCURRENCY: positiveInt(200),
  AI_PLAN_FREE_DAILY: positiveInt(15),
  AI_PLAN_PRO_DAILY: positiveInt(200),
  AI_MONTHLY_TOKEN_QUOTA_FREE: z.coerce.number().int().min(0).default(300000),
  AI_MONTHLY_TOKEN_QUOTA_PRO: z.coerce.number().int().min(0).default(3000000),
  // ---- Correo (recuperación de contraseña, notificaciones y formulario de contacto) ----
  // Sin SMTP_HOST los correos solo se escriben en el log (transporte de consola).
  // La cuenta SMTP es la del buzón de SISTEMA (noreply@): es el remitente de todo lo que envía el backend.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  // true = TLS implícito (465); false = STARTTLS (587).
  SMTP_SECURE: z.enum(['true', 'false']).default('true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Nombre para SNI y verificación del certificado cuando SMTP_HOST es una IP
  // (red interna, p. ej. el contenedor postfix de mailcow): el cert va para el
  // nombre público (p. ej. mail.jmbargueno.com). Opcional; por defecto se usa SMTP_HOST.
  SMTP_TLS_SERVERNAME: z.string().optional(),
  // Remitente de sistema (debe coincidir con SMTP_USER o ser un alias suyo en mailcow).
  MAIL_FROM: z.string().default('Pockai <noreply@pockai.world>'),
  // A dónde van las respuestas de los usuarios a los correos de sistema (vacío = sin Reply-To).
  MAIL_REPLY_TO: z.string().default('contact@pockai.world'),
  // Buzón que RECIBE los mensajes del formulario de contacto (no se usa para enviar).
  CONTACT_TO: z.string().default('contact@pockai.world'),
  // ---- Verificación de correo ----
  // Si es true, las cuentas sin verificar no pueden usar la API (403 EMAIL_NOT_VERIFIED) ni el socket.
  // Despliegue: primero false (se envía el correo pero no se bloquea), publicar escritorio/Android con la
  // pantalla de verificación y después activarlo. Ver docs/DEPLOY.md.
  EMAIL_VERIFICATION_REQUIRED: z.enum(['true', 'false']).default('false'),
  // ---- Nickname obligatorio ----
  // Si es true, las cuentas sin nickname (anteriores a él o creadas desde apps antiguas) reciben
  // 403 HANDLE_REQUIRED hasta elegirlo con POST /me/handle. Mismo despliegue que la verificación de correo.
  HANDLE_REQUIRED: z.enum(['true', 'false']).default('false'),
  // Validez del código y del enlace de verificación (minutos). Por defecto 24 h.
  EMAIL_VERIFICATION_TTL_MINUTES: positiveInt(1440),
  // Secreto para firmar los enlaces de baja de los correos del panel (por defecto se deriva de JWT_ACCESS_SECRET).
  MAIL_UNSUBSCRIBE_SECRET: z.string().min(16).optional(),
  // Envíos del panel: correos por segundo que manda la cola (protege la reputación del servidor SMTP).
  EMAIL_CAMPAIGN_RATE_PER_SECOND: positiveInt(5),
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
  if (env.WEBHOOK_ALLOW_INSECURE === 'true') {
    problems.push('WEBHOOK_ALLOW_INSECURE=true desactiva la protección SSRF de webhooks y no puede usarse en producción');
  }
  if (env.DEVKIT_ENABLED === 'true') {
    problems.push('DEVKIT_ENABLED=true no puede usarse en producción');
  }
  if (env.AUTH_RATE_LIMIT_DISABLED === 'true') {
    problems.push('AUTH_RATE_LIMIT_DISABLED=true no puede usarse en producción');
  }
  if (env.RATE_LIMIT_DISABLED === 'true') {
    problems.push('RATE_LIMIT_DISABLED=true no puede usarse en producción');
  }
  if (env.BILLING_MOCK_ENABLED === 'true') {
    problems.push('BILLING_MOCK_ENABLED=true acepta pagos sin verificar y no puede usarse en producción');
  }
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    problems.push('STRIPE_WEBHOOK_SECRET es obligatorio cuando STRIPE_SECRET_KEY está definido');
  }
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_PRODUCT_PRO && !env.STRIPE_PRICE_PRO) {
    problems.push('STRIPE_PRODUCT_PRO (precio gestionado desde el panel) o STRIPE_PRICE_PRO es obligatorio con STRIPE_SECRET_KEY');
  }
  if (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && (!env.GOOGLE_RTDN_AUDIENCE || !env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL)) {
    problems.push('GOOGLE_RTDN_AUDIENCE y GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL son obligatorios con Google Play activo');
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
    if (!result.data.SMTP_HOST) {
      console.warn('SMTP_HOST no está definido: los correos (recuperación y contacto) solo se escribirán en el log');
    }
    if (result.data.EMAIL_VERIFICATION_REQUIRED !== 'true') {
      console.warn('EMAIL_VERIFICATION_REQUIRED=false: las cuentas sin verificar pueden usar las apps (actívalo cuando escritorio y Android tengan la pantalla de verificación)');
    }
  }
  return result.data;
}
