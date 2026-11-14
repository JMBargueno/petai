# PetAI Constitution

> Constitución del proyecto PetAI — tamagotchi virtual inteligente.
> Todo lo que sigue está derivado de las convenciones reales del código (`backend/`, `desktop/`, `shared/`, `docs/`), no de supuestos.

## Core Principles

### I. El backend es autoritativo

El backend NestJS (descrito como *"Backend autoritativo"* en `backend/package.json`) es la única fuente de verdad. Ningún cliente (escritorio, Android, iOS) puede afirmar o recalcular el estado del juego: toda tirada aleatoria, todo cambio de vitalidad, todo combate y toda transacción de moneda/gema se resuelven en el servidor.

**Reglas obligatorias:**
- Toda aleatoriedad de juego se genera en el servidor con `crypto.randomInt` / `crypto.randomUUID` de Node, nunca con `Math.random()` del cliente ni de la UI.
- Las operaciones que modifican saldo o reclaman un recurso usan transacciones atómicas con `updateMany` + condición, de modo que dos peticiones simultáneas no puedan dejar el saldo en negativo ni duplicar un resultado.
- El identificador de usuario y de mascota **siempre** proviene de la sesión (JWT / `@CurrentUser`), jamás de un parámetro que el cliente o el modelo de IA puedan enviar.
- Los valores que llegan del cliente (puntuación de un minijuego, args de una herramienta de IA, `userId`) se validan de forma estricta en el servidor antes de usarse.

**Cumple** (`hatching.service.ts` — eclosión y pity atómicos):
```ts
const petId = crypto.randomUUID();
return this.prisma.$transaction(async (tx) => {
  const claimed = await tx.egg.updateMany({
    where: { id: eggId, userId, hatchedPetId: null },
    data: { hatchedPetId: petId },
  });
  if (claimed.count === 0) throw new NotFoundException('Huevo no encontrado o ya eclosionado');
  const pityUpdated = await tx.pityCounter.updateMany({
    where: { userId, sinceSuperRare: pity.sinceSuperRare, sinceLegendary: pity.sinceLegendary },
    data: { sinceSuperRare: newSinceSuper, sinceLegendary: newSinceLeg },
  });
  if (pityUpdated.count === 0) throw new ConflictException('El contador cambió durante la eclosión');
  return tx.pet.create({ data: { /* ... */ } });
});
```

**No cumple** (a excluir del merge):
```ts
const rarity = Math.random() < 0.01 ? 'mythic' : 'normal'; // ❌ azar en el cliente
await fetch('/pets', { method: 'POST', body: JSON.stringify({ userId: 'el-que-quiero', rarity }) });
// ❌ userId enviado por el cliente, no tomado de la sesión
```

### II. Combate determinista

El motor de combate (`modules/battles/combat/engine.ts`) es **100 % determinista**: no lee el reloj, no toca la base de datos y no usa `Math.random`. Mismos luchadores + misma semilla ⇒ mismo registro, byte a byte. Esto permite las repeticiones animadas y re-derivar el resultado en cualquier plataforma.

**Reglas obligatorias:**
- El motor solo usa el PRNG privado `createRng` (mulberry32) de `rng.ts`. Ningún otro generador aleatorio.
- El **orden de las llamadas al PRNG es fijo** por turno: precisión → variación → crítico → estado. Cualquier cambio de reglas cambia la repetición.
- La IA de reglas (`chooseSkill`) es pura: depende solo del estado visible (HP, cooldowns, estrategia), sin azar extra.
- El registro (`BattleLog`) guarda la instantánea de los luchadores y la `version` del motor, para que una repetición se pueda reproducir y validar de forma estable.
- Las fórmulas (afinidad de elementos, daño, crítico, quemadura, enfriamientos) leen sus constantes de `balance.json → combats`, no de literales hardcoded.

**Cumple** (`engine.ts` — orden fijo del PRNG):
```ts
const hit = rng() * 100 < skill.accuracy;      // 1) precisión
const variance = 0.9 + 0.2 * rng();           // 2) variación
const crit = rng() < cfg.critChance;         // 3) crítico
const damage = Math.max(1, Math.round(base * mult * variance * (crit ? cfg.critMultiplier : 1)));
if (foe.hp > 0 && skill.inflicts && rng() < skill.inflicts.chance) { // 4) estado
  inflict(foe, skill.inflicts.kind, skill.inflicts.turns, skill.inflicts.value);
}
```

**No cumple:**
```ts
const dmg = skill.power * (0.9 + 0.2 * Math.random()); // ❌ rompe la determinación
const roll = Date.now() % 100;                          // ❌ leer el reloj dentro del motor
```
### III. Consistencia multi-plataforma

Un solo contrato y un solo juego de datos alimentan a todas las plataformas (escritorio Tauri, Android, iOS). El escritorio es el primer cliente real, pero el backend ya debe servir a todos por igual.

**Reglas obligatorias:**
- El contrato único es `openapi.json`, generado por `@nestjs/swagger` en el backend. Se regenera con `export-openapi.ts` (y en arranque no-producción, ver `main.ts`) y se publica en `shared/openapi/`.
- Los clientes se **generan** a partir de ese contrato: `openapi-typescript` en escritorio, `openapi-generator` (Kotlin/Retrofit) en Android, `swift-openapi-generator` en iOS. No se reescribe a mano el tipo de cada respuesta.
- Los datos de juego (especies, patrones, comida, habilidades, balance, misiones) viven en `shared/game-data/*.json`: el backend los carga a la BD con el seed y los clientes los usan para arte y textos.
- El renderizado de una mascota es determinista a partir de `visualSeed` + `palette` (JSON en la BD), de modo que todos los clientes dibujan el mismo sprite/patrón.

**Cumple** (`main.ts` — export del contrato):
```ts
if (!isProduction) exportOpenApi(document); // escribe shared/openapi/openapi.json
```
El escritorio consume tipos generados (`openapi-fetch`) en vez de tipos inventados.

**No cumple:**
```ts
// ❌ endpoint nuevo cuyo tipo se define a mano en cada cliente, sin pasar por @nestjs/swagger
// ❌ mover una especie a un array duro en el bundle de Android en vez de shared/game-data/species.json
// ❌ cambiar el orden de los JSON de combate sin actualizar shared/openapi y la `version` del registro
```

### IV. Patrón de Tick perezoso (Lazy Tick)

El deterioro de las mascotas **no** se ejecuta con tareas en segundo plano por mascota. El estado se recalcula en el momento de la consulta a partir del tiempo transcurrido, de modo que el backend escala sin un cron por mascota.

**Reglas obligatorias:**
- `applyLazyTick` (en `pets.service.ts`) calcula `Δt = now() − lastTickAt` al leer una mascota y aplica el decaimiento acumulado; al terminar fija `lastTickAt = now()`.
- Las horas transcurridas se descomponen en diurnas y nocturnas según la **zona horaria del usuario** (`sleep-cycle.ts`, `nightHoursBetween` + `safeTimeZone`); el decaimiento dormido/velo sale de `balance.vitals.decayPerHour`.
- No existe ningún job/cola que itere mascotas una a una para bajar hambre/energía. La única fuente de "avance del tiempo" es el timestamp guardado.
- Toda acción que muta el estado (alimentar, bañar, pelear) pasa también por el tick perezoso antes de actuar, y actualiza `lastTickAt`.

**Cumple** (`pets.service.ts`):
```ts
const elapsedHours = (now.getTime() - pet.lastTickAt.getTime()) / 3_600_000;
const decay = pet.sleeping ? balance.vitals.decayPerHour.sleeping : balance.vitals.decayPerHour.awake;
let newHunger = Math.max(0, pet.hunger - decay.hunger * elapsedHours);
return this.prisma.pet.update({ where: { id: pet.id }, data: { /* vitals */ , lastTickAt: now } });
```

**No cumple:**
```ts
setInterval(async () => {                       // ❌ un cron que baja las vitales de cada mascota
  const pets = await prisma.pet.findMany({});
  for (const p of pets) await prisma.pet.update({ data: { hunger: p.hunger - 5 } });
}, 3_600_000);
```

### V. Tiempo real por WebSocket, autenticado

Las actualizaciones empujadas (estado de mascota, aviso de pelea, caducidad) van por WebSocket (Socket.IO, namespace `realtime`), nunca por polling agresivo. La conexión se autenti­ca con el JWT de acceso y el servidor nunca confía en un identificador enviado por el cliente.

**Reglas obligatorias:**
- La identidad de la conexión sale **solo** de `client.handshake.auth.token` verificado con `jwtService.verifyAsync` (HS256). Nunca un `userId` del handshake.
- CORS del socket está restringido a `CORS_ORIGINS` (ver `common/cors.ts`), nunca `'*'`.
- Tope de `MAX_SOCKETS_PER_USER = 5`; al superarlo se cierran las más antiguas.
- La conexión no sobrevive al token con el que se abrió: al caducar se emite `auth:expired` y se desconecta; el cliente debe reconectar con un access renovado.
- El empuje apunta a la sala `user:<id>` (`emitToUser`, `emitPetUpdate`) para llegar a todos los dispositivos del usuario.

**Cumple** (`realtime.gateway.ts`):
```ts
const token = client.handshake.auth?.token;
const payload = await this.jwtService.verifyAsync<{ sub: string; exp?: number }>(token, {
  secret: this.configService.get<string>('JWT_ACCESS_SECRET'), algorithms: ['HS256'],
});
await client.join(`user:${payload.sub}`);
if (payload.exp) { /* timer → emit('auth:expired'); disconnect(true) */ }
```

**No cumple:**
```ts
const room = `user:${client.handshake.auth.userId}`; // ❌ confiar en un userId que el cliente pasa
@WebSocketGateway({ cors: { origin: '*' } })          // ❌ origen abierto
```
### VI. Arquitectura modular NestJS por dominio

El backend se organiza en módulos de dominio aislados (`app.module.ts`), cada uno con controller + service (+ guardas/specs). Los recursos compartidos (Prisma, Redis, datos de juego, realtime) son módulos reutilizables que los dominios inyectan.

**Reglas obligatorias:**
- Cada dominio vive en su carpeta `modules/<dominio>/` (`auth`, `users`, `hatching`, `pets`, `inventory`, `minigames`, `ai`, `battles`, `realtime`, `game-data`, `health`) y se registra en `AppModule`.
- Se inyecta `PrismaService`, `RedisService`, `GameDataService` / `RealtimeGateway` por el constructor; no se accede a Prisma/Redis directamente desde los controllers.
- La configuración global usa `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` (validación de env con Zod, ver `config/env.config.ts`).
- Un `AppExceptionFilter` global (`APP_FILTER`) normaliza los errores; las cabeceras de seguridad se aplican una sola vez en `main.ts` (`applySecurity` + helmet).
- Los motores puros (combate, sleep, memoria) se aíslan en archivos sin dependencias de Nest para poder testearlos de forma unitaria.

**Cumple** (`app.module.ts` — agrupación por dominio):
```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', 'backend/.env'], validate: validateEnv }),
    PrismaModule, RedisModule, RealtimeModule,
    GameDataModule, AuthModule, UsersModule, HatchingModule, PetsModule,
    InventoryModule, MinigamesModule, AiModule, BattlesModule, HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
```

**No cumple:**
```ts
// ❌ un controller que instancia `new PrismaClient()` y bypassa PrismaModule
// ❌ lógica de combate enterrada dentro de BattlesService mezclada con Prisma/HTTP, en vez de combat/engine.ts
// ❌ un módulo que importa a otro solo para reusar un helper de dominio (dependencia impura/circular)
```

### VII. Datos de juego basados en balance.json

Todos los números jugables — rarezas y sus multiplicadores, pity, shiny, decaimiento de vitales, curva de niveles, constantes de combate, ELO/ligas, recompensas, minijuegos, sueño — viven en `shared/game-data/balance.json` (con `$schema`) y se leen a través de `GameDataService`. Cambiar el balance no requiere tocar el código del motor.

**Reglas obligatorias:**
- El balance se carga una vez en `GameDataService.onModuleInit` y se consume vía `getBalance()`; los servicios (hatching, pets, battles) leen `balance.*` en vez de literales.
- Las probabilidades de rareza y multiplicadores usados en la tirada **deben coincidir** con `balance.rarity` (y con lo publicado, requisito de Apple/Google).
- La curva de XP (`XP(n) = round(100·n^1.5)`), los hitos de `leveling.stages`, `combats.elo`/`leagues` y `minigames` se parametrizan desde el JSON.
- Cualquier cambio de balance se versiona (`"version"` del JSON) y, si afecta a combates ya registrados, exige actualizar la `version` del log de combate.

**Cumple** (`hatching.service.ts` lee multiplicador del balance):
```ts
const balance = this.gameData.getBalance();
const rarityMultiplier = balance.rarity[rolledRarity]?.multiplier || 1.0;
const initialCombatStats = { hp: Math.round(baseCombat.hp * rarityMultiplier), /* ... */ };
```

**No cumple:**
```ts
const mythicChance = 0.01;         // ❌ probabilidad dura en el código en vez de balance.rarity.mythic
const crit = Math.random() < 0.05; // ❌ crítico hardcoded ignorando balance.combats.critChance
```

### VIII. Seguridad

La seguridad es un requisito no negociable. El backend valida el entorno al arrancar, protege las credenciales, aplica rate limiting, protege contra SSRF y trata la IA con el principio de mínima confianza.

**Reglas obligatorias:**
- **Env validado con Zod** (`env.config.ts`): en producción el servidor **se niega a arrancar** si algún secreto usa el valor público de `DEV_DEFAULTS` (JWTs, `AI_KEY_ENCRYPTION_KEY`) o si hay flags que desactivan protecciones (`AI_ALLOW_INSECURE_URLS`, `AUTH_RATE_LIMIT_DISABLED`, `RATE_LIMIT_DISABLED`).
- **Cabeceras y CORS:** `helmet` + `CORS_ORIGINS` restringido (Vite/Tauri); `TRUST_PROXY` configurado para que el rate limit vea la IP real.
- **Contraseñas** con `argon2`; **refresh tokens** guardados como hash (`RefreshToken.hash`), nunca en claro.
- **Rate limiting:** guardas de autenticación (intentos por cuenta/IP/global) y un límite global por usuario/IP; configurables por env.
- **SSRF:** `ssrf.ts` + `agent-tools.ts` bloquean hosts privados/loopback; `open_url` solo `http/https` sin credenciales y sin hosts internos.
- **Keys de IA cifradas en reposo** (`key-crypto.service.ts`, AES-GCM: `encryptedKey` + `keyIv` + `keyTag`); el modo BYOK usa la key del usuario y no se guarda en claro.
- **Agente de IA (function calling):** `userId`/`petId` salen de la sesión, los args se validan estrictamente en el servidor, y **toda herramienta con efecto se propone al usuario** (`PendingAction`) y solo se ejecuta cuando él la confirma; el texto de confirmación lo genera el servidor, no el modelo.

**Cumple** (`env.config.ts` — producción rechaza valores por defecto):
```ts
export function productionProblems(env: EnvConfig): string[] {
  const problems: string[] = [];
  const isDefault = (k) => env[k] === DEV_DEFAULTS[k];
  if (isDefault('JWT_ACCESS_SECRET') || env.JWT_ACCESS_SECRET.length < 32) problems.push('...');
  if (env.AI_ALLOW_INSECURE_URLS === 'true') problems.push('...');
  return problems; // si no está vacío, validateEnv lanza y el proceso no arranca
}
```

**No cumple:**
```ts
if (process.env.NODE_ENV !== 'test') console.log(refreshToken); // ❌ token en claro / logueado
await llm.call(toolArgs, { userId: modelArgs.userId });          // ❌ userId tomado del modelo
// ❌ herramienta con efecto (crear recordatorio, abrir URL) ejecutada sin fila PendingAction confirmada
// ❌ usar un secreto de DEV_DEFAULTS en producción "porque es más fácil"
```
### IX. Simplicidad primero

Se entrega por fases, empezando por el backend + la mascota de escritorio (primer cliente para probar de punta a punta). Los clientes móviles llegan cuando la API es estable. YAGNI: no se construye infraestructura que ninguna fase no use todavía.

**Reglas obligatorias:**
- El alcance se guía por las fases de `docs/PROYECTO.md` y sus criterios "Hecho cuando" medibles. No se adelantan fases.
- Se prefiere una dependencia o tabla menos si el requisito se cubre con lo existente (p. ej. el tick perezoso evita una cola para el deterioro; BullMQ/Redis se reservan para lo que de verdad necesite asincronía, como notificaciones en fase 5).
- Los motores puros (combate, sleep, memoria) se mantienen sin dependencias de Nest para poder testearlos de forma unitaria e aislada.
- El arte empieza con placeholders y un formato de sprite común (`shared/assets`) en lugar de bloquear el desarrollo en el arte final.

**Cumple:**
```ts
// Fase 1-4: el deterioro se resuelve con lazy tick (sin cola) y el escritorio consume el contrato ya existente
```

**No cumple:**
```ts
// ❌ implementar colas de notificaciones, analítica o suscripciones antes de que la fase
//    que lo necesita (fase 5) llegue y lo justifique
```

## Technology Stack

- **Backend:** NestJS 11 (`@nestjs/common|core|config|jwt|passport|platform-express|platform-socket.io|websockets|swagger`), TypeScript 5.7, Node 24 LTS. Autoritativo; REST + WebSocket.
- **Persistencia:** PostgreSQL vía Prisma ORM; migraciones en `backend/prisma/migrations`. Redis (ioredis) para clasificación/colas.
- **Seguridad:** `argon2` (contraseñas), `passport`/`passport-jwt` + `@nestjs/jwt`, `helmet`, validación de env con `zod`, AES-GCM para keys de IA.
- **Contrato:** `@nestjs/swagger` → `shared/openapi/openapi.json` (fuente única para generar clientes).
- **Escritorio:** Tauri 2 (Rust `edition 2021`, plugins shell/http/notification, `tray-icon`) + Svelte 5 + Vite 6 + TypeScript; `openapi-fetch` + `socket.io-client`.
- **Móviles (fases posteriores):** Android (Kotlin + Jetpack Compose, Material 3 Expressive, API 37 / min 26) e iOS (Swift + SwiftUI, Liquid Glass, SDK 27).
- **Datos de juego:** `shared/game-data/*.json` (`$schema` draft-07) — `balance.json`, `species.json`, `patterns.json`, `foods.json`, `skills.json`, `missions.json`.
- **Monorepo:** pnpm workspaces; `docker-compose.yml` con Postgres + Redis (+ mock de LLM para tests); CI en `.github/workflows`.

## Development Workflow

- **Contrato primero:** cualquier cambio de API se refleja en `@nestjs/swagger` y se regenera `shared/openapi/openapi.json` (`pnpm export:openapi`); los clientes consumen tipos generados, no tipos a mano.
- **Tests:** unitarios con Jest en archivos `.spec.ts` junto al código (rareza, pity, deterioro, motor de combate, XP, cifrado, SSRF, moderación, memoria, minijuegos). E2E con Supertest en `backend/test/*.e2e-spec.ts` contra Postgres/Redis de `docker-compose`.
- **Determinismo del combate** se prueba con la invarianta *"misma semilla ⇒ mismo log byte a byte"* y con simulaciones de miles de combates por rareza para validar el balance.
- **Balance:** se edita `shared/game-data/balance.json` (y su `version`), no el código del motor; los tests de balance corren tras el cambio.
- **Entorno:** los valores se definen y validan en `config/env.config.ts`; en producción, si falla la validación el proceso no arranca. `.env.example` documenta las variables.
- **Entrega por fases** con criterio "Hecho cuando" medible (ver `PROYECTO.md`); flujo de punta a punta de referencia: registrarse → eclosionar → alimentar → minijuego → subir de nivel → pelear → conectar la key → chatear → ver la misma mascota en el escritorio.

## Governance

- Esta constitución tiene prioridad sobre cualquier otra práctica o convención del proyecto. Si un PR la infringe, se bloquea en revisión.
- Cada principio es **no negociable**; las excepciones requieren justificación documentada en el PR y aprobación explícita.
- Las propuestas de cambio de balance (números de `balance.json`) requieren pasar los tests de combate/balance y, si cambia la semántica del combate, actualizar la `version` del registro de combate.
- **Amen­dments:** cualquier enmienda a esta constitución requiere (1) una modificación versionada de este archivo, (2) justificación y plan de migración cuando afecte a código existente, y (3) actualización de las secciones afectadas para mantener coherencia con el código real.
- Las revisiones de código verifican, como mínimo, cumplimiento de: autoritatividad del backend (I), determinismo del combate (II), contrato único (III) y las reglas de seguridad (VIII).

**Version**: 1.0.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
