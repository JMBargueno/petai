# Spec: "Mood Theater" — Micro-narrativas Diarias

## ID
Feature #31 — Oleada 2 "Micro-momentos de deleite"

## Resumen
El pet realiza "actos" espontáneos (baile, canto, llanto, humo, brillo) según su mood, bonding y contexto del día. El jugador puede "capturar" un momento como sticker y compartirlo en un feed social opt-in. Crea micro-narrativas diarias que hacen al pet sentir "actoral" y vivo.

## Contexto
Un pet que solo camina, come y duerme es un **tamagotchi**. Un pet que **baila** cuando le das su comida favorita, **canta** cuando está feliz, **fuma** cuando pierde una pelea, y **brilla** cuando sube de nivel es un **personaje**.

Los "micro-actos" son la diferencia entre un sprite con animaciones y una **presencia**. Son micro-momentos de 3-8 segundos que el jugador **no esperaba** y le generan una pequeña sonrisa. Es el equivalente a "tu gata hizo algo gracioso" en la vida real.

Además, la capacidad de **capturar y compartir** un momento crea contenido orgánico y comunidad: "Mira lo que hizo mi pet hoy" → viralidad.

Conecta con: Mood system (`personality.ts` → `moodOf()`), Bonding (#6), Arena (loss → "fuma"), Level up (→ "brilla"), Notificaciones (#7).

## Objetivos
- Hacer que el pet "actúe" espontáneamente según contexto (no solo estados vitals).
- Crear micro-momentos de deleite (3-8s) que no se pueden forzar.
- Habilitar "captura" de momentos como stickers compartibles.
- Feed social opt-in para ver actos de otros players.
- Aumentar el "time-to-smile" (tiempo hasta que el player sonríe).

## User Stories
- Como jugador, quiero que mi pet "baille" si le doy su comida favorita, para sentir que es especial.
- Como jugador, quiero que si mi pet pierde una pelea, "fume" (frustración) 5 segundos.
- Como jugador, quiero que al subir de nivel, mi pet "brille" (celebración).
- Como jugador, quiero que si está muy feliz, "cante" (animación de melodía).
- Como jugador, quiero poder "grabar" (capturar) un momento y guardarlo como sticker.
- Como jugador, quiero ver un feed con actos de otros pets (opt-in, sin datos personales).
- Como jugador, quiero que los actos sean **aleatorios** (no todos los días el mismo).
- Como jugador, quiero que mi pet tímido "cante" de forma suave, no "grite".

## Criterios de aceptación
- [ ] AC1: **Triggers de actos** (probabilidad diaria, máx 3 actos/día):
  - `dance`: Se activa al dar comida favorita (`isFavorite = true` en `feed()`). 100% si bonding ≥ 60.
  - `sing`: Si `happiness > 85` AND `hunger > 70` (muy feliz + bien alimentado). Prob 15% al consultar.
  - `cry`: Si `happiness < 15` AND `health < 30` (muy triste + enfermo). Prob 30%.
  - `smoke`: Tras perder battle (mood "frustrado"). 80% prob.
  - `glow`: Al subir de nivel (cualquier XP que cause level up). 100%.
  - `yawn`: Si `energy < 20` (agotado). Prob 25%.
  - `stretch`: Al despertar de sleep. 40%.
- [ ] AC2: **Duración de cada acto:** 3-8 segundos. No interrumpe el ciclo normal (walk/idle). Se intercala.
- [ ] AC3: **Cooldown global:** Máx 3 actos espontáneos/día (glow y dance no cuentan, son event-driven).
- [ ] AC4: **Animación:** Cada acto requiere un sprite/animación SVG específica:
  - `dance`: 4 frames de "saltar + girar"
  - `sing`: 3 frames + "musical notes" (partículas ♪)
  - `cry`: 3 frames + "lágrimas" (partículas 💧)
  - `smoke`: 2 frames + "humo" (partículas de vapor)
## Diseño de UX

### Flujos de usuario

#### Flujo: Acto espontáneo (dance con comida favorita)

```
[User da "Spicy Berry" a su Ignisaurio (comida favorita)]
  → feed() detecta isFavorite = true
  → bonding ≥ 60 → 100% trigger "dance"
  → WS: pet:moment → { act: "dance", duration: 5, trigger: "favorite_food" }

[PetView: transición idle → dance]
  Frame 1: Pet "parpadea" (0.3s)
  Frame 2-4: Pet salta + gira (4 frames, 1.2s)
  Frame 5: Pet "aterriza" con "boing" (0.5s)
  Partículas: ✨ chispas de fuego (element fire)
  Burbuja: "¡Ñam ñam ñam! 🎶"
  [5s total → back to idle]
```

#### Flujo: Acto contextual (smoke tras pérdida)

```
[Battle perdida → WS: battle:defended → won: false]
  → 80% prob de trigger "smoke"
  → Pet hace animación de "resoplido" (2s)
  → Partículas de humo 🌫️
  → Burbuja: "Ugh... esa fue de ellas."
  → 3s → idle
```

#### Flujo: Captura de momento

```
[Pet está en acto "sing" (3-8s)]
  → User hace long-press (500ms) sobre el pet
  → [Snapshot] → Pet congelado en frame + partículas + texto
  → Modal: "¡Momento capturado!"
    [Sticker preview: 256x256 PNG]
    "♪ [Nick] está cantando ♪"
    [Guardar] [Compartir al feed] [Descartar]
  → [Guardar] → se añade a Sticker Gallery
  → [Compartir] → se sube al feed social (opt-in)
```

#### Flujo: Feed social

```
[Tab "Feed" en ControlPanel (solo si socialFeedOptIn)]
  ┌────────────────────────────────────────┐
  │  🐾 Feed de Momentos                   │
  │                                        │
  │  [Sticker 128x128]                     │
  │  "Axolunar está bailando 🌊"           │
  │  por @Player23 · hace 2h               │
  │                                        │
  │  [Sticker 128x128]                     │
  │  "Florabud canta una melodía 🎵"       │
  │  por @Player45 · hace 5h               │
  │                                        │
  │  [Sticker 128x128]                     │
  │  "Ignisaurio brilla ✨ Nivel 12!"      │
  │  por @Player78 · hace 1d               │
  └────────────────────────────────────────┘
```

### Animaciones y feedback

| Acto | Frames | Partículas | Sonido |
|---|---|---|---|
| dance | 4 (salto+giro) | ✨ element-specific | "Bounce bounce" |
| sing | 3 (boca abierta) | ♪ (musical notes) | "La la la" (soft) |
| cry | 3 (ojos cerrados) | 💧 (lágrimas) | "Soft whimper" |
| smoke | 2 (resoplido) | 🌫️ (vapor) | "Pff... pff..." |
| glow | 1 (brillo) | ⭐ (estrellas) | "Shimmer" |
| yawn | 2 (boca grande) | — | "Yaaaaawn" |
| stretch | 3 (se estira) | — | "Mmnh" |

### Copywriting

**Burbujas por acto:**
- Dance: "¡Ñam! 🎶" / "Esto es lo bueno" / "¡A bailar!"
- Sing: "♪ ... ♪" / "Me sale solo" / "🎵"
- Cry: "No lloro... son las partículas" / "Hoy fue difícil" / "💧"
- Smoke: "Ugh... esa fue de ellas" / "Me la tomaré con calma" / "Pff"
- Glow: "¡Nivel [N]!" / "Siento poder" / "✨"
- Yawn: "Mmm... zzz" / "Me muero... de sueño" / "..."
- Stretch: "Mmm... qué buen sueño" / "Eso... mejor" / "Ah"

**Por personalidad:**
- Tímido: notas pequeñas, baile tímido (se esconde detrás de algo)
- Travieso: baile exagerado, "canta" desafinado
- Orgulloso: "brillo" más intenso, "canta" con más "presencia"
- Cariñoso: "canta" mirando al jugador, "baila" hacia él

## Diseño técnico

### Backend

**Nuevo módulo:** `backend/src/modules/moments/`
- `moments.controller.ts` — endpoints (capture, feed)
- `moments.service.ts` — trigger logic, cooldown, social feed
- `moments.module.ts` + `moments.spec.ts`

**Trigger logic (en `pets.service.ts` + `battles.service.ts`):**
- `feed()`: si `isFavorite && bonding ≥ 60` → emit `pet:moment` (dance)
- `addXpInternal()`: si level up → emit `pet:moment` (glow)
- `battles.service.ts`: si loss → 80% emit `pet:moment` (smoke)
- `applyLazyTick()`: si mood = sad/hungry → prob de (cry/yawn)
- Cron 5min: check cooldown, limpiar expired

**Cooldown:** Redis `moment:count:{petId}:{date}` (counter, TTL 1d). Máx 3/día (excluye glow y dance).

### Frontend

**Componentes:**
- `MomentAnimation.svelte` — Overlay de animación del acto (3-8s)
- `StickerCapture.svelte` — Modal de captura (long-press handler)
- `StickerGallery.svelte` — Tab en ControlPanel con stickers guardados
- `SocialFeed.svelte` — Feed de momentos (opt-in)
- `StickerCard.svelte` — Individual sticker en feed
## Interfaz de API

### `POST /pets/:id/moments/capture`
Request: `{ "act": "dance", "frame": 2 }`
Response 200: `{ "stickerId": "uuid", "imageUrl": "/stickers/{id}.png", "caption": "♪ [Nick] baila ♪" }`

### `GET /pets/:id/stickers`
Response: `[{ id, act, imageUrl, caption, createdAt }]`

### `DELETE /pets/:id/stickers/:stickerId`
Response 200: `{ "ok": true }`

### `POST /feed/moments`
Request: `{ "stickerId": "uuid" }`
Response 201: `{ "feedId": "uuid", "visible": true }`

### `GET /feed/moments?limit=20&offset=0`
Response: `[{ id, petName, species, act, stickerUrl, caption, username, createdAt }]`

### `PATCH /me`
Request: `{ "socialFeedOptIn": true }`
Response 200: `{ "ok": true }`

## Modelo de datos

```prisma
model PetMoment {
  id        String   @id @default(uuid())
  petId     String
  pet       Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  act       String   // dance | sing | cry | smoke | glow | yawn | stretch
  trigger   String
  mood      String
  duration  Int      @default(5)
  createdAt DateTime @default(now())
  @@index([petId, createdAt])
}

model PetSticker {
  id        String   @id @default(uuid())
  petId     String
  pet       Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  act       String
  frame     Int      @default(0)
  caption   String
  imageUrl  String
  shared    Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([petId])
}

model SocialMoment {
  id         String   @id @default(uuid())
  stickerId  String
  userId     String
  petId      String
  petName    String
  species    String
  act        String
  caption    String
  createdAt  DateTime @default(now())
  @@index([createdAt])
}
```

## Eventos y sincronización

| Event | Dir. | Payload | Trigger |
|---|---|---|---|
| `pet:moment` | S→C | `{ petId, act, duration, trigger, mood }` | Trigger contextual |
| `pet:moment-complete` | S→C | `{ petId, act }` | Acto terminado |

## IA y personalización

- Los actos NO usan IA (son animaciones pre-programadas).
- **Burbujas** son de `moments.json` por (personalidad × acto).
- **IA en chat:** Si el user pregunta "¿qué estabas haciendo?", el pet puede decir: "Acababa de hacer [acto]. Me pone muy [emoción]."
- **Personalidad modifica:** Tímido → notas pequeñas. Travieso → baile exagerado. Cariñoso → baila hacia el jugador.

## Dependencias
- Feature #6 (Bonding): Tier afecta probabilidad de dance.
- Feature #7 (Notifications): Acto "glow" puede notificar "¡[Nick] subió de nivel! ✨"
- `personality.ts` → `moodOf()`: Source de mood para triggers.
- `battles.service.ts`: Trigger "smoke" tras loss.
- `pets.service.ts`: Triggers en feed, level up, lazy tick.
- PetView.svelte: Animaciones de actos + partículas.
- Realtime gateway: WS events.

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | `moments.json` + Prisma + migración | 1 día |
| 2 | Trigger logic (feed, battle, level, lazy tick) | 1.5 días |
| 3 | WS events + cooldown (Redis) | 1 día |
| 4 | Animaciones SVG (7 actos × 4 especies) | 3 días |
| 5 | `MomentAnimation` + partículas + PetView integration | 2 días |
| 6 | Sticker capture + gallery | 1.5 días |
| 7 | Social feed (opt-in) | 2 días |
| 8 | Tests + polish | 1.5 días |

**Total: ~13.5 días**

## Métricas de éxito
- **Actos vistos/día:** 2-4 por user
- **Capture rate:** >20% de actos se capturan como sticker
- **Feed engagement:** >15% de users opt-in al feed social
- **Time-to-smile:** <5min desde abrir app hasta primer acto
- **Retention D7:** +10% vs baseline (micro-momentos)
- **Sharing rate:** >5% de stickers compartidos al feed

## Tests
- **Unit:** Trigger logic (favorite food → dance, loss → smoke), cooldown, daily cap
- **Integration:** Feed → favorite food → WS moment → stats correct
- **E2E:** Ver pet → esperar → acto aparece → long-press → capture → sticker
- **Edge:** 3 actos en 5min → 4º no aparece, cooldown reset diario

## Riesgos y notas
- **Over-animation:** Si hay 3+ actos/día, puede ser "demasiado". Cap de 3 es estricto.
- **Perf:** Partículas + animaciones → asegurar 60fps. Máx 20 partículas en pantalla.
- **Sticker gen:** PNG 256×256 con fondo transparente. Se genera server-side (canvas) o client-side.
- **Feed privacy:** Solo species + nickname + acto. NO se muestra username completo (opt-in).
- **Sick pet:** No hace "dance" ni "sing" si está enfermo. Solo "cry" o "stretch".
- **Sleeping:** No hace actos si está durmiendo (excepto "stretch" al despertar).

## Preguntas abiertas
1. ¿Stickers se generan server-side o client-side? → **Propuesta: client-side** (más rápido, no requiere CDN).
2. ¿Feed social tiene "like"? → **Propuesta: v2** (v1 solo ver).
3. ¿Se puede hacer "reel" de 3 actos? → **Propuesta: NO** (v1 solo stickers individuales).
4. ¿Actos cuentan para bonding? → **Propuesta: NO** (son pasivos, no interacciones).
5. ¿Se puede "repetir" un acto? → **Propuesta: NO** (cooldown global).

**Integración `PetView.svelte`:**
- Recibe `momentAct: string | null`
- Si hay acto → transición a animación del acto → partículas → back to idle
- Long-press handler (500ms) durante acto → dispara captura

### Datos de juego

**`shared/game-data/moments.json`:**
```json
{
  "dailyCap": 3,
  "cooldownMin": 10,
  "acts": {
    "dance": { "duration": 5, "trigger": "favorite_food", "bondingMin": 60, "counted": false },
    "sing": { "duration": 6, "trigger": "happy_well_fed", "prob": 0.15 },
    "cry": { "duration": 4, "trigger": "sad_sick", "prob": 0.30 },
    "smoke": { "duration": 4, "trigger": "battle_loss", "prob": 0.80, "counted": false },
    "glow": { "duration": 3, "trigger": "level_up", "counted": false },
    "yawn": { "duration": 4, "trigger": "low_energy", "prob": 0.25 },
    "stretch": { "duration": 3, "trigger": "wake_up", "prob": 0.40 }
  },
  "feed": { "maxPerUser": 50, "publicVisibility": "opt_in" }
}
```
  - `glow`: 1 frame + "partículas de luz" (estrellas ✨)
  - `yawn`: 2 frames
  - `stretch`: 3 frames
- [ ] AC5: **Capture:** El jugador puede hacer **long-press** (500ms) sobre el pet durante un acto → captura un "sticker" (PNG 256×256 con fondo transparente + texto del acto).
- [ ] AC6: **Sticker gallery:** `GET /pets/:id/stickers` → lista de stickers capturados. Máx 50.
- [ ] AC7: **Feed social (opt-in):** `GET /feed/moments?limit=20` → actos recientes de otros pets (species, name, acto, sticker). Solo si `User.socialFeedOptIn = true`.
- [ ] AC8: **WS event:** `pet:moment` → `{ petId, act, duration, trigger, mood }`. El client anima si el pet está visible.
- [ ] AC9: **Personalidad modifica el acto:** Tímido "canta" suave (notas pequeñas). Travieso "baila" de forma exagerada. Orgulloso "brilla" más intenso.
- [ ] AC10: **No se puede forzar:** No hay botón "hacer que bace". Solo triggers contextuales. El jugador NO puede spam de food para ver dance (cooldown de food existente).