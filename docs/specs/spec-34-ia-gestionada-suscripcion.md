# Spec: IA gestionada (Pockai AI) + Suscripción Pro

## ID
34 — Monetización de la IA. Cierra el pendiente de `docs/ROADMAP.md`: *"Modo suscripción (key gestionada por el servidor)"*.

## Resumen
Además del modo **BYOK** (el usuario pone su propia API key), Pockai ofrecerá **su propia IA** ("IA de Pockai", modo `managed`) servida con una key del servidor a través de **OpenRouter**, con un modelo **freemium**:

| Plan | Precio | Mensajes IA / día | Mensaje máx. | Quién paga los tokens |
|---|---|---|---|---|
| **Free** (managed) | 0 € | 15 | 240 caracteres | Nosotros |
| **Pro** (managed) | 9,99 $/mes | 200 | 240 caracteres | Nosotros (cubierto por la suscripción) |
| **BYOK** | 0 € | Sin límite diario (solo rate limit 20/min) | 1.000 caracteres | El usuario |
| **Hermes local** | 0 € | Sin límite diario | 1.000 caracteres | El usuario (su máquina) |

La suscripción se cobra con **Stripe** (escritorio/web) y **Google Play Billing** (Android). Ambas fuentes alimentan un único **entitlement** en el backend. Antes de llamar al modelo, el backend valida el plan y un contador diario atómico en Redis.

> **Todos los precios y límites son configurables desde el panel de administración**, y solo el rol **superadmin** puede cambiarlos (permiso nuevo `billing:manage`). Las cifras de esta spec (15/200 mensajes, 240 caracteres, 9,99 $…) son **valores por defecto**, no constantes. Ver §11.

## Contexto

### Lo que ya existe
- **Chat en el servidor**: `POST /pets/:id/chat` (SSE) en `backend/src/modules/ai/ai.controller.ts`. El flujo es `ChatService.prepare` → `run` en `chat.service.ts`: sanea la entrada, aplica el rate limit de 20 mensajes/min (Redis con respaldo en memoria), modera, resuelve el proveedor, comprueba la cuota y construye el contexto (personalidad + entorno + recuerdos + historial). Después hace streaming con `OutputGuard` y guarda en `ChatMessage`.
- **BYOK**: `AiConfigService` (`ai-config.service.ts`) guarda `baseUrl`, `model` y la key cifrada con AES-256-GCM (`KeyCryptoService`, ligada al `userId`). `resolveProvider` descifra la key en memoria y crea un `OpenAiCompatibleProvider` con protección SSRF (`pinnedFetch`).
- **Cuota mensual de tokens**: `UsageService` (`usage.service.ts`) usa la tabla `AiUsage` (por mes). Existe `AI_MONTHLY_TOKEN_QUOTA_MANAGED` (por defecto 500k), pero **nadie escribe nunca `mode: 'managed'`**: el modo es solo un hueco preparado.
- **Hermes local**: el cliente llama a su modelo en `127.0.0.1:8642`. El backend solo construye el contexto (`/chat/local/context`) y guarda el resultado (`/chat/local/sync`) por una ruta propia que no usa `resolveProvider`.
- **Módulo `ai-router/`** (spec-19): está registrado en `app.module.ts`, pero el chat no lo usa y está fijado a `OPENAI_API_KEY`.

### Lo que falta
- La rama `managed` real (key del servidor).
- Un modelo de suscripciones y la integración con pasarelas de pago (hoy no hay ninguna; solo coins/gems en `wallet.service.ts`).
- La cuota **diaria** por mensajes, el presupuesto global de gasto y la UI de planes y paywall.
- Actualizar la landing: `web/src/app/landing/content.ts` dice "sin suscripción" y "IA solo BYOK".

## Objetivos
- Que cualquier usuario nuevo pueda hablar con su mascota **sin configurar nada** (managed Free por defecto).
- Coste de IA por usuario Free acotado y predecible, con un tope de gasto global diario.
- Margen positivo por usuario Pro incluso en el peor caso (200 mensajes/día todos los días).
- BYOK y Hermes local siguen funcionando igual que hoy.
- Una sola fuente de verdad del plan (`EntitlementService`), venga el pago de Stripe o de Google Play.

## User Stories
- Como jugador nuevo, quiero chatear con mi mascota nada más instalar, sin buscar una API key.
- Como jugador Free, quiero ver cuántos mensajes me quedan hoy y cuándo se renuevan.
- Como jugador, quiero hacerme Pro desde el escritorio o desde Android y que se active al momento.
- Como jugador Pro, quiero gestionar o cancelar mi suscripción (portal de Stripe o Play Store).
- Como jugador avanzado, quiero seguir usando mi propia key sin límites diarios.
- Como operador, quiero ver el gasto diario de IA y cortarlo automáticamente si se dispara.

## Criterios de aceptación
- [ ] AC1: Un usuario sin `AiConfig` chatea en modo managed Free sin configurar nada.
- [ ] AC2: El mensaje 16 del día de un usuario Free devuelve `429` con `code: "daily_quota_exceeded"`, `plan`, `limit` y `resetsAt`, y no llama al proveedor.
- [ ] AC3: Un usuario Pro activo tiene 200 mensajes/día. Al expirar, cancelar o tras un reembolso vuelve a Free (con gracia en pagos fallidos, ver §2).
- [ ] AC4: El contador diario es atómico (sin carreras con N peticiones simultáneas) y se reinicia a medianoche en la zona horaria del usuario.
- [ ] AC5: Si el proveedor falla antes de emitir texto, el mensaje se devuelve al contador (`refund`).
- [ ] AC6: En managed, la entrada se limita a 240 caracteres y la salida a un `maxTokens` corto. En BYOK y Hermes se mantienen los límites actuales.
- [ ] AC7: Los webhooks de Stripe y las notificaciones de Play son idempotentes (`BillingEvent.eventId` único) y verifican la firma o el token.
- [ ] AC8: Al superar `AI_MANAGED_DAILY_BUDGET_USD`, managed responde `503 managed_ai_paused` para Free (Pro sigue hasta el multiplicador configurado, 1,5× por defecto) y BYOK no se ve afectado.
- [ ] AC9: El cliente de escritorio refleja el paso a Pro sin reiniciar (evento por socket + nueva consulta al recuperar el foco).
- [ ] AC10: `GET /ai/usage` devuelve también `plan`, `daily.used`, `daily.limit` y `daily.resetsAt`.
- [ ] AC11: Todos los límites y precios de §11.2 se editan desde el panel admin. Los cambios de límites se aplican en todas las instancias en ≤ 5 s sin redesplegar.
- [ ] AC12: Solo `superadmin` puede leer y editar la configuración de facturación e IA. `admin` y `moderator` reciben `403` y no ven la sección en el panel.
- [ ] AC13: Cada cambio queda en `AuditLog` (quién, cuándo, valor anterior y nuevo) y se puede revertir a una versión anterior.
- [ ] AC14: Cambiar el precio de Pro crea un precio nuevo en Stripe y en Play. Los suscriptores actuales conservan su precio salvo migración explícita (§11.3).

---

## 1. Decisiones de diseño

| Tema | Decisión |
|---|---|
| Usuario sin `AiConfig` | Pasa a ser **managed Free** por defecto. Configurar una key = BYOK; borrarla (`DELETE /ai/config`) = vuelta a managed. |
| Ruta del modo managed | Va por `AiConfigService.resolveProvider` (rama nueva), **no** por `ai-router/`. `ai-router` se marca como deprecado; si en el futuro hace falta routing multi-proveedor, se absorbe en esta rama. Así no conviven dos caminos. |
| Proveedor | **OpenRouter** (`https://openrouter.ai/api/v1`). Es OpenAI-compatible, así que se reutiliza `OpenAiCompatibleProvider` tal cual. El fallback entre modelos se hace con el parámetro `models` de OpenRouter. |
| Cuota mensual de tokens | Se **mantiene** `AI_MONTHLY_TOKEN_QUOTA_MANAGED` como tope de seguridad por usuario (cubre sesiones con muchas herramientas). Se fija por plan desde el panel admin (§11). |
| Llamadas "ocultas" | El resumen de memoria (`MemoryService.maybeSummarize`) y las rondas extra de herramientas (hasta 3) **cuentan en coste y en el presupuesto global**, pero **no** en el contador de mensajes del usuario. |
| Memoria y agente por plan | Free: memoria limitada (recuperación sí, extracción cada 12 mensajes en vez de 6) y **sin herramientas de agente**. Pro: todo, como hoy en BYOK. |
| Hermes local | Se trata como BYOK: sin cuota diaria y sin límite de 240 caracteres. La cuota diaria se aplica **solo** dentro de `prepare()` en la rama managed, nunca en `localContext/sync`. |
| Stripe + Play a la vez | Un único entitlement (`pro` si cualquiera de las dos está activa). Si se detectan las dos activas, se avisa al usuario del doble cobro con enlaces al portal de Stripe o a Play para cancelar una. |
| Reset diario | Medianoche en `User.timezone` (ya existe; por defecto `UTC`). La clave Redis lleva la fecha local. |
| Configuración de precios y límites | En base de datos (`BillingConfig`, versionada), editable desde el panel admin **solo por superadmin**. Las variables de entorno son solo los valores iniciales (seed) y los secretos. Ver §11. |

## 2. Planes y reglas de negocio

### 2.1 Límites por plan

| Límite | Free | Pro | BYOK / Hermes |
|---|---|---|---|
| Mensajes IA/día | 15 | 200 | ∞ |
| Rate limit | 20/min | 20/min | 20/min |
| Caracteres por mensaje (entrada) | 240 | 240 | 1.000 |
| `maxTokens` salida (respuesta) | 120 | 160 | 1.200 (actual) |
| Historial enviado al modelo | 6 mensajes / 1.500 chars | 10 mensajes / 3.000 chars | 20 / 6.000 (actual) |
| Memoria a largo plazo | Recuperación + extracción cada 12 msg | Completa | Completa |
| Herramientas de agente | No | Sí | Sí |
| Tope tokens/mes (seguridad) | 300k | 3M | ∞ |

> El brief original hablaba de ~240 caracteres ≈ 50-60 tokens por interacción. Eso solo cuenta el texto del usuario y la respuesta. El **system prompt** de Pockai (`personality.ts`: personalidad, estado, entorno, recuerdos) más el historial pesan bastante más, así que en §6 se calcula con valores realistas.

Estos valores son **los de por defecto**. En ejecución se leen de `BillingConfig` (base de datos + caché) y el superadmin los cambia desde el panel admin (§11). En código (`backend/src/modules/billing/plans.ts`) solo queda el esquema de validación y el seed inicial.

### 2.2 Ciclo de vida de la suscripción

| Evento | Efecto en el entitlement |
|---|---|
| Pago inicial correcto | `pro` inmediato hasta `currentPeriodEnd`. |
| Renovación correcta | Se extiende `currentPeriodEnd`. |
| Cancelación por el usuario | Sigue `pro` hasta `currentPeriodEnd` (`cancelAtPeriodEnd = true`) y luego `free`. |
| Pago fallido | Estado `past_due`. **Gracia de 3 días** (configurable, §11) con `pro` (Stripe Smart Retries; en Play, *grace period* configurado en la consola). Si no se recupera, pasa a `free`. |
| Reembolso / chargeback / revocación en Play | `free` inmediato. |
| Cambio de plan a mitad de día | Se aplica el nuevo límite al contador del día actual (si ya gastó 15 y pasa a Pro, le quedan 185). |

## 3. Arquitectura y flujo de datos

### 3.1 Chat

```
┌──────────────────────────┐
│ Cliente Tauri / Android  │  POST /pets/:id/chat  (SSE)
└────────────┬─────────────┘
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ NestJS · AiController                                                │
│  JwtAuthGuard                                                        │
│  ChatService.prepare()                                               │
│   1. sanitizeInput (límite según modo: 240 managed / 1000 BYOK)      │
│   2. checkRateLimit (Redis, 20/min)                    [existente]   │
│   3. moderateInput                                     [existente]   │
│   4. AiConfigService.resolveProvider(userId)                         │
│        ├─ sin config / mode=managed ──► rama MANAGED                 │
│        └─ mode=byok ──► key del usuario (como hoy)                   │
│   5. si MANAGED:                                                     │
│        EntitlementService.planFor(userId) ──► free | pro  (Redis 60s)│
│        ManagedBudgetService.assertOpen(plan)   (gasto global del día)│
│        DailyQuotaService.consume(userId, plan) (Lua INCR atómico)    │
│   6. UsageService.assertWithinQuota (tope mensual)     [existente]   │
│   7. buildContext (historial recortado según plan)                   │
└────────────┬─────────────────────────────────────────────────────────┘
             ▼
┌──────────────────────────────┐   models: [primario, fallback1, …]
│ OpenAiCompatibleProvider     │ ─────────────────────────────────────►  OpenRouter
│ (baseUrl OpenRouter, key srv)│ ◄───────────────── stream ───────────   (Gemini Flash, …)
└────────────┬─────────────────┘
             ▼
  ChatService.run(): OutputGuard → eventos SSE → persistExchange
  UsageService.record(tokens, costUsd) · ManagedBudgetService.add(costUsd)
  si falla antes del primer delta → DailyQuotaService.refund()
```

### 3.2 Pagos

```
ESCRITORIO / WEB                               ANDROID
─────────────────                              ───────
AiTab "Hazte Pro"                              Play Billing Library (launchBillingFlow)
  │ POST /billing/stripe/checkout                │ purchaseToken
  ▼                                              ▼
Stripe Checkout (navegador del sistema)        POST /billing/google/verify
  │                                              │ Android Publisher API (subscriptionsv2.get)
  ▼                                              │ + acknowledge
Stripe ──webhook──► POST /billing/stripe/webhook │
                          │                      │   Google RTDN ─► Pub/Sub ─► POST /billing/google/rtdn
                          ▼                      ▼
                   BillingService.upsertSubscription()  (idempotente: BillingEvent)
                          │
                          ├─► Subscription (PostgreSQL)
                          ├─► invalida petai:ai:entitlement:{userId}
                          └─► RealtimeGateway.emitToUser('entitlement:updated', {plan})
```

El portal de cliente de Stripe (`POST /billing/stripe/portal`) sirve para cancelar o cambiar de tarjeta. En Android se abre la pantalla de suscripciones de Play.

## 4. Modelo de datos

### 4.1 Prisma (nuevo)

```prisma
model Subscription {
  id                String    @id @default(uuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  source            String    // stripe | google_play
  externalId        String    // sub_xxx (Stripe) | purchaseToken (Play)
  productId         String    // price_xxx | pockai_pro_monthly
  plan              String    @default("pro")
  status            String    // active | trialing | past_due | canceled | expired | revoked
  currentPeriodEnd  DateTime
  cancelAtPeriodEnd Boolean   @default(false)
  graceUntil        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([source, externalId])
  @@index([userId, status])
}

/// Idempotencia y auditoría de eventos de pago (webhooks Stripe, RTDN Play).
model BillingEvent {
  id          String   @id @default(uuid())
  source      String   // stripe | google_play
  eventId     String   // evt_xxx | messageId de Pub/Sub
  type        String
  userId      String?
  payloadHash String   // SHA-256; nunca se guarda el payload con datos de tarjeta
  processedAt DateTime @default(now())

  @@unique([source, eventId])
}
```

### 4.2 Cambios en modelos existentes

```prisma
model User {
  // …
  stripeCustomerId String?        @unique
  emailVerifiedAt  DateTime?      // requisito para managed Free (antiabuso, §8)
  subscriptions    Subscription[]
}

model AiConfig {
  // mode: "managed" pasa a escribirse de verdad. En managed, encryptedKey/baseUrl/model quedan a null.
}

model AiUsage {
  // Ya tiene provider, costUsd y cacheHits: UsageService.record pasa a rellenar costUsd.
}
```

**Migración**: no hace falta tocar datos. Los usuarios con `AiConfig` siguen siendo BYOK; los que no tienen fila pasan automáticamente a managed Free.

### 4.3 Claves Redis

| Clave | Tipo | TTL | Uso |
|---|---|---|---|
| `petai:ai:daily:{userId}:{YYYY-MM-DD}` | int | 48 h | Mensajes managed del día (fecha local del usuario) |
| `petai:ai:entitlement:{userId}` | string `free\|pro` | 60 s | Caché del plan efectivo |
| `petai:ai:managed:spend:{YYYY-MM-DD}` | float (micro-USD como int) | 48 h | Gasto global managed del día (UTC) |
| `petai:ai:managed:circuit` | string | 60 s | Circuit breaker si OpenRouter falla de forma continuada |

Si Redis no está disponible, la cuota diaria cae a un contador en PostgreSQL (`AiDailyUsage`, opcional) o, como mínimo, a memoria por instancia (mismo patrón que `checkRateLimit`). **Nunca falla en abierto para el plan Free.**

## 5. Implementación clave (TypeScript)

Los fragmentos son ilustrativos y siguen el estilo del módulo `ai/` actual.

### 5.1 Planes

```ts
// backend/src/modules/billing/plans.ts
export type Plan = 'free' | 'pro';

export interface PlanLimits {
  dailyMessages: number;
  maxInputChars: number;
  maxOutputTokens: number;
  historyMessages: number;
  historyCharBudget: number;
  agentTools: boolean;
  memoryExtractEvery: number;
}

/** Solo valores iniciales (seed de BillingConfig). En ejecución: `await billingConfig.limits(plan)` (§11). */
export const DEFAULT_PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { dailyMessages: 15,  maxInputChars: 240, maxOutputTokens: 120, historyMessages: 6,  historyCharBudget: 1500, agentTools: false, memoryExtractEvery: 12 },
  pro:  { dailyMessages: 200, maxInputChars: 240, maxOutputTokens: 160, historyMessages: 10, historyCharBudget: 3000, agentTools: true,  memoryExtractEvery: 6 },
};
```

### 5.2 Cuota diaria atómica

```ts
// backend/src/modules/billing/daily-quota.service.ts
const CONSUME_LUA = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
if used > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return -1
end
return used`;

@Injectable()
export class DailyQuotaService {
  constructor(private readonly redis: RedisService, private readonly prisma: PrismaService, private readonly billingConfig: BillingConfigService) {}

  /** Fecha local del usuario (YYYY-MM-DD) y momento del próximo reset. */
  private async day(userId: string) {
    const { timezone } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(new Date());
    return { key: `petai:ai:daily:${userId}:${local}`, resetsAt: nextLocalMidnight(timezone) };
  }

  async consume(userId: string, plan: Plan) {
    const limit = (await this.billingConfig.limits(plan)).dailyMessages; // configurable (§11)
    const { key, resetsAt } = await this.day(userId);
    const used = Number(await this.redis.client.eval(CONSUME_LUA, 1, key, limit));
    if (used < 0) {
      throw new HttpException(
        { code: 'daily_quota_exceeded', plan, limit, resetsAt, message: 'Has usado todos tus mensajes de hoy.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return { used, limit, resetsAt, key };
  }

  /** Devuelve el mensaje si el proveedor falló antes de responder. */
  async refund(key: string) {
    await this.redis.client.eval(`if redis.call('GET', KEYS[1]) and tonumber(redis.call('GET', KEYS[1])) > 0 then return redis.call('DECR', KEYS[1]) end return 0`, 1, key);
  }

  async peek(userId: string, plan: Plan) {
    const { key, resetsAt } = await this.day(userId);
    return { used: Number((await this.redis.client.get(key)) ?? 0), limit: (await this.billingConfig.limits(plan)).dailyMessages, resetsAt };
  }
}
```

### 5.3 Entitlement

```ts
// backend/src/modules/billing/entitlement.service.ts
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async planFor(userId: string): Promise<Plan> {
    const cacheKey = `petai:ai:entitlement:${userId}`;
    const cached = await this.redis.client.get(cacheKey).catch(() => null);
    if (cached === 'free' || cached === 'pro') return cached;

    const now = new Date();
    const active = await this.prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: now } },
          { status: 'canceled', cancelAtPeriodEnd: true, currentPeriodEnd: { gt: now } },
          { status: 'past_due', graceUntil: { gt: now } },
        ],
      },
      select: { id: true },
    });
    const plan: Plan = active ? 'pro' : 'free';
    await this.redis.client.set(cacheKey, plan, 'EX', 60).catch(() => undefined);
    return plan;
  }

  async invalidate(userId: string) {
    await this.redis.client.del(`petai:ai:entitlement:${userId}`).catch(() => undefined);
  }
}
```

### 5.4 Rama managed en `AiConfigService.resolveProvider`

```ts
// ai-config.service.ts — resolveProvider()
const cfg = await this.prisma.aiConfig.findUnique({ where: { userId } });

// Sin config o mode=managed → IA de Pockai (key del servidor)
if (!cfg || cfg.mode === 'managed') {
  const apiKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY');
  const provider = new OpenAiCompatibleProvider(
    'https://openrouter.ai/api/v1',
    apiKey,
    fetch, // URL fija y de confianza: no necesita pinnedFetch/SSRF
    {
      extraHeaders: { 'HTTP-Referer': 'https://pockai.app', 'X-Title': 'Pockai' },
      extraBody: { models: this.managedFallbackModels() }, // fallback nativo de OpenRouter
    },
  );
  return { provider, model: this.managedModel(), mode: 'managed' as const };
}

// … rama BYOK actual sin cambios
```

`OpenAiCompatibleProvider` necesita un 4.º parámetro opcional (`extraHeaders`, `extraBody`) para enviar `models` y las cabeceras de atribución. También debe leer `usage` del último chunk de streaming (`stream_options: { include_usage: true }`) para calcular el coste real.

### 5.5 Cambios en `ChatService.prepare` y `run`

```ts
const { provider, model, mode } = await this.aiConfig.resolveProvider(userId);

let limits: PlanLimits | undefined;
let quotaKey: string | undefined;
if (mode === 'managed') {
  const plan = await this.entitlements.planFor(userId);
  limits = await this.billingConfig.limits(plan);   // leído de BillingConfig (caché en memoria, §11)
  if (message.length > limits.maxInputChars) {
    throw new BadRequestException({ code: 'message_too_long', max: limits.maxInputChars });
  }
  await this.budget.assertOpen(plan);                // kill-switch global (§7)
  quotaKey = (await this.dailyQuota.consume(userId, plan)).key;
}
await this.usage.assertWithinQuota(userId, mode);   // tope mensual (existente)

const { messages, timeZone, now } = await this.buildContext(userId, pet, message, 'agent', limits);
const agentCtx = (pet.intelligence ?? 0) >= AGENT_UNLOCK && (limits?.agentTools ?? true) ? { … } : undefined;

return { events: this.run(userId, pet, message, messages, provider, model, mode, signal, agentCtx, limits, quotaKey) };
```

En `run()`:
- `maxTokens: limits?.maxOutputTokens ?? 1200`.
- Si se lanza error **antes del primer `delta`** y existe `quotaKey`, se llama a `dailyQuota.refund(quotaKey)`.
- Al terminar: `usage.record(userId, tokens, costUsd)` y `budget.add(costUsd)`.
- `sanitizeInput` sigue con `MAX_MESSAGE_CHARS = 1000` como tope duro. El límite de 240 se aplica solo en la rama managed. **`localContext`/`localSync` (Hermes) no se tocan.**
- El cliente debe validar los 240 caracteres antes de enviar (`maxlength` dinámico), pero el servidor es la autoridad.

### 5.6 Webhook de Stripe

```ts
// backend/src/modules/billing/stripe.controller.ts
@Controller('billing/stripe')
export class StripeController {
  constructor(private readonly stripe: Stripe, private readonly billing: BillingService, private readonly config: ConfigService) {}

  @Post('checkout') @UseGuards(JwtAuthGuard)
  async checkout(@CurrentUser() user: AuthUser) {
    const customer = await this.billing.ensureStripeCustomer(user.id);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: await this.billingConfig.activeStripePrice(currency), quantity: 1 }], // precio vigente (§11.3)
      client_reference_id: user.id,
      success_url: `${this.config.get('PUBLIC_WEB_URL')}/pro/ok`,
      cancel_url: `${this.config.get('PUBLIC_WEB_URL')}/pro/cancel`,
      automatic_tax: { enabled: true },
    });
    return { url: session.url };
  }

  @Post('webhook') @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    const event = this.stripe.webhooks.constructEvent(req.rawBody!, sig, this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'));
    if (!(await this.billing.claimEvent('stripe', event.id, event.type))) return { ok: true }; // ya procesado

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.billing.syncStripeSubscription(event); // vuelve a leer la sub de Stripe (fuente de verdad)
        break;
      case 'invoice.payment_failed':
        await this.billing.markPastDue(event);
        break;
      case 'charge.refunded':
      case 'charge.dispute.created':
        await this.billing.revokeFromCharge(event);
        break;
    }
    return { ok: true };
  }
}
```

- `main.ts`: `NestFactory.create(AppModule, { rawBody: true })` para que `constructEvent` reciba el cuerpo sin parsear.
- El webhook **no** lleva `JwtAuthGuard` y queda excluido del throttler global. Se autentica solo por la firma.
- `syncStripeSubscription` hace `upsert` de `Subscription` por `(source, externalId)`, llama a `entitlements.invalidate(userId)` y emite `realtime.emitToUser(userId, 'entitlement:updated', { plan })`.

### 5.7 Google Play

```ts
@Post('billing/google/verify') @UseGuards(JwtAuthGuard)
async verify(@CurrentUser() user: AuthUser, @Body() body: { purchaseToken: string; productId: string }) {
  const sub = await this.play.purchases.subscriptionsv2.get({ packageName: PKG, token: body.purchaseToken });
  // Comprobar que obfuscatedExternalAccountId === hash(user.id) para que no se reutilice un token ajeno
  await this.billing.upsertPlaySubscription(user.id, body.purchaseToken, sub.data);
  if (sub.data.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
    await this.play.purchases.subscriptions.acknowledge({ packageName: PKG, subscriptionId: body.productId, token: body.purchaseToken });
  }
  return { plan: await this.entitlements.planFor(user.id) };
}

@Post('billing/google/rtdn')  // push de Pub/Sub, autenticado con el JWT OIDC de Google
async rtdn(@Body() msg: PubSubPush) { /* decodificar, claimEvent, volver a leer subscriptionsv2 y sincronizar */ }
```

## 6. Costes

### 6.1 Tokens reales por interacción (managed)

| Parte | Tokens aprox. |
|---|---|
| System prompt (personalidad + estado + entorno) | 350–500 |
| Recuerdos recuperados (si la mascota los tiene desbloqueados) | 0–150 |
| Historial (6–10 mensajes cortos) | 150–400 |
| Mensaje del usuario (≤240 chars) | ~60 |
| **Entrada total** | **~600–1.100** |
| Salida (≤120–160 tokens) | ~60–160 |
| Resumen de memoria (1 de cada 6–12 mensajes, ~1.500 in / 200 out) | prorrateado ~150 in / 20 out |

Para el presupuesto se usa **~1.000 tokens de entrada + ~150 de salida por mensaje**.

### 6.2 Fórmula

```
coste_msg  = 1.000 × P_in / 1e6  +  150 × P_out / 1e6
coste_día  = DAU × msg_por_usuario × coste_msg
```

**Ejemplo** con un modelo barato de OpenRouter del tipo *Flash-Lite / Mini* (orden de magnitud: P_in ≈ 0,10 $/M y P_out ≈ 0,40 $/M; **verificar precios vigentes en openrouter.ai/models antes de lanzar**):

`coste_msg ≈ 0,0001 + 0,00006 = 0,00016 $`

| Escenario | Mensajes/día | Coste/día | Coste/mes (30 d) |
|---|---|---|---|
| 1.000 DAU Free, uso medio (8 msg) | 8.000 | 1,28 $ | ~38 $ |
| 1.000 DAU Free, peor caso (15 msg) | 15.000 | 2,40 $ | ~72 $ |
| 1 usuario Pro, peor caso (200 msg × 30 d) | 6.000/mes | — | **~0,96 $** |
| 100 Pro peor caso + 1.000 Free peor caso | 35.000 | 5,60 $ | ~168 $ |

### 6.3 Margen Pro

| Canal | Precio | Comisión | Neto aprox. | Coste IA peor caso | Margen peor caso |
|---|---|---|---|---|---|
| Stripe | 9,99 $ | ~2,9 % + 0,30 $ (+ IVA si aplica) | ~9,40 $ | ~1 $ | ~8,4 $ |
| Google Play | 9,99 $ | 15 % (suscripciones) | ~8,49 $ | ~1 $ | ~7,5 $ |

Hay mucho margen, así que se puede subir de modelo en Pro sin romper la economía. **Lo que hay que vigilar es el coste del Free** (adquisición), no el de Pro.

## 7. Optimización de costes y resiliencia

1. **Prompt caching del proveedor**: ordenar el system prompt para que la parte **estable** (personalidad de la especie, reglas, formato) vaya primero y sea idéntica entre peticiones, y la parte variable (estado, entorno, recuerdos, historial) vaya después. Los proveedores con caché implícita (Gemini, OpenAI, DeepSeek vía OpenRouter) cobran menos por el prefijo repetido.
2. **Historial corto + resumen**: el historial ya se recorta por presupuesto de caracteres. En managed se reduce más (§2.1) y se apoya en `MemoryService` (resúmenes) para mantener la coherencia.
3. **`maxTokens` bajo** y un system prompt que pida respuestas de 1–2 frases (la mascota "habla corto", lo que además encaja con la burbuja flotante).
4. **Fallback de modelos**: `models: [primario, alternativo1, alternativo2]` en OpenRouter. Si el primario da 429/5xx/timeout, OpenRouter reintenta con el siguiente sin que lo note el cliente.
5. **Timeouts**: 10 s hasta el primer token. Si se superan, se aborta (`AbortSignal`), se emite `error` y se ejecuta `refund` del mensaje.
6. **Circuit breaker**: tras 5 fallos seguidos en 60 s, se marca `petai:ai:managed:circuit` y durante 60 s se responde `503 managed_ai_unavailable` sin llamar al proveedor. El cliente muestra "La IA de Pockai está descansando, vuelve en un momento" y, si el usuario tiene BYOK o Hermes, le ofrece usarlo.
7. **Kill-switch de presupuesto global**: `ManagedBudgetService` suma el `costUsd` de cada llamada en `petai:ai:managed:spend:{día}`. Si supera `AI_MANAGED_DAILY_BUDGET_USD`, se pausa el Free; Pro sigue hasta 1,5×. Se envía una alerta (log `warn` + métrica OTel `ai.managed.spend_usd`).
8. **Backpressure en picos**: semáforo global de streams managed concurrentes (`AI_MANAGED_MAX_CONCURRENCY`, p. ej. 200) en Redis. Si está lleno, se devuelve `503` con `Retry-After: 2`, y el cliente reintenta una vez con jitter. No se encola en el servidor porque es chat interactivo.
9. **Sin caché semántica en v1**: las respuestas dependen del estado de la mascota, así que el ahorro sería bajo y el riesgo de incoherencia alto. Se puede retomar desde spec-19 si los datos lo justifican.

## 8. Antiabuso

| Medida | Estado |
|---|---|
| Rate limit 20 msg/min por usuario (Redis) | Existente |
| Una respuesta en curso por usuario (`ExclusiveLockService`) | Existente |
| Moderación de entrada y salida | Existente |
| Cuota diaria por plan (Lua atómico) | **Nuevo** |
| Tope mensual de tokens por plan | Existente (se ajusta por plan) |
| **Email verificado** para usar managed Free (evita granjas de cuentas) | **Nuevo**. Mientras no esté verificado: 3 mensajes de prueba. |
| Throttle de registro por IP + códigos de invitación existentes | Revisar los límites actuales de `auth` |
| Límite de cuentas managed Free por dispositivo (`DeviceLink`) | Opcional v2 |
| Presupuesto global diario + circuit breaker | **Nuevo** (§7) |
| Webhooks: firma Stripe / OIDC de Pub/Sub, idempotencia `BillingEvent` | **Nuevo** |
| Logs: nunca el prompt completo (hash SHA-256), nunca datos de tarjeta | Política existente (spec-19) |

## 9. Clientes

### 9.1 Escritorio (`desktop/src/components/AiTab.svelte`, `desktop/src/lib/api.ts`)
- **Selector de modo**: "IA de Pockai" (por defecto) / "Mi propia API key" / "Hermes local". Al elegir Pockai se llama a `DELETE /ai/config` (o a un nuevo `PUT /ai/config { mode: 'managed' }`).
- **Contador**: "Te quedan 9 de 15 mensajes hoy · se renuevan a las 00:00", leído de `GET /ai/usage`, que se amplía con `plan` y `daily`.
- **`maxlength` dinámico** del input: 240 en managed y 1000 en BYOK/Hermes, con contador de caracteres.
- **Paywall**: al recibir `429 daily_quota_exceeded`, la tarjeta "Hazte Pro (200 mensajes/día) · o usa tu propia key gratis".
- **Comprar**: `POST /billing/stripe/checkout` → abrir `url` con `@tauri-apps/plugin-shell` `open()` en el navegador del sistema.
- **Detectar el paso a Pro**: escuchar `entitlement:updated` en el socket existente y, como respaldo, volver a pedir `GET /billing/entitlement` en el evento `focus` de la ventana.
- **Gestionar**: botón "Gestionar suscripción" → `POST /billing/stripe/portal` → abrir la URL.
- Regenerar los tipos OpenAPI (`shared/openapi`).

### 9.2 Android (`mobile/android/.../ui/chat/ChatViewModel.kt`, `data/ApiService.kt`)
- Play Billing Library (v7+). Producto de suscripción `pockai_pro_monthly` con base plan mensual y `setObfuscatedAccountId(hash(userId))`.
- Tras la compra: `POST /billing/google/verify` con el `purchaseToken`. El backend hace el *acknowledge*.
- Contador, paywall y límite de 240 caracteres iguales que en escritorio.
- Gestionar: abrir `https://play.google.com/store/account/subscriptions?sku=…&package=…`.
- **Política de Play**: en Android no se enlaza a Stripe. Quien se suscribió en escritorio aparece como Pro igualmente (el entitlement es por cuenta), pero la app no le muestra enlaces de pago externos.

### 9.3 Web / landing (`web/src/app/landing/content.ts`)
- Actualizar precios y FAQ: Free con IA incluida, Pro de pago y BYOK gratis. Precios y límites leídos de `GET /billing/plans`, nunca fijos en el código.
- Páginas `/pro/ok` y `/pro/cancel` (redirección de Stripe Checkout), con un "vuelve a la app".
- Términos de suscripción, política de reembolsos y privacidad (proveedor IA = OpenRouter y subprocesadores).

## 10. Configuración (variables de entorno)

Las variables de entorno son de dos tipos:
- **Secretos e infraestructura**: solo en el entorno, **nunca** editables ni visibles desde el panel.
- **Seed**: valores iniciales que se copian a `BillingConfig` la primera vez que arranca el backend (si la tabla está vacía). A partir de ahí manda la base de datos y se cambian desde el panel admin (§11).

| Variable | Tipo | Ejemplo | Uso |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Secreto | `sk-or-…` | Key del servidor para managed |
| `STRIPE_SECRET_KEY` | Secreto | `sk_live_…` | API Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secreto | `whsec_…` | Firma de webhooks |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Secreto | — | Android Publisher API |
| `GOOGLE_PLAY_PACKAGE` | Infra | `app.pockai` | Paquete Android |
| `GOOGLE_PUBSUB_AUDIENCE` | Infra | `https://api…/billing/google/rtdn` | Verificación OIDC de RTDN |
| `PUBLIC_WEB_URL` | Infra | `https://pockai.app` | URLs de vuelta de Checkout |
| `AI_MANAGED_ENABLED` | Infra | `false` | Interruptor general del despliegue (el panel tiene además su propio interruptor) |
| `STRIPE_PRODUCT_PRO` | Infra | `prod_…` | Producto Stripe sobre el que el panel crea los precios |
| `AI_MANAGED_MODEL` / `AI_MANAGED_FALLBACK_MODELS` | Seed | `google/gemini-…-flash-lite` | Modelo inicial |
| `AI_MANAGED_DAILY_BUDGET_USD` | Seed | `10` | Presupuesto global inicial |
| `AI_MANAGED_MAX_CONCURRENCY` | Seed | `200` | Concurrencia inicial |
| `AI_PLAN_FREE_DAILY` / `AI_PLAN_PRO_DAILY` | Seed | `15` / `200` | Límites diarios iniciales |
| `AI_MONTHLY_TOKEN_QUOTA_FREE` / `_PRO` | Seed | `300000` / `3000000` | Tope mensual inicial |

Hay que añadirlas a `backend/src/config/env.config.ts` (validación), `.env.example` y `docs/DEPLOY.md`.

## 11. Configuración desde el panel admin (solo superadmin)

**Todos los precios y todos los límites** de esta spec se editan desde el panel de administración (`web/src/app/admin`). Solo puede hacerlo el rol **superadmin**.

### 11.1 Permiso

Se añade un permiso nuevo en `backend/src/modules/authz/permissions.ts`:

```ts
export const PERMISSIONS = [
  // …
  'billing:manage', // precios, planes y límites de IA gestionada. SOLO superadmin.
] as const;
```

- `superadmin` ya tiene `'*'`, así que lo recibe sin tocar `ROLE_PERMISSIONS`.
- **No** se añade a `admin` ni a `moderator`. Un test en `permissions.spec.ts` lo fija: `hasPermission('admin', 'billing:manage') === false`.
- Los endpoints usan `@RequirePermissions('billing:manage')` (el `PermissionsGuard` existente). La lectura también lo exige, porque incluye costes y márgenes.
- En el panel, la sección "Facturación e IA" solo aparece si `permissionsFor(role)` incluye `billing:manage`. La comprobación real la hace siempre el backend.

### 11.2 Qué se configura

| Grupo | Campo | Defecto | Validación |
|---|---|---|---|
| **Precios** | Precio Pro mensual (por moneda: USD, EUR…) | 9,99 $ | 0,99–99,99 |
| | Prueba gratuita Pro (días) | 0 | 0–30 |
| **Plan Free** | Mensajes/día | 15 | 0–1.000 (0 = Free sin IA gestionada) |
| | Caracteres por mensaje | 240 | 50–1.000 |
| | `maxTokens` de salida | 120 | 32–1.200 |
| | Historial (mensajes / caracteres) | 6 / 1.500 | 0–20 / 0–6.000 |
| | Memoria: extraer cada N mensajes | 12 | 0 (off)–50 |
| | Herramientas de agente | No | sí/no |
| | Tope tokens/mes | 300k | 0 (∞)–50M |
| | Mensajes de prueba sin email verificado | 3 | 0–50 |
| **Plan Pro** | Mismos campos que Free | 200 / 240 / 160 / 10 / 3.000 / 6 / sí / 3M | Mismos rangos (mensajes/día hasta 5.000) |
| **BYOK / Hermes** | Rate limit (mensajes/min) | 20 | 1–120 |
| | Caracteres por mensaje | 1.000 | 100–4.000 |
| **IA gestionada** | Interruptor on/off | on | — |
| | Modelo primario y fallbacks de OpenRouter | (seed) | Lista de modelos permitidos (§11.4) |
| | Presupuesto global diario (USD) | 10 | 0–10.000 |
| | Multiplicador de presupuesto para Pro | 1,5 | 1–5 |
| | Concurrencia máxima de streams | 200 | 1–5.000 |
| | Timeout hasta el primer token (s) | 10 | 3–60 |
| **Suscripción** | Días de gracia por pago fallido | 3 | 0–14 |

Todo se valida con un esquema zod compartido (`backend/src/modules/billing/billing-config.schema.ts`) y la invariante `pro ≥ free` en mensajes/día. Un valor fuera de rango devuelve `400` con el campo culpable.

### 11.3 Precios: cómo se aplica un cambio

En Stripe y Google Play **un precio no se edita: se crea uno nuevo**. El backend lo hace por API al guardar en el panel:

1. **Stripe**: `stripe.prices.create({ product: STRIPE_PRODUCT_PRO, unit_amount, currency, recurring: { interval: 'month' } })`. El nuevo `price_…` se guarda como precio activo en `BillingConfig` y el anterior se archiva (`active: false`). Checkout usa siempre el activo, así que `STRIPE_PRICE_PRO` deja de ser una variable de entorno.
2. **Google Play**: Android Publisher API `monetization.subscriptions.basePlans` para actualizar los precios regionales del base plan (o crear un base plan nuevo).
3. **Suscriptores existentes**: por defecto **conservan su precio** (grandfathering). El panel ofrece aparte la acción **"Migrar suscriptores al nuevo precio"**, con confirmación doble:
   - En Stripe actualiza cada suscripción al nuevo `price` en la siguiente renovación, sin prorrateo.
   - En Play usa la migración de cohortes de precio, con el aviso al usuario que exige Google (las subidas de precio requieren aceptación del usuario).
   - Es obligatorio avisar al usuario con antelación (email + aviso en la app). El panel lo recuerda antes de confirmar.
4. Si falla Stripe o Play, **no se guarda nada**: el cambio es todo o nada y el panel muestra el error.
5. El precio que se muestra en los clientes y la landing sale de `GET /billing/plans` (público). Así nunca hay un precio fijo en el código de los clientes.

### 11.4 Límites: cómo se aplica un cambio

- **Modelo de datos**: configuración **versionada** (inmutable; cada guardado crea una fila nueva y la activa).

```prisma
model BillingConfig {
  id          String   @id @default(uuid())
  version     Int      @unique
  active      Boolean  @default(false)
  data        Json     // validado con billing-config.schema.ts
  stripePriceIds Json? // { "usd": "price_…", "eur": "price_…" }
  createdById String
  note        String?  // motivo del cambio
  createdAt   DateTime @default(now())

  @@index([active])
}
```

- **`BillingConfigService`**: guarda en memoria la versión activa. Al guardar publica `petai:billing:config:changed` por Redis pub/sub y todas las instancias recargan. Como respaldo, también se recarga cada 30 s si Redis falla. Así se cumple "≤ 5 s sin redesplegar" (AC11).
- **Efecto en usuarios**:
  - Los cambios de límites diarios se aplican al momento sobre el contador del día. Si se baja el límite por debajo de lo ya usado, el usuario simplemente no puede enviar más hasta mañana.
  - Los demás límites se aplican al siguiente mensaje.
  - Los clientes refrescan `GET /ai/usage` y el backend emite `billing:config_updated` por socket para que actualicen el contador y el `maxlength`.
- **Modelos permitidos**: el panel solo deja elegir modelos de una lista blanca (consultada a `GET https://openrouter.ai/api/v1/models` y filtrada por precio máximo). Muestra el precio por millón de tokens y el **coste estimado por mensaje** con la fórmula de §6.
- **Ayuda a la decisión**: junto a cada cambio, el panel muestra el impacto estimado: coste/día con los DAU actuales, margen por usuario Pro y gasto de ayer.

### 11.5 Auditoría y reversión

- Cada guardado escribe en `AuditLog` (modelo existente): acción `billing.config.update` o `billing.price.update`, actor, versión anterior y nueva, diff de campos y nota.
- **Revertir**: el panel lista las versiones y permite activar una anterior. Revertir solo afecta a **límites**: los precios no se revierten, porque en Stripe y Play un precio revertido es en realidad un precio nuevo y debe pasar por §11.3.
- Las acciones de precio requieren **reautenticación** (pedir de nuevo la contraseña) y muestran confirmación con el resumen del cambio.

### 11.6 Endpoints admin

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| `GET` | `/admin/billing/config` | `billing:manage` | Versión activa + valores por defecto + rangos |
| `PUT` | `/admin/billing/config` | `billing:manage` | Guarda nueva versión de límites (`{ data, note }`) |
| `GET` | `/admin/billing/config/versions` | `billing:manage` | Historial de versiones |
| `POST` | `/admin/billing/config/versions/:version/activate` | `billing:manage` | Revertir límites a una versión |
| `PUT` | `/admin/billing/prices` | `billing:manage` + reauth | Crea precio nuevo en Stripe y Play |
| `POST` | `/admin/billing/prices/migrate` | `billing:manage` + reauth | Migra suscriptores existentes al precio activo |
| `GET` | `/admin/billing/models` | `billing:manage` | Modelos de OpenRouter permitidos con precio |
| `GET` | `/admin/billing/stats` | `billing:manage` | Gasto IA hoy/ayer, suscriptores activos, MRR, coste por plan |

## Interfaz de API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/billing/plans` | Público | Precios y límites vigentes por plan (de `BillingConfig`) para clientes y landing |
| `GET` | `/billing/entitlement` | JWT | `{ plan, source?, currentPeriodEnd?, cancelAtPeriodEnd?, duplicateSubscriptions? }` |
| `POST` | `/billing/stripe/checkout` | JWT | `{ url }` de Stripe Checkout |
| `POST` | `/billing/stripe/portal` | JWT | `{ url }` del Customer Portal |
| `POST` | `/billing/stripe/webhook` | Firma Stripe | Eventos de suscripción |
| `POST` | `/billing/google/verify` | JWT | Verifica y reconoce una compra de Play |
| `POST` | `/billing/google/rtdn` | OIDC Pub/Sub | Notificaciones en tiempo real de Play |
| `GET` | `/ai/usage` | JWT | **Ampliado**: `+ plan`, `+ daily: { used, limit, resetsAt }` |
| `PUT` | `/ai/config` | JWT | **Ampliado**: acepta `{ mode: 'managed' }` |
| — | `/admin/billing/*` | `billing:manage` (superadmin) | Ver §11.6 |

Nuevos errores del chat (`POST /pets/:id/chat`, antes de abrir el SSE):

```json
{ "statusCode": 429, "code": "daily_quota_exceeded", "plan": "free", "limit": 15, "resetsAt": "2026-11-17T00:00:00+01:00" }
{ "statusCode": 400, "code": "message_too_long", "max": 240 }
{ "statusCode": 503, "code": "managed_ai_paused" }
{ "statusCode": 503, "code": "managed_ai_unavailable", "retryAfter": 60 }
```

## Security
- `OPENROUTER_API_KEY` solo vive en el entorno del servidor y nunca llega al cliente ni a los logs.
- Precios y límites: solo `superadmin` (`billing:manage`, sin conceder a `admin`). Los cambios de precio requieren reautenticación, todo cambio va a `AuditLog`, y los secretos nunca se exponen ni se editan desde el panel.
- Webhooks: firma de Stripe (`constructEvent` con raw body) y JWT OIDC de Google para Pub/Sub. Nunca se confía en el body sin verificar.
- La fuente de verdad es siempre el proveedor de pagos: ante cualquier evento se **vuelve a leer** la suscripción por API, en lugar de fiarse del contenido del webhook.
- Play: `obfuscatedExternalAccountId` ligado al usuario para que un `purchaseToken` no se pueda canjear en otra cuenta.
- No se guardan datos de tarjeta (Stripe/Play los custodian); `BillingEvent` guarda solo el hash del payload.
- La cuota diaria **nunca falla en abierto** para Free si Redis cae (respaldo en BD o memoria).
- Privacidad: actualizar la política (OpenRouter y el modelo subyacente como subprocesadores; sin entrenamiento con datos: activar en OpenRouter la opción de no permitir proveedores que entrenen con prompts).

## Plan de implementación

| Fase | Tarea | Archivos principales | Estimación |
|---|---|---|---|
| **1** | Modelo de datos (`Subscription`, `BillingEvent`, `User.stripeCustomerId`, `emailVerifiedAt`) + migración. `plans.ts`. `EntitlementService` + `GET /billing/entitlement`. | `prisma/schema.prisma`, `modules/billing/*` | 1,5 días |
| **2** | `DailyQuotaService` (Lua, refund, peek, respaldo sin Redis) + ampliar `GET /ai/usage`. | `modules/billing/daily-quota.service.ts`, `ai/usage.service.ts`, `ai/ai.controller.ts` | 1 día |
| **3** | Rama managed: `resolveProvider` sin config → OpenRouter. Opciones extra en `OpenAiCompatibleProvider` (headers, `models`, `include_usage`). Límites por plan en `prepare`/`run`/`buildContext`. Refund en errores. `costUsd` en `UsageService.record`. Elegir y probar el modelo concreto. Deprecar `ai-router`. | `ai/ai-config.service.ts`, `ai/openai-compatible.provider.ts`, `ai/chat.service.ts`, `ai/memory.service.ts` | 2,5 días |
| **4** | Resiliencia: `ManagedBudgetService`, circuit breaker, semáforo de concurrencia, timeouts, métricas OTel. | `modules/billing/managed-budget.service.ts` | 1,5 días |
| **5** | Stripe: producto en el dashboard (los precios los crea el panel, §11.3), Checkout, Portal, webhook (`rawBody`), `BillingService`, evento `entitlement:updated` por socket. | `modules/billing/stripe.*`, `main.ts`, `realtime` | 2,5 días |
| **6** | Google Play: producto en la consola, cuenta de servicio, `verify`, RTDN + Pub/Sub, acknowledge. | `modules/billing/google-play.*` | 2,5 días |
| **7** | Escritorio: selector de modo, contador, `maxlength` dinámico, paywall, Checkout/Portal, escucha de socket + foco. OpenAPI regenerado. | `AiTab.svelte`, `lib/api.ts`, `shared/openapi` | 2 días |
| **8** | Android: Play Billing Library, paywall, contador, límite de caracteres. | `mobile/android/.../chat/*`, `billing/*` | 3 días |
| **9** | Antiabuso: verificación de email (requiere el transporte real de `EMAIL_SENDER`, ver `PENDIENTES.md`), 3 mensajes de prueba sin verificar. | `modules/auth/*` | 1,5 días |
| **10** | Landing, FAQ, términos, privacidad, páginas `/pro/ok` y `/pro/cancel`. | `web/src/app/landing/content.ts`, i18n | 1 día |
| **11** | Configuración desde el panel admin: permiso `billing:manage` (solo superadmin), `BillingConfig` versionado + seed, `BillingConfigService` con recarga por pub/sub, endpoints `/admin/billing/*`, `GET /billing/plans`, creación de precios en Stripe/Play, migración de suscriptores, auditoría y reversión. UI "Facturación e IA" en el panel. | `authz/permissions.ts`, `modules/billing/billing-config.*`, `web/src/app/admin/*` | 4 días |
| **12** | Tests (unit + e2e + carga), `DEPLOY.md`, `.env.example`, lanzamiento gradual (flag `AI_MANAGED_ENABLED`). | — | 2 días |

**Total: ~25 días (~5 semanas).** Las fases 5–6 y 7–8 pueden ir en paralelo. `BillingConfig` y `BillingConfigService` (parte de la fase 11) conviene hacerlos en la fase 1, porque las fases 2–4 leen los límites de ahí; la UI del panel y los precios pueden ir después.

### Orden recomendado de lanzamiento
1. Fases 1–4 detrás de `AI_MANAGED_ENABLED=false`. Probar en staging con un presupuesto diario bajo (p. ej. 2 $).
2. Activar **managed Free** para todos (sin Pro todavía) y medir tokens reales por mensaje y coste/DAU durante 1–2 semanas. Ajustar §6 con datos reales.
3. Activar **Pro en escritorio** (Stripe).
4. Activar **Pro en Android** (Play).

## Tests
- **Unit**:
  - `DailyQuotaService`: límite exacto, refund, cambio de día por zona horaria, Redis caído.
  - `EntitlementService`: todos los estados de §2.2, caché.
  - `ManagedBudgetService`.
  - Límites de `BillingConfigService` aplicados en `prepare` (y cambio en caliente).
  - Hermes local **no** consume cuota.
- **Integración**:
  - Webhooks de Stripe con `stripe trigger` / fixtures firmados, idempotencia (mismo evento dos veces).
  - Play `verify` con un mock de Android Publisher.
  - Fallback de OpenRouter con un mock que devuelve 429.
- **E2E**:
  - Usuario nuevo → 15 mensajes → 429 → compra (mock) → evento socket → mensaje 16 OK.
  - Cancelación → sigue Pro hasta fin de periodo.
  - BYOK sin límite diario.
- **Concurrencia**: 50 peticiones simultáneas del mismo usuario Free → exactamente 15 aceptadas (el lock in-flight y el rate limit también influyen; probar el servicio de cuota aislado).
- **Panel admin / permisos**:
  - `admin` y `moderator` reciben `403` en todos los `/admin/billing/*`; `superadmin` accede.
  - Un valor fuera de rango devuelve `400`.
  - Cambiar los mensajes/día se refleja en otra instancia en ≤ 5 s.
  - Revertir una versión restaura los límites.
  - Un cambio de precio con Stripe en fallo no guarda nada.
  - Cada cambio genera una entrada en `AuditLog`.
- **Carga**: 1.000 usuarios virtuales con un mock del proveedor; p95 de la parte previa al stream < 50 ms (Redis). Se puede reutilizar `loadtest.sh` (`USERS=N`).

## Riesgos y notas
- **Precios de OpenRouter y modelos cambian**: el modelo se elige en la fase 3 y va en variables de entorno para cambiarlo sin desplegar código.
- **Calidad vs coste**: un modelo muy barato puede romper la personalidad de la mascota. Hay que hacer una prueba A/B corta con 3 modelos candidatos usando los prompts reales de `personality.ts`.
- **240 caracteres y la burbuja flotante**: encaja bien. Revisar que el system prompt no prometa respuestas largas en managed.
- **Política de Google Play**: no se puede enlazar a pagos externos desde la app Android. El entitlement cruzado (pagar en escritorio, usar en Android) está permitido.
- **Impuestos**: Stripe Tax (IVA UE). Play gestiona los impuestos por su cuenta.
- **Coste del Free como gasto de adquisición**: si se dispara, se puede bajar el límite diario sin desplegar (variable de entorno) o pedir verificación de email antes.
- **Redis**: ya es dependencia (rate limit, BullMQ). El contador diario no añade infraestructura nueva.

## Preguntas abiertas
1. ¿Qué modelo concreto de OpenRouter? → Decidir en la fase 3 con una prueba A/B de calidad y coste.
2. ¿Prueba gratuita de Pro (p. ej. 7 días)? → Stripe y Play la soportan. Propuesta: no en v1.
3. ¿Precio local por región (EUR, precios de Play por país)? → Propuesta: 9,99 $ / 9,99 € en v1.
4. ¿Plan anual (p. ej. 79,99 $/año)? → v2.
5. ¿Las herramientas de agente deberían estar también en Free con un límite? → v1: solo Pro.
6. ¿Se puede pagar Pro con gems del juego? → No: Pro tiene coste real en dólares por usuario. Sí se podrían regalar "mensajes extra del día" como recompensa puntual (v2).
