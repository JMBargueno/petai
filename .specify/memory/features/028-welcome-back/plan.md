# Plan: "Welcome Back" — Re-engagement Cinemático

## Arquitectura

```
backend/src/modules/reengagement/
├── reengagement.module.ts
├── reengagement.controller.ts
├── reengagement.service.ts   (detección de ausencia, tramo, ritual, buff)
└── diary.service.ts          (generación del diario de ausencia)
```

Conecta con `AuthModule`, `PrismaModule`, `PetsModule` (vitals), `BondingModule`.

## Modelo de Datos (Prisma — extensión de `Pet`)

```prisma
model Pet {
  // ... campos existentes ...
  lastLoginAt         DateTime?
  absenceDiary        Json?
  recoveryBuffUntil   DateTime?
  welcomeBackTier     String?
  lastWelcomeBackAt   DateTime?
}
```

## Configuración (umbrales)

```json
{
  "thresholds": { "happy": 1440, "offended": 2880, "sad": 10080, "emotional": 43200 },
  "recoveryBuffHours": 24,
  "offended": { "requiredClicks": 5, "chatKeyword": "lo siento" },
  "sad": { "requiredActions": ["feed", "clean", "minigame"], "maxTimeMin": 5 },
  "emotional": { "giftRarity": ["rare", "super_rare", "legendary"], "giftCoins": 200 },
  "diary": { "maxEntries": 5, "categories": ["sleep", "food", "battles", "mood", "environment"] }
}
```
(Umbral en minutos; 24h=1440, 48h=2880, 7d=10080, 30d=43200.)

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | /v1/reengagement/status | JWT | Tramo + plan de la secuencia (por pet activo) |
| GET | /v1/reengagement/diary | JWT | Diario de ausencia (3-5 viñetas) |
| POST | /v1/reengagement/forgive | JWT | Completar ritual → recovery buff (24h) |

## Flujos

### Status
1. Tomar el pet activo del usuario.
2. `absenceMs = now - (lastLoginAt ?? createdAt)`.
3. Si `24h < absence < 30d` → `active=true`, calcular tramo:
   - `<48h` → `happy`
   - `<7d` → `offended`
   - `<30d` → `sad`
   - `≥30d` → `emotional`
4. Devolver plan (acciones requeridas por tramo) + buff activo (si `recoveryBuffUntil > now`).
5. Actualizar `lastLoginAt = now` (el jugador está presente).

### Diary
1. Generar viñetas según ausencia: 24h→3, 7d→5 (máx 5).
2. Categorías: sleep, food, battles, mood, environment.
3. Persistir en `Pet.absenceDiary` (analítica + evitar regeneración).

### Forgive
1. Validar tramo y las acciones requeridas (offended: 5 clicks; sad: feed+clean+minigame).
2. Aplicar `recoveryBuffUntil = now + 24h`.
3. Tier `emotional`: otorgar regalo (rarity ≥ rare) + 200 monedas.
4. Marcar `lastWelcomeBackAt = now`, `welcomeBackTier`, pet → `idle`.
5. Anti-spam: si `lastWelcomeBackAt` hace < 30min → no repetir.

## Decisiones de Diseño

- **Nunca punitivo**: tono "te extrañé", no "te castigo".
- **Snapshot del diario**: se persiste para analítica y para no regenerar en cada apertura.
- **Buff anti-decaimiento**: `recoveryBuffUntil` se consulta en el lazy tick para congelar decaimiento.
- **Regalo emocional**: item aleatorio de `Item` con rarity ≥ rare; edge case sin item → 500 coins.
- **Bonding**: el ritual incrementa el bonding de forma natural (no punitiva).
