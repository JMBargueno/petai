# Plan: Modding API + Workshop

## Arquitectura

```
backend/src/modules/modding/
├── modding.module.ts
├── modding.controller.ts
├── modding.service.ts
└── sandbox.service.ts   (validación SVG + minigame sandbox config)
```

Conecta con `AuthModule` (JwtAuthGuard), `PrismaModule`, `RedisModule` (rate limit), y el
`GameDataModule` (validación de element/rarity contra el catálogo).

## Modelo de Datos (Prisma)

```prisma
model Mod {
  id          String    @id @default(uuid())
  creatorId   String
  type        String    // species | furniture | minigame
  name        String
  description String
  element     String?
  rarity      String?
  data        Json
  spriteUrl   String?
  minigameUrl String?
  status      String    @default("published") // published | hidden | deleted
  downloads   Int       @default(0)
  avgRating   Float     @default(0)
  ratingCount Int       @default(0)
  reportCount Int       @default(0)
  isFeatured  Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  ratings    ModRating[]
  reports    ModReport[]
  modDownloads ModDownload[]

  @@index([status, type])
  @@index([element, rarity])
  @@index([creatorId])
}

model ModRating {
  id      String   @id @default(uuid())
  modId   String
  mod     Mod      @relation(fields: [modId], references: [id], onDelete: Cascade)
  userId  String
  stars   Int
  rating  String?
  createdAt DateTime @default(now())

  @@unique([modId, userId])
  @@index([modId])
}

model ModReport {
  id        String   @id @default(uuid())
  modId     String
  mod       Mod      @relation(fields: [modId], references: [id], onDelete: Cascade)
  userId    String
  reason    String
  details   String?
  reviewed  Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([modId])
}

model ModDownload {
  id      String   @id @default(uuid())
  modId   String
  mod     Mod      @relation(fields: [modId], references: [id], references: [id], onDelete: Cascade)
  userId  String
  petId   String?
  createdAt DateTime @default(now())

  @@unique([modId, userId, petId])
}
```

> Nota: `ModDownload` tiene `petId` nullable; el `@@unique` tolera `null` en Postgres (los
> `NULL` no colisionan), lo que permite un "descarga" por usuario sin pet.

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /v1/modding/publish | JWT | Publicar un mod |
| GET | /v1/modding/:id | público | Detalle de un mod |
| GET | /v1/modding/workshop | público | Listar/filtrar mods |
| POST | /v1/modding/:id/rate | JWT | Rating 1-5 estrellas |
| POST | /v1/modding/:id/report | JWT | Reportar un mod |
| POST | /v1/modding/:id/download | JWT | Registrar descarga (+snapshot) |
| PATCH | /v1/modding/:id | JWT (creator) | Editar |
| DELETE | /v1/modding/:id | JWT (creator) | Borrar (soft) |

## Flujos

### Publish
1. Verificar rate limit (5/día) via Redis.
2. Validar tipo (`species|furniture|minigame`).
3. `SandboxService.validateSprite(svg)` → sin `<script>`, `on*`, `foreignObject`, URLs externas, ≤500KB.
4. `ModdingService.validateData(type, data)` → schema por tipo (stats max, element/rarity válidos).
5. Crear `Mod` (`status=published`).
6. Devolver el mod con preview.

### Workshop
1. Construir `where` desde query params (solo `published`).
2. Ordenar por `sort` (downloads | rating | newest).
3. Paginar (limit default 20, max 50).
4. Devolver `{ items, total, page, limit }`.

### Rate
1. Upsert `ModRating` por `[modId, userId]`.
2. Recalcular `avgRating`/`ratingCount` con un aggregate.
3. Devolver `{ average, count, showAverage }` (showAverage = count ≥ 3).

### Report
1. Crear `ModReport`.
2. Incrementar `reportCount`; si llega a 3 → `status=hidden`.

## Decisiones de Diseño

- **Solo datos**: el backend nunca ejecuta el minigame; `SandboxService` valida el bundle JS
  (tamano ≤500KB, sin `eval`, sin `import`) y genera la config de aislamiento del Web Worker
  (timeout 60s, memory 10MB, API limitada).
- **Snapshot inmutable**: al descargar un mod de especie, se guarda una copia del `data` en el `Pet`;
  si el creator edita, los pets ya hatch conservan el snapshot original.
- **Featured**: máximo 10 `isFeatured` simultáneos; el admin asigna manualmente.
- **avgRating agregado**: se recalcula al rating y se persiste en `Mod` para no JOIN en listado.
