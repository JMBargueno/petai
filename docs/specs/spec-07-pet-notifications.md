# Spec: Pet Notifications con Personalidad

## ID
Feature #7 — Oleada 1 "Notificaciones que no son spam"

## Resumen
Reemplaza notificaciones genéricas por mensajes personalizados según personalidad, bonding y contexto. Generados con IA (1 frase, 50 tokens) o plantillas, emitidos por tray/desktop notification.

## Contexto
Las notificaciones actuales son genéricas. Con esta feature se convierten en "mensajes de tu mascota": un pet valiente + bonding bajo dice "¡Oye! ¿Me dejas solo otra vez? 🙄" vs un tímido + bonding alto: "Hoy no quise molestarte, pero estoy aquí. 🌸". Conecta con `Pet.personality`, `bondingTier` (#6), IA, y Tauri notification plugin.

## Objetivos
- Convertir notificaciones de spam a mensajes personalizados.
- Respetar personalidad + bonding en el tono.
- Rate limit: máx 3/día por pet.
- No sobrecargar el LLM (1 call, 50 tokens, timeout 5s).

## User Stories
- Como jugador, quiero que las notificaciones suenen a MI pet, no a una app.
- Como jugador, quiero que un pet tímido no me "grite" cuando tiene hambre.
- Como jugador, quiero una notificación personalizada cuando gana una pelea.
- Como jugador, quiero desactivar ciertas categorías.

## Criterios de aceptación
- [ ] AC1: Cada notificación usa personalidad + bonding tier del pet.
- [ ] AC2: Con IA: LLM genera 1 frase (máx 50 tokens, timeout 5s → fallback plantilla).
- [ ] AC3: Sin IA: plantilla de `notifications.json` por (personalidad × tier × tipo).
- [ ] AC4: Rate limit: máx 3 push/día (configurable).
- [ ] AC5: Categorías: vitals_critical, interaction, achievement, arena, event.
- [ ] AC6: Toggle por categoría en `PATCH /me`.
- [ ] AC7: Emitida por WS `pet:notification` → desktop muestra con Tauri plugin.
- [ ] AC8: Máx 1 LLM call por evento (no 3 intents = 3 calls).

## Diseño técnico
### Backend
- **`notification-generator.service.ts`:** genera texto (IA o plantilla)
- **`notification-dispatcher.service.ts`:** decide SI notificar (rate limit, prefs, dedup)
- **Rate limit:** Redis `notify:count:{userId}:{date}` (counter, TTL 1d). Máx 3.
- **Dedup:** 3 eventos en 5min → 1 notificación (la más importante).
- **IA:** Si hay `AiConfig` → LLM call (50 tokens, timeout 5s). Si no → plantilla.

### Frontend
- WS listener → `notification.send({ title: petName, body: message, image: avatar })`
- `NotificationSettingsPanel`: toggles por categoría + rate limit slider
- Tray icon con badge si hay notificaciones pendientes

### Datos
- `shared/game-data/notifications.json`: plantillas por personality × tier × category

## Interfaz de API
- `PATCH /me` → `{ notificationPrefs: { vitals_critical: true, interaction: false, maxPerDay: 3 } }`
- `GET /me` → incluye `notificationPrefs`
- Sin endpoint de creación (interno por eventos).

## Modelo de datos
- `User`: añadir `notificationPrefs Json?`
- Sin modelos nuevos.

## Eventos y sincronización
- WS: `pet:notification` → `{ petId, petName, type, message, category }`
- Desktop: Tauri notification plugin (tray + OS). Offline → inbox.

## Dependencias
- Feature #6 (bondingTier), IA (AiConfig), Tauri notification, Pet.personality, Redis

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | notifications.json + generator (plantillas) | 1 día |
| 2 | dispatcher (rate limit, dedup, prefs) | 1 día |
| 3 | Integration IA (1 frase, timeout, fallback) | 1 día |
| 4 | PATCH /me + WS event | 1 día |
| 5 | Frontend handler + prefs UI + tray | 1.5 días |
| 6 | Tests + docs | 1 día |

**Total: ~6.5 días**

## Tests
- Unit: generator (plantilla correcta), dispatcher (rate limit, dedup)
- Integration: evento → WS (con/sin IA)
- Edge: 4 eventos/5min → 1 notif, IA timeout → fallback, category off

## Riesgos y notas
- **Coste IA:** 3×50 tokens/día × 1000 users = 150k tokens. Aceptable.
- **Tono:** Plantillas bien escritas (review UX).
- **Spam:** Si vitals críticas a las 3 AM → NO notificar (respetar sueño).
- **Offline:** Acumula en inbox.

## Preguntas abiertas
1. Push mobile? (Propuesta: v2. v1 solo desktop.)
2. Chatear desde notificación? (Propuesta: NO, solo abre app.)
3. Cuenta contra cuota IA? (Propuesta: NO, 50 tokens.)