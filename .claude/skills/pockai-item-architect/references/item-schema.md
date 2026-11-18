# Esquema de un objeto (`foods.json`)

`shared/game-data/foods.json` es una lista. Cada entrada es un consumible; el seed (`backend/prisma/seed.ts`) crea con ella un `Item`. El esquema que valida el servidor es `foodsSchema`, en `backend/src/modules/game-data/game-data.schemas.ts`.

```json
{
  "id": "spicy_berry",
  "name": "Baya Ígnea",
  "kind": "food",
  "description": "Una baya ardiente que calienta el espíritu. Favorita de las criaturas de fuego.",
  "priceCoins": 25,
  "priceGems": 0,
  "effects": { "hunger": 20, "happiness": 15, "energy": 5, "health": 5 }
}
```

| Campo | Qué es | Reglas |
|---|---|---|
| `id` | Clave del `Item` en la base de datos | snake_case, en inglés, único también frente a `accessories.json`. **No se cambia nunca.** |
| `name` | Nombre visible | Español, de 1 a 3 palabras |
| `kind` | Qué mecánica lo usa | `food`, `medicine` o `evolution` |
| `description` | Texto de tienda | Una frase; una segunda si dice de qué Flujo es favorita |
| `priceCoins`, `priceGems` | Precio de salida en la tienda | Enteros ≥ 0, **al menos uno mayor que 0**: la tienda lista todos los objetos y `buyItem` no filtra por precio, así que uno a 0 se regalaría. Con los dos mayores que 0 se cobran ambos |
| `effects` | Lo que cambia al usarlo | Ver abajo. En `evolution`, `{}` |

El esquema es `passthrough`: un campo de más no rompe nada, pero tampoco hace nada. No añadas `element`, `rarity` ni `tier`: el Flujo de un objeto sale de quién lo tiene como favorita y su rareza, de las tablas de cofre.

## Qué hace el backend con cada `kind`

| `kind` | Dónde | Qué pasa |
|---|---|---|
| `food` | `PetsService.feed` (`backend/src/modules/pets/pets.service.ts`) | Suma `hunger`, `happiness`, `energy` y `health` a la mascota. Si el objeto es la `favoriteFood` de su especie, **`hunger` y `happiness` se multiplican por 1,5** (`health` y `energy` no). No se puede dar mientras duerme. Cuenta como interacción de vínculo y emite `pet:fed` |
| `medicine` | `PetsService.heal` (mismo archivo) | Suma **solo `health`** (40 si falta o vale 0) y **siempre** quita la enfermedad. `curesSick` solo sirve para que el servidor acepte una medicina sin `health`. `hunger`, `happiness` y `energy` se ignoran |
| `evolution` | `balance.evolution.finalStageItemId` | Es el objeto que se consume para pasar a la Forma Final a partir de `finalStageMinLevel` (50). El backend solo conoce **un** id: un segundo objeto `evolution` no se usaría nunca |

Los efectos se suman tal cual y la estadística se recorta entre 0 y 100. En una comida, un valor negativo es una contrapartida real.

> **Ojo con el Elixir Reparador:** sus datos dicen `happiness: -10`, pero `heal` no lo aplica. Hoy una medicina no puede tener contrapartida. Si el diseño la necesita, hay que tocar `PetsService.heal`: díselo al usuario en vez de escribir un efecto que no pasa.

### Claves de `effects`
`hunger`, `happiness`, `energy`, `health` (enteros, pueden ser negativos) y `curesSick` (booleano). Cualquier otra se ignora. No existe efecto sobre higiene, experiencia, stats de combate ni duración: si el objeto las necesita, falta mecánica.

### Tipos que no existen
- `toy`: `care-package.service.ts` exige un objeto de este tipo, pero no hay ninguno ni mecánica de uso.
- Ingredientes de cocina: `recipes.json` nombra `carrot`, `crystal`, `star_dust`… que no son objetos.
- `accessory` y `cosmetic` son de las prendas: usa `pockai-accessory-architect`.

Si te piden uno de estos, no lo metas en `foods.json` «para ir avanzando»: explica qué falta y propón la mecánica como trabajo aparte.

## Dónde se referencia un `id`

| Sitio | Para qué | Validado por |
|---|---|---|
| `species.json` → `favoriteFood` | El ×1,5 al comer y lo que pide la mascota cuando habla | `validate-game-data.js` |
| `balance.json` → `chests.<tipo>.dropTable[]` | Botín de cofres: `{ itemId, tier, qtyMin, qtyMax }` | `check_items.mjs` |
| `balance.json` → `minigames.games.<id>.itemDrop` | Premio de un minijuego a partir de una puntuación | `validate-game-data.js` |
| `balance.json` → `personality.autonomy.itemFind.items` | Lo que la mascota encuentra explorando por su cuenta | `validate-game-data.js` |
| `balance.json` → `evolution.finalStageItemId` | El objeto de evolución | `validate-game-data.js` |
| Inventarios, regalos y paquetes de cuidado | Datos de usuario en la base de datos | — |

Por la última fila, un `id` publicado no se renombra ni se borra: quedarían inventarios apuntando a nada. Para retirar un objeto, quítalo de los cofres y de las demás tablas, pero déjalo en `foods.json`. Ocultarlo de la tienda necesita un cambio en `getShopItems` o en el cliente, no un precio a 0.

## Precio y seed
El seed hace `upsert`: nombre, descripción, tipo y efectos se actualizan en cada ejecución; **el precio solo se escribe al crear** el `Item`, para no pisar lo que se haya cambiado desde el panel de admin. Cambiar `priceCoins` de un objeto que ya existe en un entorno no tiene efecto allí.
