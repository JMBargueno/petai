# Plan: Genes y Temperamento

## Arquitectura

```
backend/src/modules/genes/
├── genes.module.ts
├── genes.controller.ts
├── genes.service.ts
├── gene-reveal.service.ts
├── gene-roll.ts          (lógica pura: rollGenes, rollTemperament)
├── gene-effects.ts       (applyGenesToFighter, temperamentToStrategy)
```

`shared/game-data/genes.json` - Data de genes (tipos, efectos, probabilidades)

## Modelo de Datos

Se usa el campo `personality` (Json) del `Pet` para almacenar:
```json
{
  "genes": [
    { "type": "veloz", "revealed": true, "revealedAt": "2025-01-14T12:00:00Z" },
    { "type": "sagaz", "revealed": false },
    { "type": "ferreo", "revealed": false }
  ],
  "temperament": "valiente"
}
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /v1/pets/:id/genes | Ver genes del pet |
| POST | /v1/pets/:id/analyze | Analizar gen (consumir item/gemas) |

## Lógica de Genes

### rollGenes(seed)
- Para cada uno de los 6 tipos de gen: si `rng() < 0.15` → incluye ese gen
- Máximo 3 genes (se detiene al llegar a 3)
- Determinista: misma seed → mismos genes

### rollTemperament(seed)
- `rng()` → [0, 0.25) = valiente, [0.25, 0.5) = timido, [0.5, 0.75) = arribista, [0.75, 1) = curioso

### Gene Effects (aplicados al Fighter)

| Gen | Efecto |
|-----|--------|
| veloz | stats.vel × 1.10 |
| ferreo | stats.def × 1.10 |
| sagaz | critChance + 0.03 (se pasa en config) |
| devorador | comida favorita × 1.15 (fuera de combate) |
| aurora | shinyProbability + 0.01 (fuera de combate) |
| crono | cooldowns × 0.90 (mínimo 0) |

### Temperament → Strategy

| Temperamento | Strategy | Chat Tono |
|-------------|----------|-----------|
| valiente | aggressive | Corajudo, desafiante |
| timido | defensive | Cauteloso, tímido |
| arribista | aggressive | Competidor, ansioso |
| curioso | balanced | Explorador, alegre |

## Integración con Combate

En `battles.service.ts` (o `battle-sim.ts`), al armar el `Fighter`:
```ts
import { applyGenesToFighter, temperamentToStrategy } from '../genes/gene-effects';

const fighter: Fighter = { ... };
applyGenesToFighter(fighter, petGenes);
fighter.strategy = temperamentToStrategy(temperament, fighter.strategy);
```

## Decisiones de Diseño

- **Almacenamiento**: En `Pet.personality` (Json) para no añadir tabla nueva y mantener compatibilidad.
- **Revelación**: Por análisis (3 gemas) o automático al nivel 10/25/50.
- **Determinismo**: Los genes se aplican ANTES de runCombat, modificando el Fighter. El motor no se toca.
- **Aurora**: Afecta solo la probabilidad de shiny en futuras eclosiones, no combate.
