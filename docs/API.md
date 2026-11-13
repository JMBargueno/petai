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
- `POST /auth/register`: Registro con email y contraseña (Argon2id). Devuelve `accessToken` y cookie `refreshToken`.
- `POST /auth/login`: Autenticación con email y contraseña.
- `POST /auth/refresh`: Renovación de `accessToken` mediante cookie o token de refresco rotativo.
- `POST /auth/logout`: Revocación del token de refresco actual.
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
- `POST /battles/matchmake`: Buscar rival por rango ELO y simular combate determinista. Devuelve `battleId` y el log de eventos de la repetición.
- `GET /battles/:id`: Consultar detalle y repetición de una batalla.
- `GET /leaderboard`: Clasificación semanal de la liga.

### 2.9 Inteligencia Artificial (`/ai` y `/pets/:id/chat`)
- `GET /ai/config`: Obtener configuración actual de IA (proveedor, modelo, máscara de clave).
- `PUT /ai/config` `{ provider, baseUrl?, model?, apiKey? }`: Configurar proveedor (`openai` | `hermes` | `custom`) y API key BYOK, cifrada con AES-256-GCM. `baseUrl` es obligatoria salvo para `openai`; `apiKey` solo es obligatoria la primera vez. La `baseUrl` debe ser HTTPS y no resolver a direcciones privadas/loopback (protección SSRF); se revalida en cada uso. Un Hermes local se conecta desde el escritorio, no desde el backend.
- `DELETE /ai/config`: Elimina la configuración y la key almacenada.
- `POST /ai/config/test`: Comprobar validez de la clave y conectividad con el modelo.
- `POST /pets/:id/chat` `{ message }` (máx. 1000 caracteres, 20 mensajes/min por usuario): Conversación en streaming SSE. Eventos: `delta` `{text}`, `done` `{message, intelligence, tier}` y `error` `{message}`. El prompt de sistema se genera en el servidor (especie, carácter, ánimo y estadísticas). Solo se guarda el intercambio si se completa; cada charla suma 1 a `intelligence`.
- `GET /pets/:id/chat/history?limit=`: Historial de la conversación (usuario y mascota).
- `GET /pets/:id/memories`: Consultar recuerdos persistidos de la mascota.
- `POST /pets/:id/tool-calls/:callId/confirm`: Confirmar o denegar una acción solicitada por el agente.

---

## 3. WebSocket Gateway (`/realtime`)
Conexión bidireccional basada en Socket.IO con autenticación por token en el handshake.

### Eventos del Servidor al Cliente:
- `pet:update`: Estado actualizado de la mascota (hambre, felicidad, salud, nivel).
- `chat:delta`: Fragmentos de texto generados por el LLM en tiempo real.
- `battle:result`: Notificación asíncrona de combate cuando otro jugador ataca la defensa de tu mascota.
- `inventory:update`: Cambios en monedas o ítems del usuario.
