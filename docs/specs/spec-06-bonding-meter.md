# Spec: Bonding Meter (Métrico de Vínculo)

## ID
Feature #6 — Oleada 1 "Objetivo a largo plazo"

## Resumen
Métrico de vínculo jugador-pet (0-100) que sube con interacciones variadas y baja si el jugador lo ignora >48h. Rangos: "Acostumbrado" → "Compañero" → "Aliado" → "Alma gemela" → "Leyenda".

## Contexto
Crea un objetivo a largo plazo y una "cost of abandonment" emocional. A diferencia de vitals (recuperable con 1 acción), el bonding requiere CONSISTENCIA y VARIEDAD. Conecta con todos los sistemas y desbloquea comportamientos de IA/animaciones por umbral.

## Objetivos
- Recurso de largo plazo que motive consistencia diaria.
- Recompensar variedad (no solo pelear).
- "Penalización" emocional por abandono >48h.
- Desbloquear IA/animaciones por umbral.

## User Stories
- Como jugador, quiero ver mi vínculo con mi pet en una barra 0-100.
- Como jugador, quiero que el saludo cambie al llegar a "Alma gemela".
- Como jugador, quiero saber que si no lo visito 48h, el vínculo baja.
- Como jugador, quiero que la IA recuerde cosas a bonding 60+.
- Como jugador, quiero un patrón exclusivo al llegar a 100.

## Criterios de aceptación
- [ ] AC1: `Pet.bonding` (0-100) sube: feed +2, battle +3, minigame +2, chat +1, clean +1, sleep +0.5, evolve +5.
- [ ] AC2: Dece 0.5/día si >48h sin interacción. No decae si <24h.
- [ ] AC3: Umbrales: 0-29 Acostumbrado, 30-59 Compañero, 60-79 Aliado, 80-99 Alma gemela, 100 Leyenda.
- [ ] AC4: 30+: saluda al iniciar sesión.
- [ ] AC5: 60+: IA recupera conversaciones previas (PetMemory).
- [ ] AC6: 80+: reacciones emocionales personalizadas.
- [ ] AC7: 100: patrón exclusivo + duerme cerca del cursor.
- [ ] AC8: `GET /pets/:id` incluye `bonding` y `bondingTier`.

## Diseño técnico
### Backend
- **Campos en `Pet`:** `bonding Float @default(0)`, `bondingTier String`, `lastInteractionAt DateTime`
- **BondingService:** `onInteraction(petId, type)`, `tick(petId)` (decay si >48h)
- **Tabla:** `balance.json → bonding.interactions`, `bonding.decayRatePerDay`, `bonding.tiers[]`
- **IA:** Prompt incluye `bondingTier`. En `soulmate` → inyectar PetMemory extra.

### Frontend
- **`BondingBar`:** Barra con color por tier + nombre.
- **Animaciones:** Por tier (saludo, memoria, reacciones, patrón).
- **Toast:** "¡Vínculo subido a Compañero!"

## Interfaz de API
- `GET /pets/:id` → incluye `bonding, bondingTier, lastInteractionAt`
- `GET /pets/:id/bonding` → `{ value, tier, history, decayInfo }`

## Modelo de datos
```prisma
model Pet {
  // ... existentes
  bonding           Float    @default(0)
  bondingTier       String   @default("acquainted")
  lastInteractionAt DateTime @default(now())
  bondingEvents     BondingEvent[]
}

model BondingEvent {
  id        String   @id @default(uuid())
  petId     String
  pet       Pet      @relation(fields: [petId], references: [id], onDelete: Cascade)
  delta     Float
  reason    String
  value     Float
  createdAt DateTime @default(now())
  @@index([petId, createdAt])
}
```

## Eventos y sincronización
- WS: `bonding:tier_up` → `{ petId, oldTier, newTier, bonding }`
- WS: `bonding:decay` → `{ petId, bonding }` (si decae > 1)
- Se calcula dentro del `lazyTick` existente.

## Dependencias
- Lazy tick, PetMemory, endpoints de interacción, IA prompt

## Plan de implementación
| Fase | Tarea | Estimación |
|------|-------|-----------|
| 1 | Campos Pet + migración + balance.json | 1 día |
| 2 | BondingService (increment, decay, tier) | 1.5 días |
| 3 | Integración lazy tick + endpoints | 1.5 días |
| 4 | Integration IA (prompt + memory) | 1 día |
| 5 | Frontend: BondingBar + anims | 1.5 días |
| 6 | Tests + docs | 1 día |

**Total: ~7.5 días**

## Tests
- Unit: increment, decay, tier boundaries
- Integration: feed → sube, 48h → decae
- Edge: cap 100, tier down, no negativo, multi-pet

## Riesgos y notas
- **Balance:** 100 ≈ 30-60 días de uso diario.
- **Tier down:** Pet "se decepciona" (frase IA). No punitivo.
- **Multi-pet:** Cada pet tiene bonding independiente.

## Preguntas abiertas
1. ¿Items aceleran bonding? (Propuesta: NO.)
2. ¿Bonding se mantiene tras evolve? (Propuesta: SÍ.)
3. ¿Se muestra en perfil público? (Propuesta: Solo tier, no valor.)