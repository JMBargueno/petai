# PetAI — Especificación de API

Este documento describe la estructura de los endpoints REST (`/v1`) y los eventos del Gateway en tiempo real (`/realtime`).

---

## 1. Convenciones y Autenticación
- **Base URL**: `http://localhost:3000/v1`
- **Autenticación**: Cabecera `Authorization: Bearer <accessToken>`.
- **Formato de respuesta**: JSON uniforme con timestamp e identificador de petición.

---

## 2. Endpoints REST

### 2.1 Autenticación (`/auth`)
- `POST /auth/register` `{ email, password, displayName? }`: Registro (Argon2id). El correo se normaliza a minúsculas (máx. 254) y debe ser válido; la contraseña tiene de 8 a 128 caracteres; `displayName` de 1 a 50 sin caracteres de control. Devuelve `accessToken`, `refreshToken` y el usuario. Entradas inválidas → 400; correo repetido → 409.
- `POST /auth/login` `{ email, password }`: Autenticación. Cuenta inexistente y contraseña errónea dan la misma respuesta (401) y el mismo coste de cálculo (sin pistas por tiempos).
- `POST /auth/refresh` `{ refreshToken }`: Rotación del token de refresco, atómica (un token solo se canjea una vez). Reutilizar un token ya revocado hace más de 10 s se trata como robo y **revoca todas las sesiones** de la cuenta.
- `POST /auth/logout` `{ refreshToken }`: Revoca ese token (idempotente).

**Límite de intentos** (429 con `retryAfterSeconds`): 10 fallos de login por cuenta+IP y 100 por IP cada 15 min (un acierto reinicia el de la cuenta), 10 registros por IP y hora, 60 refresh por IP y minuto. Se configura con `AUTH_LOGIN_MAX_FAILS_PER_ACCOUNT`, `AUTH_LOGIN_MAX_FAILS_PER_IP`, `AUTH_LOGIN_WINDOW_MINUTES`, `AUTH_REGISTER_MAX_PER_IP` y `AUTH_REFRESH_MAX_PER_MINUTE`. Detrás de un proxy hay que declarar `TRUST_PROXY` (nº de saltos de confianza) para que cuente la IP real. Está en memoria: con varias instancias del backend debe pasar a Redis.
- `POST /auth/device/start`: Iniciar vinculación para clientes de escritorio (genera código de 6 dígitos).
- `POST /auth/device/confirm`: Confirmar código desde app móvil autenticada.
- `POST /auth/device/poll`: Comprobación periódica desde el cliente de escritorio hasta confirmación.

### 2.2 Usuario y Perfil (`/users` y `/me`)
- `GET /me`: Obtener perfil del usuario actual (monedas, gemas, nivel de cuenta, zona horaria).
- `PATCH /me`: Actualizar preferencias (zona horaria, ajustes de notificación).

### 2.3 Catálogo de Juego (`/catalog`)
- `GET /catalog`: Devuelve especies, patrones, comidas y tablas de balance (cacheadas).

### 2.4 Huevos y Eclosión (`/eggs`)
- `GET /eggs`: Lista de huevos del usuario con tiempo restante de incubación.
- `POST /eggs/buy`: Comprar un huevo con monedas o gemas.
- `POST /eggs/:id/hatch`: Eclosionar un huevo incubado. Devuelve los datos de la nueva mascota (`Pet`).

### 2.5 Mascotas (`/pets`)
- `GET /pets`: Listar mascotas del usuario (con cálculo de tick perezoso aplicado).
- `GET /pets/:id`: Detalle completo de una mascota.
- `POST /pets/:id/feed`: Alimentar con un ítem del inventario (`{ itemId: string }`).
- `POST /pets/:id/clean`: Bañar/limpiar a la mascota.
- `POST /pets/:id/sleep`: Poner a dormir a la mascota.
- `POST /pets/:id/wake`: Despertar a la mascota.
- `POST /pets/:id/heal`: Administrar medicina si la mascota está enferma.
- `PATCH /pets/:id`: Modificar apodo, estrategia de combate o distribuir puntos de estadísticas.

### 2.6 Tienda e Inventario (`/shop`, `/inventory`)
- `GET /shop`: Listar artículos disponibles para compra.
- `POST /shop/buy`: Comprar artículo (`{ itemId: string, quantity: number }`).
- `GET /inventory`: Obtener los objetos y consumibles del usuario.

### 2.7 Minijuegos (`/minigames`)
- `GET /minigames`: Lista de minijuegos (`catch_food`, `memory_match`, `reflex`) con duración y recompensas máximas.
- `POST /minigames/:gameId/start` `{ petId }`: Inicia una sesión y devuelve `sessionId`, `seed`, `durationSeconds` y `expiresAt`. Falla si la mascota duerme o está sin energía, durante el cooldown, o al superar el límite diario de partidas recompensadas.
- `POST /minigames/sessions/:id/finish` `{ score }`: Envía la puntuación final (entero). La sesión es de un solo uso; se rechaza si caducó, si fue demasiado corta o si la puntuación supera el máximo por segundo del juego. Devuelve `{ score, rewards, pet }` (monedas, XP, felicidad y coste de energía).

### 2.7b Tienda y evolución
- `GET /shop?kind=food|medicine|evolution`: Catálogo, filtrable por tipo.
- `POST /shop/buy` `{ itemId, quantity }`: `quantity` entero de 1 a 99; el cobro es atómico.
- `POST /pets/:id/evolve`: Forma final; requiere mascota adulta de nivel ≥ 50 y consume una `evolution_stone`.
- `feed` solo acepta objetos `food`; `heal` solo `medicine`. El tipo se valida antes de consumir.
- Ciclo de sueño: según la zona horaria del usuario (`PATCH /me`), de 22:00 a 07:00 estar despierto gasta 1.5x energía y dormir recupera 1.25x energía y regenera salud.

### 2.8 Peleas Asíncronas (`/battles`)
Perfil de combate de la mascota:
- `GET /pets/:id/combat`: estadísticas efectivas (`round(base·rareza·(1+0.05·nivel) + puntos)`), puntos repartidos y disponibles, ánimo (multiplicador de rendimiento 0.8–1.0), ELO, liga y puntos que faltan para la siguiente, habilidades desbloqueadas/equipadas, peleas de las últimas 24 h, límite, coste de energía y `canFight`/`reason`.
- `POST /pets/:id/combat/stats` `{ hp?, atk?, def?, vel?, esp? }`: reparte puntos (enteros ≥ 0, sin superar los disponibles; cierre optimista ante repartos simultáneos).
- `PUT /pets/:id/combat/skills` `{ skills: string[] }`: equipa de 1 a 4 habilidades únicas, desbloqueadas, del elemento de la especie o neutras y con al menos un ataque.

Peleas:
- `POST /battles/matchmake` `{ petId }`: busca un rival con ELO parecido (ventana ±100 que se amplía hasta ±400; se evita repetir rival en la última hora), simula el combate **determinista** (semilla del servidor) y devuelve `{ battleId, seed, result, opponent, elo, rewards, replay, pet }`. Si no hay rival cercano se enfrenta a un **bot determinista** (no puntúa en el ELO y da la mitad de recompensa). Requiere mascota despierta con ≥ 15 de energía y respeta el límite de 10 peleas por 24 h (429); una pelea a la vez por usuario.
- `GET /battles?limit=`: historial del usuario (como atacante y como defensor), visto desde su perspectiva.
- `GET /battles/:id`: detalle y repetición, solo para los dos participantes (404 para el resto).
- Al defensor real se le avisa por WebSocket con el evento `battle:defended` `{ battleId, defenderPetName, attackerName, won, draw, eloDelta, elo }` y el resultado queda en su historial.

Clasificación y ligas:
- `GET /leaderboard?scope=global|weekly&limit=&petId=`: global = ELO actual de las mascotas que han peleado; semanal = puntos de liga de la semana ISO (victoria 3, empate 1, derrota 0, solo para el atacante). Vive en Redis (ZSET) y, si Redis no responde, se calcula desde PostgreSQL. Con `petId` propio añade `me: { rank, score }`.
- `GET /arena/leagues`: ligas (Bronce → Mítica), límites y recompensas.

**Formato de la repetición** (`replay`): `{ version: 1, seed, participants: [atacante, defensor], events }`. Cada participante lleva su instantánea (estadísticas efectivas, ánimo, habilidades, estrategia, `isBot`), de modo que la repetición no depende de datos posteriores. Eventos: `round`, `move` (habilidad, acierto, crítico, multiplicador elemental, daño y vida de ambos), `heal`, `guard`, `status` (quemadura, ralentización, savia), `dot`, `faint` y `end` (ganador 0/1/null, motivo y rondas). Simular de nuevo con la misma semilla reproduce exactamente los mismos eventos.

### 2.9 Inteligencia Artificial (`/ai` y `/pets/:id/chat`)
- `GET /ai/config`: Obtener configuración actual de IA (proveedor, modelo, máscara de clave).
- `PUT /ai/config` `{ provider, baseUrl?, model?, apiKey? }`: Configurar proveedor (`openai` | `hermes` | `custom`) y API key BYOK, cifrada con AES-256-GCM. `baseUrl` es obligatoria salvo para `openai`; `apiKey` solo es obligatoria la primera vez. La `baseUrl` debe ser HTTPS y no resolver a direcciones privadas/loopback (protección SSRF); se revalida en cada uso. Un Hermes local se conecta desde el escritorio, no desde el backend.
- `DELETE /ai/config`: Elimina la configuración y la key almacenada.
- `POST /ai/config/test`: Comprobar validez de la clave y conectividad con el modelo.
- `POST /pets/:id/chat` `{ message }` (máx. 1000 caracteres, 20 mensajes/min por usuario): Conversación en streaming SSE. Eventos: `delta` `{text}`, `done` `{message, intelligence, tier}` y `error` `{message}`. El prompt de sistema se genera en el servidor (especie, carácter, ánimo y estadísticas). Solo se guarda el intercambio si se completa; cada charla suma 1 a `intelligence`.
- `GET /pets/:id/chat/history?limit=`: Historial de la conversación (usuario y mascota).
- `GET /ai/usage`: Tokens consumidos en el mes en curso (UTC), peticiones, cuota y restante (`null` = sin límite). Cuota por modo: `AI_MONTHLY_TOKEN_QUOTA_BYOK` (0 = ilimitada por defecto) y `AI_MONTHLY_TOKEN_QUOTA_MANAGED` (500 000). Al agotarla, el chat responde 429 hasta el mes siguiente. También cuentan la extracción de memoria y las respuestas bloqueadas; si el proveedor no informa del uso se estima (~4 caracteres por token).

#### Herramientas del escritorio
`POST /pets/:id/chat` acepta `clientTools: string[]` (solo se reconocen `open_url` y `read_clipboard`). Declaradas y con inteligencia ≥ 500, el modelo puede proponerlas. El servidor nunca las ejecuta: valida los argumentos (`open_url`: solo http/https, sin credenciales, sin localhost/IP privadas/nombres internos), crea una acción pendiente con `clientSide: true` y, al confirmar (`POST …/actions/:id/confirm`), devuelve `{ clientSide: true, tool, args }` una sola vez para que la app lo ejecute. `read_clipboard` no devuelve datos al servidor: la app envía el texto leído como un mensaje de chat normal (visible, moderado y sujeto a cuota).

#### Modo Hermes local
Para un Hermes Agent en el propio equipo (el backend no puede alcanzar un loopback):
- `POST /pets/:id/chat/local/context` `{ message }`: valida, aplica el límite de mensajes y la moderación de entrada, y devuelve `{ turnId, messages, maxTokens }` (o `{ moderated }`). No necesita proveedor configurado y no consume cuota. Con memoria (≥ 200) incluye los recuerdos; el prompt no promete herramientas.
- `POST /pets/:id/chat/local/sync` `{ turnId, reply }`: el turno es de un solo uso, caduca a los 5 min y es del usuario y mascota que lo pidieron. La respuesta (máx. 4000 caracteres) se modera; si pasa se guarda y sube la inteligencia, si no devuelve `{ moderated }` y no se guarda.
Límites: la respuesta la afirma el cliente (no debe usarse para nada competitivo), no hay herramientas de agente ni extracción de memoria, y la moderación de salida ocurre al sincronizar (el texto ya se mostró en local). La URL, el modelo y la key de Hermes se guardan solo en el equipo.

#### Moderación
Evento SSE `moderated` `{reason, message, hideUserMessage}` (el mensaje no se guarda y no gasta tokens salvo `output_leak`):
- `sensitive_data`: el mensaje contiene claves/tokens, contraseñas, tarjetas (Luhn) o IBAN; no se envía al proveedor ni se muestra.
- `self_harm`: se responde con recursos de ayuda (024 / 112) sin pasar por el modelo; funciona incluso sin proveedor de IA y con la cuota agotada.
- `prompt_injection`: intento evidente de jailbreak o de revelar el prompt.
- `output_leak`: la respuesta del modelo filtraba el prompt de sistema o un secreto; el streaming retiene los últimos 80 caracteres para bloquearla antes de mostrarla y no se guarda.
Límites: solo una respuesta en curso por usuario y 20 mensajes/min. La moderación es por reglas: no sustituye a un modelo de moderación de contenido.

#### Agente (intelligence ≥ 500)
Con 500+ de inteligencia el modelo recibe herramientas (*function calling*): `get_my_status`, `request_food`, `suggest_minigame`, `search_memory`, `list_reminders` y `create_reminder`. El usuario y la mascota salen siempre de la sesión, nunca de los argumentos del modelo. Se permiten hasta 3 vueltas de herramientas por mensaje. El stream SSE añade los eventos `tool` `{name}` (herramienta de lectura ejecutada) y `action` `{id, tool, summary, expiresAt}` (acción pendiente de confirmar).
- Las herramientas con efectos (`create_reminder`) **no se ejecutan**: se crea una acción pendiente (máx. 5 por usuario, caduca a los 10 min) y el servidor genera el texto de la tarjeta a partir de los argumentos validados.
- `GET /pets/:id/actions`: Acciones pendientes de confirmar.
- `POST /pets/:id/actions/:actionId/confirm`: Confirma y ejecuta (una sola vez; se revalidan los argumentos). `POST …/reject`: Rechaza.
- `GET /reminders`, `GET /reminders/due`, `POST /reminders/:id/delivered`, `DELETE /reminders/:id`: Recordatorios del usuario (máx. 20 pendientes). El escritorio consulta los vencidos cada minuto y avisa con una notificación.
- `GET /pets/:id/memories`: Recuerdos de la mascota (`kind`: `fact` | `summary`) y si la memoria está desbloqueada (intelligence ≥ 200). Tras cada 6 mensajes del usuario, el servidor resume la conversación y extrae hechos en segundo plano con el proveedor del usuario; se descartan los hechos sensibles (claves, números largos, instrucciones a la IA) y se guardan como máximo 50 hechos por mascota. Los recuerdos relevantes se inyectan en el prompt como datos, nunca como instrucciones.
- `DELETE /pets/:id/memories/:memoryId`: Olvidar un recuerdo. `DELETE /pets/:id/memories`: Borrar toda la memoria.
- `POST /pets/:id/tool-calls/:callId/confirm`: Confirmar o denegar una acción solicitada por el agente.

---

## 3. WebSocket Gateway (`/realtime`)
Conexión bidireccional basada en Socket.IO con autenticación por token en el handshake.

### Eventos del Servidor al Cliente:
- `pet:update`: Estado actualizado de la mascota (hambre, felicidad, salud, nivel).
- `chat:delta`: Fragmentos de texto generados por el LLM en tiempo real.
- `battle:result`: Notificación asíncrona de combate cuando otro jugador ataca la defensa de tu mascota.
- `inventory:update`: Cambios en monedas o ítems del usuario.
