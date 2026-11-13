# Spec: Modding API + Workshop de Pets

## ID
24 — Oleada 3 "Comunidad + Ecosistema" (NUEVAS_FUNCIONALIDADES §24)

## Resumen
Sistema de modding con API para publicar especies custom (JSON+SVG), muebles de hábitat, y minijuegos sandbox. Workshop in-app con ratings, downloads, y featured. Los mods operan en sandbox (no tocan la DB directamente).

## Contexto
El catálogo de especies (`Species` model + `species.json`) es estático y controlado por los devs. Para escalar contenido, se necesita UGC: que la comunidad cree y publique especies, muebles, y minijuegos. El sistema debe ser seguro (sandbox), verificable (validación de JSON/sprites), y social (workshop con ratings).

Conecta con: `Species` (Prisma), `GameDataModule`, `MinigamesModule`, `HabitatModule` (Feature #10), `AuthModule`.

## Objetivos
- API para publicar/validar/borrar mods (especies, muebles, minijuegos).
- Workshop in-app: explorar, descargar, rating, featured.
- Sandbox: los mods no ejecutan código en el backend, solo datos (JSON + SVG).
- Minijuegos custom: plugin en Web Worker (client-side only, no backend).
- Moderación: reporte + ocultar mods inapropiados.

## User Stories
- Como creator, quiero publicar una especie nueva (JSON + SVG + stats), para que otros la usen.
- Como jugador, quiero explorar el workshop, para descubrir pets/muebles creados por la comunidad.
- Como jugador, quiero rating un mod, para ayudar a otros a encontrar buenos mods.
- Como creator, quiero ver mis stats (downloads, ratings), para motivarme.
- Como admin, quiero ocultar/borrar mods inapropiados, para mantener la calidad.
- Como jugador, quiero que un minijuego custom sea seguro (sandbox), para no arriesgar mi sesión.

## Criterios de aceptación
- [ ] AC1: `POST /mods/species` — valida JSON schema (stats, element, rarity, food) + SVG (max 500KB).
- [ ] AC2: Especie publicada aparece en workshop con preview (sprite + stats).
- [ ] AC3: Un usuario puede "hatch" un huevo de especie modded (limitado a 10 mods activos por user).
- [ ] AC4: Workshop: list/search/filter por element, rarity, downloads, rating.
- [ ] AC5: Rating: 1-5 estrellas, promedio visible. Min 3 ratings para mostrar promedio.
- [ ] AC6: "Featured" badge: admin asigna manualmente. Máx 10 featured simultáneos.
- [ ] AC7: Muebles de hábitat: JSON + SVG + buff (mismo flow que especie).
- [ ] AC8: Minijuego custom: JS en Web Worker sandbox, max 500KB, API limitada (petai API).
- [ ] AC9: Reporte: 3 reports → mod se oculta (pending review). Admin puede restaurar.
- [ ] AC10: El creator puede editar/borrar su mod. Los usuarios que lo usan conservan el snapshot.

## Diseño técnico

### Arquitectura
```
┌─────────────────────────────────────────────────────────────────┐
│  ModdingModule (nuevo, backend)                                  │
│  ├── ModController (REST: CRUD + workshop)                      │
│  ├── ModService (validation, storage, lifecycle)                │
│  ├── SpriteValidator (SVG safety, size limit)                   │
│  ├── SchemaValidator (JSON schema per mod type)                 │
│  └── SandboxManager (minigame isolation config)                 │
└─────────────────────────────────────────────────────────────────┘
    │
    ├── Prisma: Mod, ModAsset, ModRating, ModReport
    │
    └── Storage (S3/R2): sprites SVG, minigame JS bundles
```

### Backend
Nuevo módulo `backend/src/modules/modding/`:
- `modding.module.ts`, `modding.service.ts`
- `modding.controller.ts` — CRUD + workshop endpoints
- `schema-validator.service.ts` — valida JSON por tipo de mod
- `sprite-validator.service.ts` — SVG sanitize (sin scripts, max size)
- `modding.dto.ts`

Validación de especie (JSON schema):
```json
{
  "name": "string (2-30 chars)",
  "description": "string (0-200 chars)",
  "element": "fire|water|grass|electric|dark|light",
  "rarity": "common|uncommon|rare|epic|mythic",
  "baseStats": { "hp": "number 50-200", "atk": "number 20-100", "def": "number 20-100", "spd": "number 20-100" },
  "favoriteFood": "string (1-30)",
  "spriteSvg": "base64 SVG (max 500KB)",
  "palette": { "primary": "hex", "secondary": "hex" }
}
```

### Frontend
**Workshop UI (nueva vista):**
- Grid de mods (sprite thumbnail, name, element icon, rating, downloads).
- Filtros: element, rarity, sort (new/top/rating/downloads).
- Detail view: stats, preview animado, description, rating, download button.
- "Hatch modded egg" button (si el mod es una especie).
- My Mods tab: listar mis mods, editar, borrar, stats.

**Mod editor (nueva vista):**
- Form para especie: name, element, stats sliders, food.
- SVG upload + preview (animado).
- "Test in sandbox" button (ver el pet con sus stats).
- Publish button.

**Minigame sandbox:**
- Web Worker: `new Worker('mod-minigame.js')`.
- API limitada: `petai.pet`, `petai.rng(seed)`, `petai.ui`, `petai.score`.
- Timeout: 60s max. Memory limit: 10MB.
- No access to: DOM, network, storage, parent context.

### Infraestructura
- S3/R2 storage para assets (SVG, JS bundles).
- CDN delivery de mod assets.
- No se necesita infraestructura extra (los mods son datos, no código server-side).
## Interfaz de API

**`POST /mods`** (JWT, creator) — type: species|furniture|minigame, data, sprite, minigameCode
**`GET /mods`** — workshop list: ?type=&element=&sort=&page=&limit=
**`GET /mods/:id`** — detalle.
**`PATCH /mods/:id`** — editar (creator).
**`POST /mods/:id/rate`** — { stars: 1-5 } → { average, count }
**`POST /mods/:id/report`** — { reason, details }
**`GET /mods/my`** — mis mods.
**`GET /mods/:id/stats`** — downloads, ratings timeline.

## Modelo de datos

**`Mod`**: id, creatorId, type (species|furniture|minigame), name, description, element?, rarity?, data Json, spriteUrl?, minigameUrl?, status (published|hidden|deleted), downloads, avgRating, ratingCount, reportCount, isFeatured, timestamps.

**`ModRating`**: id, modId, userId, stars, rating?, @@unique([modId, userId]).

**`ModReport`**: id, modId, userId, reason, details?, reviewed, createdAt.

**`ModDownload`**: id, modId, userId, petId?, @@unique([modId, userId, petId]).

## Protocolos y comunicación
- Sin WS específico. Mods son estáticos.
- Hatch modded species: crea `Pet` con snapshot del mod data (inmutable).
- Si creator edita, pets ya hatch usan snapshot original.
- Minigame: 100% client-side (Web Worker). Backend solo valida al publicar.

## Security
- SVG sanitize: eliminar `<script>`, `on*`, `foreignObject`, URLs externas.
- Minigame: Web Worker sandbox, postMessage API, timeout 60s, memory 10MB.
- Rate limit: 5 mods/día por user.
- Admin: feature/delete/restore. 3 reports → auto-hide.
- Storage: S3/CDN con URLs firmadas.

## Dependencias
- `Species` (Prisma), `GameDataModule`, `AuthModule`, S3/R2+CDN.
- `HabitatModule` (#10), `MinigamesModule` (existing).
## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Mod models + migration + CRUD endpoints | 2 días |
| 2 | SchemaValidator + SpriteValidator | 2 días |
| 3 | Workshop endpoints (list, search, filter, rate) | 2 días |
| 4 | S3/R2 storage + CDN | 1.5 días |
| 5 | Reporte + auto-hide + admin review | 1.5 días |
| 6 | Frontend: Workshop UI | 3 días |
| 7 | Frontend: Mod editor | 3 días |
| 8 | Minigame sandbox (Web Worker) | 2 días |
| 9 | Tests + docs | 2 días |

**Total: ~19.5 días**

## Performance y escalabilidad
- Workshop query: indexed, 10k mods → <50ms.
- SVG: CDN cached, 500KB max.
- Rating: aggregate en `Mod.avgRating`, sin JOIN.
- Minigame: client-side, sin impacto backend.
- Storage: 10k × 500KB = 5GB ≈ $0.50/mes.

## Tests
- Unit: SchemaValidator, SpriteValidator (SVG XSS patterns).
- Integration: Publish → workshop → rate → verify.
- E2E: Create species → hatch → pet stats correctos.
- Sandbox: timeout, memory limit, API restriction.
- Security: SVG con script, SQL injection, race condition rating.

## Riesgos y notas
- UGC requiere moderación activa.
- Stats extremos pueden romper balance → max en schema.
- SVG XSS crítico si no se sanitiza.
- Web Worker isolation no es 100% (timeout como guard).
- Snapshot: creator borra mod → pets conservan data.

## Preguntas abiertas
1. ¿Skills custom en mods? → No v1, v2 sí.
2. ¿Mods premium (IAP)? → No v1.
3. ¿Minigames con AI? → No (client-side only).
4. ¿Máx mods por user? → 10.
5. ¿Mods en Android? → Sí (misma API + CDN).