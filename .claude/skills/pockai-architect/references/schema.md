# Modelo de datos de un Pockai

## Entrada de `shared/game-data/species.json`
Validada por `speciesSchema` en `backend/src/modules/game-data/game-data.schemas.ts` y por `scripts/validate-game-data.js`. **No añadas campos fuera de esta tabla**: lo extra va en la ficha.

```json
{
  "id": "ignisaur",
  "name": "Ignisaurio",
  "description": "Un pequeño dinosaurio de fuego, robusto y cabezón, con una gorguera coronada de llamas y una maza de brasas en la cola. Cuando se alegra, desprende chispas brillantes.",
  "element": "fire",
  "rarity": "normal",
  "baseStats": { "hp": 50, "atk": 55, "def": 45, "vel": 48, "esp": 52 },
  "favoriteFood": "spicy_berry",
  "spriteKey": "ignisaur",
  "personalityBias": { "curiosity": 60, "sociability": 55, "bravery": 65, "affection": 45, "temper": 65 },
  "defaultPalette": { "primary": "#E25822", "secondary": "#F3C544", "accent": "#6D1600" }
}
```

| Campo | Regla |
|---|---|
| `id` | `^[a-z][a-z0-9_]*$`, único. Es también la carpeta `shared/assets/species/<id>/` |
| `name` | Español, único |
| `description` | Español, 1–2 frases. Entra en el prompt del chat de la mascota |
| `element` | `fire` `water` `plant` `electric` `shadow` `light` |
| `rarity` | Clave de `balance.json → rarity`: `normal` `rare` `super_rare` `legendary` `mythic` |
| `baseStats` | `hp` `atk` `def` `vel` `esp`, enteros ≥ 0; total según `balance.md` |
| `favoriteFood` | Id existente en `foods.json` (×1.5 hambre/felicidad al comerla) |
| `spriteKey` | = `id`. Requiere `shared/assets/sprites/<spriteKey>_{idle,eat,happy,sleep}.svg` |
| `personalityBias` | Punto de partida de las 5 dimensiones de personalidad (`curiosity` `sociability` `bravery` `affection` `temper`), enteros en [15, 85]. Ver `personality.md`. Opcional para el motor (sin él, todo 50) pero **obligatorio en especies nuevas** |
| `defaultPalette` | `primary` `secondary` `accent` en `#RRGGBB` |

Roles de paleta: `primary` = cuerpo (canal R de la máscara), `secondary` = vientre/zonas claras (canal G), `accent` = accesorios y contornos de 2 px.

## Paletas por elemento (`shared/assets/palettes.json`, default)
| Elemento | primary / secondary / accent |
|---|---|
| fire | `#E25822` / `#F3C544` / `#6D1600` |
| water | `#38A3A5` / `#80ED99` / `#22577A` |
| plant | `#57CC99` / `#C7F9CC` / `#22577A` |
| electric | `#FFD166` / `#FFEBB3` / `#FF9F1C` |
| shadow | `#4A4E69` / `#9A8C98` / `#22223B` |
| light | `#F4F1DE` / `#E07A5F` / `#F2CC8F` |

El shiny NO depende de la especie (lo pone la eclosión). No hay que definirlo.

## Catálogos relacionados
- **`foods.json`**: `{ id, name, kind: "food", description, priceCoins, priceGems, effects: {hunger, happiness, energy, health} }`. Las favoritas de elemento usan `priceCoins: 25` y `effects {20, 15, 5, 5}`; la descripción termina en "Favorita de las criaturas de <elemento>." Reutiliza una existente si encaja.
- **`skills.json`**: `{ id, name, element (elemento | "neutral"), kind (attack|heal|guard), power, accuracy 1–100, cooldown, unlockLevel, description, priority?, healPct?, turns?, inflicts?: {kind, chance, turns, value} }`. Neutrales: tackle(1), swift_strike(5), guard(8), power_slam(12), recover(15). Por elemento: 3 skills a nivel 1/10/25.
- **`genes.json → temperaments`**: `valiente` (aggressive), `timido` (defensive), `arribista` (aggressive), `curioso` (balanced), con `chatTone`. **Solo narrativo para la especie**: la eclosión no lo asigna por especie.
- **`patterns.json`**: los patrones dependen de la rareza del individuo, no de la especie.

## Combate (lo que importa para diseñar)
- Stats efectivos: `combatStats[k] · (1 + 0.05·nivel) + puntos asignados`; `combatStats = round(baseStats × multiplicador de rareza)` al eclosionar.
- HP de combate = `hp × 4`. Orden por prioridad y luego `vel`.
- Daño: skills **elementales usan ESP vs ESP**; **neutrales usan ATK vs DEF**.
- Una mascota solo usa skills neutrales o de su elemento, máx. 4 equipadas.
- Tabla de tipos (`combat/engine.ts`), ventaja ×1.5, desventaja ×0.67:
  - fire → plant · water → fire · plant → water, electric · electric → water · shadow ↔ light
- **Estados disponibles** (`StatusKind`): `burn` (6 % HP/ronda), `slow` (−value a VEL), `sap` (−value a DEF), `guard` (DEF ×1.5). **No inventes otros** (parálisis, sueño, confusión…): el motor no los gestiona.

## Lo que NO existe (no lo generes como datos)
Movimientos propios de especie, keywords o bandas de personalidad propias (son globales en `balance.json → personality`), temperamento fijo (se deriva de las dimensiones), evoluciones a otra especie (la evolución es solo `stage`: baby 1 → juvenile 10 → adult 25 → final 50 con `evolution_stone`; la misma especie y el mismo `SpeciesArt`, que varía sus proporciones y accesorios según `stage`: ver iso-style.md), resistencias/inmunidades, loot, tamaño/hábitat como campo. Todo eso puede vivir **solo en la ficha** como lore.
