# Spec: Logros y Constelación Visual

## ID
Feature #8 — Oleada 1 "Objetivo a largo plazo + status visible"

## Resumen
Sistema de logros con progresión visual en constelación. 5 categorías (Cuidado, Batalla, IA, Colección, Social), ~50-75 logros totales. Cada logro = estrella que se ilumina. Rewards: monedas/gemas/item. Visibilidad pública opt-in.

## Contexto
Da hitos de logro a largo plazo y un "status" visible. A diferencia de misiones (diarias) y bonding (gradual), logros son discretos y únicos. La constelación visual es la pieza diferenciadora: perfil muestra estrellas que se iluminan.

Conecta con: todos los sistemas (cuidado, battle, IA, colección, social), perfil público, Feature #1 (streak → logro).

## Objetivos
- Hitos a largo plazo que motiven exploración.
- Pieza visual compartible (constelación del perfil).
- Logros raros dan item exclusivo.
- Opt-in de visibilidad social.

## User Stories
- Como jugador, quiero ver mi constelación iluminándose progresivamente.
- Como jugador, quiero saber qué falta para completar la constelación de Batalla.
- Como jugador, quiero que un logro épico me dé una skin exclusiva.
- Como jugador, quiero compartir mi constelación como imagen.
- Como jugador, quiero mostrar mis logros en mi perfil público.

## Criterios de aceptación
- [ ] AC1: `GET /achievements` devuelve todos con estado (locked/in_progress/unlocked).
- [ ] AC2: 5 constelaciones (care, battle, ai, collection, social), 10-15 estrellas c/u.
- [ ] AC3: Progreso trackeado por eventos de dominio (mismo mecanismo que misiones).
- [ ] AC4: WS `achievement:unlocked` → animación + reward.
- [ ] AC5: Logros epic/legendary dan item exclusivo.
- [ ] AC6: `GET /users/:id/achievements?public=true` si opt-in.
- [ ] AC7: `GET /achievements/constellation/{cat}` → posiciones x,y + estado para SVG.

## Diseño técnico
### Backend
- **Módulo:** `src/achievements/` — controller, service, tracking, constellation
- **`achievements.json`:** definiciones `{ id, name, desc, target, event, tier, reward }`
- **Tracking:** eventos de dominio → Redis counter → flush PG
- **Layout:** JSON `{ x, y, name, id }` por estrella (coordenadas normalizadas 0-1)

### Frontend
- **`ConstellationView`:** SVG. Estrellas gray→yellow→bright. Líneas de conexión.
- **`AchievementList`:** filtrable por categoría.
- **`AchievementToast`:** animación + reward.
- **Export:** PNG de constelación para compartir.

## Interfaz de API
- `GET /achievements` → lista con estado
- `GET /achievements/constellation/{cat}` → `{ stars: [{ id, x, y, status, name }] }`
- `GET /users/:id/achievements?public=true` → perfil público
- `PATCH /me` → `{ achievementsPublic: true }`

## Modelo de datos
```prisma
model Achievement {
  id         String    @id
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  current    Int       @default(0)
  unlockedAt DateTime?
  claimed    Boolean   @default(false)
  createdAt  DateTime  @default(now())
  @@unique([userId, id])
}
```
- `User`: `achievements Achievement[]`, `achievementsPublic Boolean @default(false)`

## Eventos y sincronización
- WS: `achievement:unlocked` → `{ id, name, category, tier, reward }`
- Redis: `ach:progress:{userId}:{achId}` → flush 30s

## Dependencias
- Eventos de dominio (compartido con #1), items, perfil público, Feature #1 (streak)

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Modelos + JSONs | 1.5 días |
| 2 | Service + tracking | 1.5 días |
| 3 | Endpoints + WS | 1 día |
| 4 | Frontend SVG + list + toast | 2.5 días |
| 5 | Perfil público + export | 1 día |
| 6 | Tests | 1 día |

**Total: ~8.5 días**

## Tests
- Unit: tracking, unlock, tier rewards
- Integration: evento → progreso → unlock → WS
- Edge: multi-pet, race condition

## Riesgos y notas
- Items exclusivos cosméticos (no power).
- 75 logros × N users: index (userId, id) suficiente.
- Layout hard-coded en JSON.

## Preguntas abiertas
1. Logros por pet o usuario? (Propuesta: mixto.)
2. Retries? (Propuesta: NO, una vez.)
3. Seasonal? (Propuesta: v2 con #11.)