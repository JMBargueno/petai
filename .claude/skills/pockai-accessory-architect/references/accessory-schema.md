# Esquema de `shared/game-data/accessories.json`

Resumen de `docs/specs/spec-38-accesorios-pockai.md` §3. Si hay conflicto, manda la spec.

```json
{
  "id": "acc_gorro_lana_azul",
  "name": "Gorro de lana",
  "description": "Un gorro con pompón que abriga las ideas.",
  "slot": "head",
  "rarity": "normal",
  "color": "blue",
  "unlock": { "type": "coins", "price": 250 }
}
```

| Campo | Regla |
|---|---|
| `id` | `^[a-z][a-z0-9_]*$`, hasta 64 caracteres, único entre prendas y sin chocar con `foods.json`. Prefijo `acc_` en las de compra; las de logro usan su `ach_item_*` |
| `name` | Español, de 1 a 3 palabras |
| `description` | Una frase |
| `slot` | `head`, `face`, `neck` o `back` |
| `rarity` | `normal`, `rare`, `super_rare`, `legendary` o `mythic` (las de `balance.json`) |
| `color` | `ember`, `sunburst`, `mint`, `blue`, `violet`, `lavender`, `white` o `carbon` |
| `unlock` | Ver abajo |
| `animated` | Opcional, booleano. Aleteo propio de 2 frames. Solo `legendary` y `mythic` |
| `fx` | Opcional: `heart`, `zzz`, `sparkle` o `drop`. Solo `mythic` |

## Desbloqueo

| `unlock.type` | Campos | Notas |
|---|---|---|
| `coins` | `price`: entero > 0 | `id` con prefijo `acc_` |
| `gems` | `price`: entero > 0 | `id` con prefijo `acc_` |
| `achievement` | `achievementId`: id de `achievements.json` | El `reward.itemId` de ese logro tiene que ser el `id` de la prenda. Sin `price` |

## Ranuras

| Ranura | Qué va | Ancla |
|---|---|---|
| `head` | Gorros, coronas, lazos, flores | Centro del borde superior de la cabeza |
| `face` | Gafas, antifaces, narices | Punto medio entre los ojos |
| `neck` | Bufandas, collares, pajaritas | Unión de cabeza y torso; bajo la boca si hay un solo volumen |
| `back` | Capas, alas, mochilas | Detrás del hombro, lado izquierdo de la pantalla |

Una prenda por ranura. Una mascota puede llevar las cuatro a la vez.

## Qué hace el backend con la entrada

- **Seed** (`backend/prisma/seed.ts`): crea un `Item` de `kind: "accessory"` con `effects: { slot, rarity, color, unlock }`. El precio se fija solo al crear; después manda el panel de admin.
- **Catálogo** (`GET /accessories`): devuelve cada prenda con su estado para el usuario: `locked` (de logro y sin conseguir), `available` u `owned`.
- **Compra** (`POST /accessories/:id/buy`): una unidad, una sola vez. Las de logro no se venden.
- **Equipado** (`PUT /pets/:petId/accessories`): guarda en `Pet.accessories` un `itemId` por ranura. La prenda es de la cuenta y se puede equipar en varias mascotas.
- **Logro**: al desbloquearlo, `grantExclusiveItem` entrega la prenda.
- Las prendas no se regalan ni se consumen.

No existen todavía: carpeta de arte (`shared/assets/accessories/`), anclas por especie y render. No añadas campos para ellos en `accessories.json`.
