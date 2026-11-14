# PetAI — Documento de proyecto y fases de implementación

---

## 1. Visión
PetAI es una mascota virtual al estilo tamagotchi. Cada jugador eclosiona huevos de los que salen criaturas con rareza y patrón únicos, las cuida (comida, higiene, juego), las hace subir de nivel con minijuegos y las pone a pelear contra mascotas de otros jugadores. Si se conectan a un LLM (OpenAI o Hermes Agent), las mascotas se vuelven **inteligentes**: conversan, recuerdan y acaban actuando como un **agente de IA** personal.

**Plataformas**
| Pieza | Tecnología | Estilo visual |
|---|---|---|
| Android | Kotlin + Jetpack Compose | Material 3 Expressive (Android 17) |
| iOS | Swift + SwiftUI | Liquid Glass (iOS 27) |
| Mascota de escritorio | Tauri 2 (Windows 11 / macOS 26+) | Ventana transparente con sprite y bandeja del sistema |
| Backend | NestJS 11 | API REST + WebSocket, autoritativo |

**Decisiones tomadas**
- El escritorio usa **Tauri 2**, con un solo código para Windows y macOS.
- Las peleas son **asíncronas**: el servidor simula el combate contra la mascota de otro jugador.
- La IA funciona con la **key propia del usuario (BYOK)** o con una **suscripción** que usa la key del servidor.
- La entrega es **por fases**: primero el **backend** junto con la **mascota de escritorio**, que sirve como primer cliente para probarlo desde este PC con Windows. Las apps móviles llegan después, cuando la API ya esté estable.

---

## 2. Versiones objetivo (comprobadas en noviembre de 2026)
- **iOS 27 / Xcode 27**: publicados en septiembre de 2026. Liquid Glass es obligatorio con el SDK 27.
- **Android 17 (API 37)**: estable desde junio de 2026. `targetSdk 37`, `minSdk 26`.
- **NestJS 11.1.x** sobre Node.js 22 LTS (el `backend/Dockerfile` usa `node:22-slim` y la CI corre con Node 22).
- **Prisma ORM 6** (versión instalada: 6.19, según `pnpm-lock.yaml`).
- **PostgreSQL 17** y **Redis 7** (versiones de `docker-compose.yml` y `docker-compose.prod.yml`), **Tauri 2.x**, **Kotlin 2.x**, **Swift 6.x**.
- **Paso 0**: confirmar las últimas versiones estables en el momento de crear cada proyecto.

---

## 3. Estructura del monorepo
```
petai/
  backend/            NestJS 11 + Prisma + PostgreSQL + Redis (sin colas aún; crons con @nestjs/schedule)
  mobile/android/     Proyecto Gradle (Kotlin DSL, version catalog)
  ios/                Pendiente (aún no existe; ver Fase 5)
  desktop/            Tauri 2 (src-tauri en Rust + frontend en Svelte/TS)
  shared/
    openapi/          openapi.json exportado por el backend
    assets/           base.png, mask.png, anim.json por especie; patterns/ y palettes.json (ver docs/ART_PIPELINE.md)
    game-data/        species.json, patterns.json, foods.json, balance.json
  docs/               ROADMAP.md, GAME_DESIGN.md, API.md, ART_PIPELINE.md
  docker-compose.yml  postgres + redis (+ un mock de LLM para tests)
  .github/workflows/  CI: backend, android, ios (runner macOS), desktop
```
- **Contrato único**: el backend genera `openapi.json` con `@nestjs/swagger`. A partir de él se generan los clientes: `openapi-generator` (Kotlin/Retrofit) en Android, `swift-openapi-generator` en iOS y `openapi-typescript` en escritorio.
- **Datos de juego** en JSON compartido: el backend los carga en la base de datos con un seed y los clientes los usan para el arte y los textos.

---

## 4. Diseño de juego

### 4.1 Eclosión
- **Huevos**: se consiguen con monedas, gemas, recompensas diarias, subidas de nivel y victorias.
- **Tiempo de incubación**: de 5 minutos a 8 horas según el tipo de huevo; se puede acelerar con gemas.
- **Rareza** (tirada en el servidor con `crypto.randomInt`, configurable en `balance.json`):

| Rareza | Probabilidad | Multiplicador de stats | Nº de especies inicial |
|---|---|---|---|
| Normal | 60 % | ×1.00 | 8 |
| Raro | 25 % | ×1.15 | 6 |
| Super-raro | 10 % | ×1.30 | 4 |
| Legendario | 4 % | ×1.50 | 2 |
| Mítico | 1 % | ×1.75 | 1 |

- **Pity**: se garantiza al menos un Super-raro cada 30 huevos y un Legendario o mejor cada 120.
- **Patrón**: tirada independiente. Pueden salir liso, manchas, rayas, degradado, escamas, cristal, galaxia o aurora; los cuatro últimos solo aparecen en Super-raro o superior. Además se tira una paleta de color (primario y secundario) y un pequeño % de **variante shiny**.
- **Composición determinista por capas**: el servidor guarda `visualSeed` (entero de 32 bits). Los clientes ejecutan un PRNG idéntico (**Mulberry32**) para derivar parámetros cosméticos únicos (desplazamiento del patrón `offsetX/Y`, escala/rotación `0.85–1.15x` y variación de tono `hueShift ±8°`).
- **Renderizado por capas en 4 pasos**: Base de color (canales R/G de `mask.png`), Proyección de patrón (canal B de `mask.png`), Sombreado Multiply + Lineart (`base.png`) y pase Shiny especular. Ver especificación técnica completa en [docs/ART_PIPELINE.md](ART_PIPELINE.md).
- **Animación de eclosión**: el huevo tiembla, se agrieta y estalla con un efecto de color según la rareza; es la parte más espectacular de la app.

### 4.2 Cuidado y estadísticas
- Las **estadísticas vitales** van de 0 a 100: hambre, felicidad, energía, higiene y salud.
- El **deterioro es perezoso**: se calcula con `lastTickAt` en cada lectura, sin tareas por mascota.
- Si una estadística se queda baja más de X horas, la mascota **enferma** (necesita medicina) o se pone **triste** (rinde menos en las peleas).
- Tiene **ciclo de sueño**: duerme de noche según la zona horaria del usuario, y entonces el deterioro se reduce.
- **Etapas**: huevo → bebé (nivel 1) → joven (nivel 10) → adulto (nivel 25) → forma final (nivel 50, con requisitos).

### 4.3 Comida y tienda
- La **comida** tiene efectos distintos (por ejemplo: manzana +hambre; tarta +felicidad −salud; ensalada +salud). Cada especie tiene una comida **favorita** que da ×1.5.
- La **tienda** vende comida, medicina, juguetes, huevos y cosméticos (accesorios y fondos).
- **Monedas**: blandas (se ganan jugando) y gemas (recompensas o compra integrada, opcional).

### 4.4 Minijuegos
Hay tres minijuegos iniciales, implementados de forma nativa en cada cliente:
1. **Atrapa la comida**: caen alimentos y se mueve a la mascota.
2. **Memoria**: parejas de cartas.
3. **Reflejos/ritmo**: toques a tiempo.

**Antitrampas**:
1. El servidor emite un `sessionToken` con seed, `startedAt` y `gameId`.
2. El cliente envía la puntuación al terminar.
3. El servidor comprueba la duración mínima y máxima y la puntuación máxima plausible para la seed.
4. Hay un tope diario de recompensas.

Recompensas: XP, monedas, felicidad y gasto de energía.

### 4.5 Niveles
- **XP necesaria**: `xp(n) = round(100 · n^1.5)`. El nivel máximo es 100.
- Al subir de nivel ganas monedas y puntos de stat de combate para repartir, y en los niveles marcados desbloqueas habilidades y evolución.
- También hay **nivel de cuenta**, que desbloquea huecos para más mascotas, tipos de huevo y la arena.

### 4.6 Peleas asíncronas
- **Stats de combate**: HP, ATK, DEF, VEL y ESP. Se calculan como base de la especie × multiplicador de rareza × nivel + puntos repartidos.
- **Elemento** por especie (fuego, agua, planta, eléctrico, sombra, luz), con tabla de ventajas.
- **Habilidades**: hasta 4 equipadas, que se desbloquean por nivel.
- **Flujo**:
  1. El jugador elige su mascota y pulsa "Buscar rival".
  2. El servidor busca una mascota "en defensa" con ELO parecido.
  3. El servidor simula el combate por turnos de forma **determinista** (con seed) y lo controla una IA de reglas en ambos bandos, según la estrategia configurada (agresiva, defensiva o equilibrada).
  4. El servidor devuelve un **log de repetición** (lista de eventos) que el cliente anima.
- **Progresión**: hay ELO, ligas (Bronce → Mítica), clasificación semanal en Redis y recompensas al final de cada temporada.
- **Límites**: pelear gasta energía, y hay un máximo de peleas al día. Al defensor le llega una notificación con el resultado.
- El estado de ánimo y la salud de la mascota modifican su rendimiento, lo que conecta el cuidado con el combate.

### 4.7 Inteligencia (IA)
- **Activación**: el usuario conecta un proveedor (BYOK) o se suscribe. A partir de ahí la mascota está **"despierta"**.
- **Estadística `intelligence`** (0–1000): sube al conversar, al completar tareas y al usar herramientas, y desbloquea tres niveles:
  1. **Charla** (0+): conversación con personalidad. El prompt de sistema se genera a partir de la especie, la rareza, el carácter, el estado de ánimo y las estadísticas, y el ánimo cambia el tono.
  2. **Memoria** (200+): la mascota resume las conversaciones en `PetMemory` (recuerdos y hechos del usuario) y los recupera para conversaciones futuras.
  3. **Agente** (500+): usa herramientas (*function calling*):
     - `get_my_status`, `request_food`, `suggest_minigame` y `summarize_last_battles`.
     - `create_reminder`, `list_reminders` y `search_memory`.
     - En el escritorio: `open_url` y `read_clipboard`, que siempre piden confirmación.
     - Cualquier acción con efectos muestra una tarjeta de confirmación en la interfaz.
- La mascota también puede iniciar conversación (un saludo diario o un aviso si tiene hambre), con frecuencia configurable.

---

## 5. Arquitectura del backend (NestJS)

### 5.1 Módulos
| Módulo | Responsabilidad |
|---|---|
| `auth` | Sign in with Apple, Google y email+contraseña (argon2id); JWT de acceso (15 min) + refresh rotatorio; device code para escritorio |
| `users` | Perfil, monedas, gemas, nivel de cuenta, zona horaria y ajustes |
| `game-data` | Carga species, patterns, foods y balance; endpoint de catálogo cacheado |
| `hatching` | Huevos, incubación, tiradas de rareza y patrón, pity |
| `pets` | Estado, deterioro perezoso, acciones (alimentar, limpiar, dormir, curar), evolución |
| `inventory` / `shop` | Objetos, compra y uso |
| `minigames` | Sesiones, validación y recompensas |
| `battles` | Emparejamiento, simulación determinista, ELO, repeticiones y clasificación |
| `ai` | Proveedores LLM, keys cifradas, chat en streaming, memoria, herramientas y cuotas |
| `realtime` | Gateway Socket.IO: sincronización entre dispositivos y streaming del chat |
| `health` | `/health` y métricas |
| **Módulos de la Fase 7 (33 features)** ||
| `missions` | Misiones diarias/semanales, generación, tracking, scheduler con paginación, claims |
| `chests` | Cofres, drop engine ponderado, pity per-cofre, historial, WebSocket `chest:opened` |
| `observability` | OpenTelemetry SDK, spans (request/DB/Redis), métricas, log serializer, W3C trace context |
| `dev` (DevKit) | Actions de debug, seed rápido, hot-reload de game-data, watcher de archivos |
| `environmental` | Clima (Open-Meteo), hora local, festivales, inactividad, contexto para IA |
| `bonding` | Bonding meter 0-100, niveles de amistad, recompensas por nivel |
| `notifications` | Notificaciones IA personalizadas por personalidad, límites diarios |
| `achievements` | Logros, constelación visual, puntos de logro, recompensas |
| `assets` (Edge/CDN) | Served assets, versioning por hash, preloading predictivo |
| `habitat` | Habitaciones, muebles, bonificaciones pasivas, colocación grid |
| `seasons` | Temporadas, pase gratuito/premium, ligas por temporada |
| `breeding` | Cruces, genética, mutaciones, incubación, tickets |
| `raid` | Boss semanal, ataques, progreso global, recompensas |
| `tournament` | Bracket knockout, rondas, cuotas, recompensas |
| `cooking` | Recetas, minijuego de cocina, buffs de combate |
| `training` | Entrenamiento elemental, buffs temporales |
| `genes` | Genes ocultos, temperamento, efectos en combate y IA |
| `adventure` | Aventura narrativa IA, escenas, decisiones, recompensas |
| `ai-router` | Multi-model router, fallback cascading, token budget |
| `voice` | STT, TTS, voz por especie, prosodia emocional |
| `presence` | Multi-device presence, cuidado cooperativo |
| `sync` | CRDT, delta sync, offline-first |
| `spectator` | Espectación en vivo, highlights, replays |
| `modding` | UGC, workshop, sandbox, rating |
| `webhooks` | Public API, API keys, webhooks configurables |
| `security` | Token rotación, device fingerprint, E2E encryption |
| `reengagement` | Welcome back, diario de ausencia, forgiveness ritual |
| `buddies` | Pet buddies, interacciones, bonding mutuo |
| `rituals` | Hábitos, streaks, detección de rutinas |
| `mood-theater` | Micro-narrativas, moment capture, stickers |
| `accessibility` | Prefs, alto contraste, minijuegos accesibles, modo simple |
| `gifting` | Gifting, care packages, group feeding |

### 5.2 Modelo de datos (Prisma, resumen)
```
User(id, email, appleSub, googleSub, displayName, timezone, coins, gems, accountXp, createdAt)
RefreshToken(id, userId, hash, expiresAt, revokedAt)
DeviceLink(code, userId, expiresAt, confirmedAt)
Species(id, name, element, rarity, baseStats json, favoriteFood, spriteKey)
Pattern(id, name, minRarity)
Egg(id, userId, eggType, startedAt, hatchesAt, hatchedPetId?)
Pet(id, userId, speciesId, rarity, patternId, palette json, shiny, visualSeed, nickname,
    level, xp, stage, hunger, happiness, energy, hygiene, health, sick, sleeping,
    combatStats json, statPoints, skills json, elo, strategy, intelligence, awakened,
    personality json, lastTickAt, createdAt)
PityCounter(userId, sinceSuperRare, sinceLegendary)
Item(id, kind, name, effects json, price)  ·  InventoryItem(userId, itemId, qty)
MinigameSession(id, userId, petId, gameId, seed, startedAt, finishedAt, score, rewarded)
Battle(id, attackerPetId, defenderPetId, seed, winnerPetId, log json, eloDelta, createdAt)
AiConfig(userId, mode[byok|managed], provider[openai|hermes|custom], baseUrl, model,
         encryptedKey, keyIv, keyTag, lastTestedAt)
ChatMessage(id, petId, role, content, toolCalls json, tokens, createdAt)
PetMemory(id, petId, kind[fact|summary], content, createdAt)
Reminder(id, userId, petId, text, dueAt, delivered)
Subscription(userId, platform, productId, originalTxId, status, expiresAt)
PushToken(userId, platform, token)
```

### 5.3 API principal (REST, `/v1`)
- **Auth**: `POST /auth/apple|google|register|login|refresh|logout`, `POST /auth/device/start`, `POST /auth/device/confirm`, `POST /auth/device/poll`
- **Catálogo y usuario**: `GET /catalog`, `GET /me`, `PATCH /me`
- **Huevos**: `GET /eggs`, `POST /eggs/buy`, `POST /eggs/:id/hatch`
- **Mascotas**: `GET /pets`, `GET /pets/:id`, `POST /pets/:id/feed|clean|sleep|wake|heal`, `PATCH /pets/:id` (apodo, estrategia, skills, stats)
- **Tienda**: `GET /shop`, `POST /shop/buy`, `GET /inventory`
- **Minijuegos**: `POST /minigames/:gameId/start`, `POST /minigames/sessions/:id/finish`
- **Peleas**: `POST /battles` (busca rival y simula), `GET /battles`, `GET /battles/:id`, `GET /leaderboard`
- **IA**:
  - `GET /ai/config`, `PUT /ai/config`, `POST /ai/config/test`, `DELETE /ai/config`
  - `POST /pets/:id/chat` (SSE), `GET /pets/:id/chat/history`
  - `GET /pets/:id/memories`, `DELETE /pets/:id/memories/:mid`
  - `POST /pets/:id/tool-calls/:callId/confirm`
- **Suscripciones**: `POST /subscriptions/verify`, `POST /webhooks/appstore`, `POST /webhooks/googleplay` (pendiente, Fase 5: el módulo no existe todavía)
- **Push**: `POST /push-tokens` (pendiente, Fase 5)
- **WebSocket** (`/realtime`): eventos `pet:update`, `chat:delta`, `battle:result` y `notification`

### 5.4 Subsistema de IA
- **Interfaz `LlmProvider`**:
  ```
  chat(messages, tools, opts): AsyncIterable<Delta>
  test(): Promise<boolean>
  ```
- **`OpenAiCompatibleProvider`** (`baseURL` + `apiKey` + `model`) cubre:
  - **OpenAI**: Responses API o Chat Completions.
  - **Hermes Agent** (Nous Research): su `API server` es compatible con OpenAI (Chat Completions y Responses). Se activa con `API_SERVER_ENABLED=true` y `API_SERVER_KEY`, y por defecto escucha en `127.0.0.1:8642`.
    - Su streaming emite eventos extra `hermes.tool.progress`; se usan para mostrar "pensando…" o se ignoran.
    - Si hiciera falta, hay un `HermesProvider` dedicado detrás de la misma interfaz.
  - **Cualquier endpoint compatible** (OpenRouter, Ollama, etc.).
- **Seguridad**:
  - Las keys se cifran con AES-256-GCM. La clave maestra está en `AI_KEY_ENCRYPTION_KEY` o en un KMS. Las keys **nunca se devuelven** al cliente; solo se muestra `sk-…abcd`.
  - Protección SSRF en `baseUrl`: solo HTTPS y se bloquean rangos privados/loopback.
  - Un Hermes **local** se conecta desde la app de escritorio, que hace de proxy en local.
  - Moderación de entrada y salida, límites de peticiones por usuario y cuota mensual de tokens para el modo suscripción (contador en Redis).
  - Las herramientas con efectos requieren confirmación explícita del usuario.

---

## 6. App Android
- **Stack**:
  - Kotlin 2.x y Jetpack Compose (BOM más reciente) con Material 3 Expressive: Dynamic Color, formas y movimiento expresivos, edge-to-edge y predictive back.
  - Arquitectura MVVM + UDF (`StateFlow`), Hilt y Navigation Compose type-safe.
  - Retrofit/OkHttp con Kotlinx Serialization, Room (caché offline), DataStore, Coil, WorkManager y FCM.
  - Credential Manager (Google), Play Billing 8 y widget Glance (estado de la mascota en la pantalla de inicio).
- **Módulos**: `:app`, `:core:network` (cliente generado), `:core:data`, `:core:designsystem` y `:feature:{home,hatch,care,shop,minigames,arena,chat,collection,settings}`.
- **Renderizado de la mascota**: `PetSprite` implementa composición acelerada por hardware. En Android 13+ (API 33–37) usa `RuntimeShader` (AGSL) con `RenderEffect` para componer `base.png`, `mask.png` y `pattern.png` en un solo draw call en GPU. En API 26–32 recurre a fallback con `BlendMode.Multiply` en Canvas. Aplica **In-Memory Baking** (se hornea el sprite sheet una vez sobre un `Bitmap` en caché y las animaciones reproducen los cuadros de esa textura). Soporta 14 estados de animación con tabla de fallbacks.

## 7. App iOS
- **Stack**:
  - Swift 6 y SwiftUI para iOS 27 con Liquid Glass: `TabView` con la barra de pestañas de iOS 27, `NavigationStack` y `.glassEffect`.
  - `@Observable`, async/await, SwiftData (caché) y cliente generado con `swift-openapi-generator`.
  - Sign in with Apple, StoreKit 2, APNs, WidgetKit y Live Activity ("tu huevo eclosiona en 12 min").
- **Renderizado de la mascota**: `SpriteView` renderizando un `SKSpriteNode` con un `SKShader` personalizado en Metal/GLSL que recibe las 3 texturas (`u_base`, `u_mask`, `u_pattern`) y los uniformes de color y transformación derivados con Mulberry32. Aplica baking en textura en memoria para garantizar 60 FPS estables.

## 8. Mascota de escritorio (Tauri 2)
- **Ventana**: transparente, sin decoración, siempre visible y sin icono en la barra de tareas; ocupa la parte inferior de la pantalla principal.
- **Renderizado de la mascota (`PetView`)**: composición por capas en tiempo real mediante un `<canvas>` offscreen en memoria que hornea el sprite sheet completo al cargar la mascota (`baked_sheet`), reproduciendo los cuadros a 60 FPS a partir de `anim.json`. Soporta transformaciones procedurales (squash & stretch elástico al hacer clic, retroceso en combate) y catálogo de 14 animaciones con fallbacks en caliente.
- **Movimiento**: la mascota camina, se sienta y duerme con una máquina de estados. Se puede arrastrar con el ratón.
- **Clics a través de la ventana**: `set_ignore_cursor_events` afecta a toda la ventana, así que un bucle de unos 30 Hz en Rust consulta la posición global del cursor y desactiva el paso de clics solo cuando está sobre el sprite.
- **Bandeja del sistema**: alimentar, jugar, abrir el chat, ver estado, pausar y salir. Plugins: `autostart`, `notification`, `updater`, `single-instance`, `global-shortcut` (abrir el chat) y `store` (preferencias).
- **Panel de control**: una segunda ventana normal (no transparente) con login por email, eclosión, inventario/comida, estadísticas y chat. Como el escritorio es el **primer cliente**, este panel sirve para probar todo el backend antes de que existan las apps móviles.
- **Vinculación**: al principio se hace login directo por email. Cuando lleguen las apps móviles se añade el código de dispositivo (la app muestra un código y se confirma en el móvil). El token se guarda hoy en `localStorage` del webview; el objetivo (ver S-09) es guardarlo en el llavero del sistema (plugin `keyring` o `stronghold`) con CSP activa.
- **Sincronización** por WebSocket: lo que pasa en el móvil se refleja al momento en el escritorio.
- **Chat**: con la IA desbloqueada aparece una burbuja de chat y comentarios proactivos.
- **Hermes local**: si el usuario lo elige, el escritorio habla directamente con `localhost:8642` y sincroniza los mensajes con el backend.
- **Distribución**: instalador NSIS/MSIX firmado en Windows, `.dmg` firmado y notarizado en macOS, y auto-actualización.

---

## 9. Fases de implementación

### Fase 0 — Preparación
- [ ] Verificar las versiones estables actuales (sección 2)
- [ ] `git init`, `.gitignore` por plataforma, `README.md` y `docs/`
- [ ] `docker-compose.yml` (PostgreSQL 17, Redis 7)
- [ ] CI básica en GitHub Actions (lint y tests por proyecto)
- [ ] Arte provisional: 3 especies × 4 animaciones y 4 patrones (placeholder)
- **Hecho cuando**: `docker compose up` arranca y la CI está en verde con los proyectos vacíos.

> Orden: **el backend y la mascota de escritorio avanzan juntos**. Cada funcionalidad del backend se prueba enseguida desde el escritorio, en este mismo PC con Windows y sin necesidad de Mac ni emulador. Las apps móviles empiezan cuando el núcleo de la API está estable.

### Fase 1 — Núcleo del backend + mascota de escritorio
- [ ] Backend: scaffold de NestJS, configuración (validada con zod), Prisma, migraciones y seed de `game-data`
- [ ] Backend: módulos `auth` (de momento email+contraseña), `users`, `game-data`, `hatching` (rareza, patrón y pity), `pets` (deterioro perezoso y acciones), `inventory`/`shop` (comida) y `realtime` (WebSocket `pet:update`)
- [ ] Backend: exportación de OpenAPI y generación del cliente TypeScript (`openapi-typescript`)
- [ ] Escritorio: scaffold de Tauri 2 (Svelte/TS), ventana transparente siempre visible, `PetView` (sprite + patrón + paleta), máquina de estados (andar, sentarse, dormir, comer) y clics a través de la ventana
- [ ] Escritorio: bandeja del sistema y panel de control (login, eclosión con animación, comida/inventario y estadísticas)
- [ ] Escritorio: sincronización por WebSocket; la mascota cambia de animación según su estado (hambre, sueño, tristeza)
- [ ] Tests: distribución de rareza (1 M de tiradas), pity, deterioro y e2e de auth → eclosión → alimentar
- **Hecho cuando**: en Windows te registras desde el panel, eclosionas un huevo, la mascota aparece paseando por la pantalla con su rareza y patrón, la alimentas desde la bandeja, ves bajar sus estadísticas con el tiempo y sube de nivel.

### Fase 2 — Juego (backend + escritorio)
- [ ] Backend: `minigames` (sesiones con antitrampas), tienda completa, evolución por etapas, enfermedad y sueño
- [ ] Escritorio: los 3 minijuegos en el panel, tienda, colección, notificaciones nativas del sistema y autoarranque
- **Hecho cuando**: los minijuegos dan XP y monedas validadas por el servidor, la mascota evoluciona y avisa de que tiene hambre.

### Fase 3 — Inteligencia (IA) (backend + escritorio)
- [ ] Backend: `LlmProvider` + `OpenAiCompatibleProvider` (OpenAI y Hermes), cifrado de keys, protección SSRF, `POST /ai/config/test` y chat en streaming por SSE
- [ ] Backend: generador de personalidad y prompt, estadística `intelligence` y desbloqueos, memoria (resúmenes y búsqueda), herramientas de agente con confirmación, recordatorios, moderación y cuotas
- [ ] Escritorio: ajustes de IA (BYOK), burbuja de chat con streaming, tarjetas de confirmación de herramientas, mensajes proactivos y modo **Hermes local** (`localhost:8642`)
- [ ] Tests con un mock de LLM compatible con OpenAI; prueba manual contra OpenAI y un Hermes Agent real
- **Hecho cuando**: con una key propia la mascota del escritorio conversa, recuerda hechos en sesiones posteriores y, en nivel Agente, crea un recordatorio previa confirmación.
- *(La suscripción con la key del servidor se activa en la fase 5, porque necesita las compras integradas de las tiendas móviles.)*

### Fase 4 — Peleas asíncronas (backend + escritorio)
- [ ] Backend: motor de combate determinista (paquete aislado y testeado), elementos, habilidades, emparejamiento por ELO, ligas, clasificación en Redis y temporadas
- [ ] Escritorio: Arena en el panel, configuración de estrategia y habilidades, y reproductor de repeticiones
- [ ] Tests: con la misma seed se obtiene el mismo log, la tabla de elementos y el balance (simulación de miles de combates por rareza)
- **Hecho cuando**: dos cuentas de prueba pelean, se ve la repetición animada y el ELO se actualiza en ambas.

### Fase 4b — Ambientación y vida del pet (backend + escritorio)
- [ ] Backend: módulo `environmental` (hora del día por `timezone`, clima real vía Open-Meteo con cache en Redis y fallback, inactividad por heartbeat y festividades), endpoints `GET /environmental/status`, `POST /environmental/activity` y `GET /environmental/festivals/upcoming`, modificadores ambientales sobre los vitales dentro del *lazy tick* y contexto ambiental en el prompt de la IA.
- [ ] Datos: sección `environmental` en `balance.json` y `festivals.json`; `User.latitude/longitude/birthday` (opt-in) vía migración y `PATCH /me`.
- [ ] Escritorio: cliente de heartbeat cada 60 s, geolocalización opt-in, overlay de accesorios (paraguas, gorro, sombrerito) y `environmental:changed` por WebSocket.
- **Hecho cuando**: con coordenadas guardadas, `GET /environmental/status` devuelve la hora local y el clima real (servido de cache en 30 min, con fallback a `unknown` si la API cae), el clima modifica los vitales en el *lazy tick*, el pet entra en modo `solo` tras 2 h sin heartbeat y vuelve a `active` al reenviarlo, y la mascota muestra el accesorio (p. ej. paraguas si llueve, sombrerito en Navidad) y el contexto en su chat.

### Fase 5 — Apps móviles nativas (Android + iOS)
- [ ] Backend: Sign in with Apple y Google, código de dispositivo (vincular el escritorio desde el móvil), `notifications` (APNs/FCM con BullMQ) y `subscriptions` (StoreKit 2, Play Billing, webhooks y modo IA gestionado)
- [ ] Android: Compose con M3 Expressive y todas las pantallas (Inicio, Eclosión, Comida, Minijuegos, Arena, Chat IA, Colección, Ajustes), widget Glance, FCM y Play Billing
- [ ] iOS: SwiftUI con Liquid Glass y las mismas pantallas, WidgetKit, Live Activity, APNs y StoreKit 2 (se compila en Mac o en la CI)
- **Hecho cuando**: la misma cuenta y mascota funcionan en el móvil y en el escritorio, sincronizadas al momento, y la suscripción de IA se puede comprar en las dos tiendas.

### Fase 6 — Pulido y lanzamiento
- [ ] Escritorio: firma (Windows) y notarización (macOS), auto-actualización, build de macOS en la CI
- [ ] Arte definitivo de las 21 especies, patrones, sonidos y háptica
- [ ] Ajuste de balance con datos, analítica (eventos clave) y monitorización de errores (Sentry)
- [ ] Seguridad: rate limiting, auditoría de dependencias, revisión de keys y pentest básico
- [ ] Accesibilidad (VoiceOver/TalkBack, Dynamic Type) y localización (ES/EN)
- [ ] Publicación en App Store, Google Play y descargas de escritorio; despliegue del backend (contenedores con Postgres y Redis gestionados)

### Fase 7 — Funcionalidades Expandidas (33 features)
- [x] **Oleada 1 — Hábito e Infraestructura**: Misiones, Cofres, Observability, DevKit, Environmental, Bonding, Notifications IA, Logros, Edge/CDN
- [ ] **Oleada 2 — Meta e IA**: Hábitat, Temporadas, Breeding, Raid, Torneo, Cocina, Entrenamiento, Genes, Aventura Narrativa IA
- [ ] **Oleada 3 — Comunidad y Ecosistema**: AI Router, Voice AI, Multi-Device, Offline CRDT, Spectator, Modding, Public API, Security, iOS+Skia, Welcome Back, Buddies, Rituals, Mood Theater, Accessibility, Gifting
- *(Actualización: las oleadas 2 y 3 están implementadas en el backend (migración `20261114120000_wave2_wave3`), pero no cumplen el criterio «Hecho cuando» porque la mayoría de sus módulos no tiene tests, ningún cliente las consume y varias son prototipos; ver [`informes/MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md`](informes/MEJORAS_FUNCIONALIDAD_RENDIMIENTO.md), F-03 a F-10.)*
- **Hecho cuando**: cada feature tiene SDD completo (spec/plan/tasks en `.specify/memory/features/`), código backend funcional, tests unitarios pasando y build limpio.
- **Detalle**: ver [`docs/NUEVAS_FUNCIONALIDADES.md`](NUEVAS_FUNCIONALIDADES.md) y [`docs/specs/`](specs/) para las 33 especificaciones.

---

## 10. Verificación
- **Backend**:
  - Tests unitarios con Jest de rareza, pity, deterioro, motor de combate, XP, cifrado y validación de minijuegos.
  - Tests e2e con Supertest contra el Postgres/Redis de docker-compose.
- **Android**: tests de ViewModel y de UI con Compose en un emulador con API 37.
- **iOS**: Swift Testing y XCUITest en un simulador de iOS 27. **Compilar y probar iOS y macOS requiere un Mac con Xcode 27**: desde Windows se escribe el código y se compila en un Mac o en la CI (runner macOS).
- **Escritorio**: `tauri dev` en Windows; build de macOS en la CI.
- **Flujo de punta a punta**: registrarse → eclosionar → alimentar → minijuego → subir de nivel → pelear → conectar la key → chatear → ver la misma mascota en el escritorio.

## 11. Riesgos y notas
- **Arte**: históricamente el mayor cuello de botella. Se resuelve definitivamente con el **Pipeline de Composición Determinista por Capas en Tiempo Real** ([docs/ART_PIPELINE.md](ART_PIPELINE.md)): cada especie requiere únicamente 3 archivos (`base.png`, `mask.png`, `anim.json`) a 128x128 px, se hornea en memoria para rendimiento instantáneo a 60 FPS, y se valida en CI con `scripts/validate-assets.js`.
- **Rendimiento del backend**: el deterioro perezoso evita tareas por mascota y escala bien.
- **Cumplimiento de las tiendas**: las probabilidades de los huevos deben **publicarse** (requisito de Apple y Google para mecánicas aleatorias) y la suscripción de IA debe venderse con compras integradas.
- **Coste de IA**: la cuota de tokens del modo suscripción debe ajustarse para que salga rentable.
