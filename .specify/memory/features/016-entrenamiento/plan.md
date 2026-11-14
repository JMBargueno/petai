# Plan: Entrenamiento Elemental

## Arquitectura

```
backend/src/modules/training/
├── training.module.ts
├── training.controller.ts
├── training.service.ts
├── training.types.ts
```

## Modelo de Datos (Prisma)

```prisma
model TrainingSession {
  id                String    @id @default(uuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  petId             String
  pet               Pet       @relation(fields: [petId], references: [id], onDelete: Cascade)
  seed              Int
  floors            Json
  currentFloor      Int       @default(0)
  hearts            Int       @default(3)
  prediction        String?
  predictionCorrect Boolean   @default(false)
  status            String    @default("active") // active | completed | failed
  buffMultiplier    Float?
  buffExpiresAt     DateTime?
  startedAt         DateTime  @default(now())
  finishedAt        DateTime?
  xpAwarded         Int       @default(0)
  coinsAwarded      Int       @default(0)

  @@index([userId, status])
  @@index([petId, buffExpiresAt])
}
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /v1/training/start | Iniciar dungeon |
| POST | /v1/training/submit | Enviar elección de piso |
| GET | /v1/training/active-buff | Ver buff activo del pet |

## Flujos

### Start
1. Validar pet (activo, energía ≥ 10, no dormido)
2. Validar límites (20/día, cooldown 30s)
3. Generar seed aleatorio
4. Construir 5 pisos con `createRng(seed)` (elementos deterministas)
5. Crear TrainingSession
6. Devolver: seed, pisos (sin enemigos aún), hearts=3

### Submit
1. Validar sesión activa y floor actual
2. Validar que el elemento elegido es una habilidad del pet
3. Recalcular el enemigo del piso con seed+floor (autoritativo)
4. Comparar afinidad: ventajosa → avanzar; desventajosa/neutra incorrecta → -1 heart
5. Si hearts=0 → sesión fallida
6. Si floor=5 → sesión completada, aplicar buff
7. Procesar predicción (si el jugador adivinó el elemento siguiente)
8. Devolver resultado del piso

### Active-Buff
1. Buscar TrainingSession del pet con buffExpiresAt > now
2. Devolver multiplier y expiresAt

## Decisiones de Diseño

- **Seed por piso**: `seed + floor * 7919` (primo) para derivar enemigos deterministas.
- **Buff tipo multiplicador**: se aplica en el armado del `Fighter` antes de `runCombat`.
- **Techo combinado**: +20% max (cocina aditivo + entrenamiento multiplicador).
- **Predicción opcional**: el jugador puede o no adivinar; si acierta, +2%.
