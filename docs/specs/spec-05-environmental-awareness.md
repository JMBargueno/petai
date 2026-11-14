# Spec: Environmental Awareness & Mood Weather

## ID
Feature #5 — Oleada 1 "El pet vive en mi mundo"

## Resumen
Sistema que hace que el pet reaccione al contexto del usuario: hora del día, clima real (API meteo), actividad del PC, y festividades. Genera "micro-momentos" que rompen la cuarta pared.

## Contexto
El pet es un ser digital que "vive" en el mundo del usuario. Actualmente no reacciona a nada externo. Con esta feature "siente" que llueve, que es madrugada, que llevas 2h sin mover el ratón. Conecta con `User.timezone`, vitals del `Pet`, animaciones, y el prompt de IA.

## Objetivos
- Reaccionar a la hora del día con estados visuales/diálogo.
- "Sentir" el clima real (lluvia, calor, nieve) según ubicación.
- Detectar inactividad del PC → pet juega solo.
- Celebrar festividades con accesorios temporales.

## User Stories
- Como jugador, quiero que mi pet tenga paraguas cuando llueva.
- Como jugador, quiero que bosteze si abro la app a las 3 AM.
- Como jugador, quiero que diga "¿Descansas?" si no lo visito en 2h.
- Como jugador, quiero que lleve un sombrerito en Navidad.
- Como jugador, quiero que el calor aumente su sed.

## Criterios de aceptación
- [ ] AC1: `GET /environmental/status` retorna `{ timeOfDay, weather, activity, festival }`.
- [ ] AC2: Clima de OpenWeatherMap/Open-Meteo, cache Redis 30min por coord.
- [ ] AC3: Si API falla → último cacheado o `unknown`.
- [ ] AC4: timeOfDay: night/morning/afternoon/evening/late_night por timezone.
- [ ] AC5: Heartbeat desktop cada 60s. > 2h sin heartbeat → modo "solo".
- [ ] AC6: Festividades en `festivals.json` por fecha + región → accesorio + frase.
- [ ] AC7: Clima modifica vitals: calor → +0.5/h hunger, lluvia → +0.5/h happiness, nieve → +0.5/h energy.
- [ ] AC8: Estado ambiental en prompt IA del pet.

## Diseño técnico
### Backend
- **Módulo:** `src/environmental/` — controller, service, weather.service (fetch+cache), activity-tracker, festival.service
- **Redis:** `weather:{lat}:{lon}` (TTL 30m), `activity:{userId}` (TTL 3h)
- **Vitals:** lazy tick consulta status → aplica modificadores de `balance.json → environmental`
- **IA:** Prompt incluye `context: { timeOfDay, weather, festival }`

### Frontend
- **`EnvironmentalOverlay`:** Accesorios sobre pet (paraguas, gorro, etc.)
- **Heartbeat:** POST cada 60s con `{ active, cpuUsage? }`
- **Animaciones:** Variants por timeOfDay + weather

### Datos de juego
- **`festivals.json`:** `[{ id, date, accessory, message }]`
- **`balance.json → environmental`:** `{ hot_temp: 30, cold_temp: 5, hunger_hot: 0.5, happiness_rain: 0.5, energy_snow: 0.5 }`

## Interfaz de API
- `GET /environmental/status` → `{ timeOfDay, weather, activity, festival }`
- `POST /environmental/activity` → body `{ active, cpuUsage? }` → `{ ok }`
- `GET /environmental/festivals/upcoming` → `[{ id, name, date, daysRemaining }]`

## Modelo de datos
- `User`: añadir `latitude Float?`, `longitude Float?`, `birthday String?` (MM-DD)
- Sin modelos nuevos. Estado ambiental es efímero (Redis).

## Eventos y sincronización
- WS: `environmental:changed` → `{ type, data }` al cambiar condición
- BullMQ: `environmental:heartbeat-cleanup` (cada 4h)

## Dependencias
- API de meteo (Open-Meteo o OpenWeatherMap)
- Redis, lazy tick, IA prompt, geolocation desktop

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Weather service + cache + festivals | 1.5 días |
| 2 | Activity tracker + endpoint | 1 día |
| 3 | Integración lazy tick | 1 día |
| 4 | Integration prompt IA | 0.5 día |
| 5 | Frontend overlay + heartbeat + anims | 2 días |
| 6 | Tests + docs | 1 día |

**Total: ~7 días**

## Tests
- Unit: weather cache, festival lookup, activity threshold
- Integration: status con mock, heartbeat → inactivity
- Edge: API down, sin coords, DST

## Riesgos y notas
- **Privacy:** Geo opt-in, solo ciudad al servidor.
- **Coste:** Cache 30min por ciudad → ~200 users OK.
- **Fallback:** Sin API → solo timeOfDay + festividades.

## Preguntas abiertas
1. ¿Open-Meteo (gratis) o OpenWeatherMap? (Propuesta: Open-Meteo.)
2. ¿Modificadores de vitals moderados? (Propuesta: ±0.5/h máx.)
3. ¿Ver clima de otra ciudad? (Propuesta: NO en v1.)