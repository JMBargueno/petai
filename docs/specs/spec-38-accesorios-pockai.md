# Spec 38: accesorios de Pockai (esquema de datos y anclas)

Documento autocontenido. Define **qué es un accesorio en los datos**, **dónde se ancla en cada
especie** y **en qué orden se implementa**. Las reglas visuales están en
`docs/GUIA_ARTISTICA.md` §7.6 y no se repiten aquí.

Estado: **propuesta, sin implementar**. Las decisiones abiertas están en la sección 8.

## 1. Qué se pide

Un sistema de prendas (gorros, gafas, bufandas, capas, alas…) que el Pockai lleva puestas:

- Cuatro ranuras: `head`, `face`, `neck`, `back`. Una prenda por ranura.
- Tres vías de desbloqueo: **monedas**, **gemas** o **logro**.
- La prenda es del usuario; se equipa por mascota.
- Arte en pixel art, en tres tallas, colocado sobre cuatro anclas que define cada especie y etapa.

## 2. Qué existe hoy

| Pieza | Dónde | Estado |
|---|---|---|
| Catálogo de objetos | `Item` en `backend/prisma/schema.prisma` (`kind`, `effects`, `priceCoins`, `priceGems`) | Solo comida y medicina, sembradas desde `foods.json` en `backend/prisma/seed.ts` |
| Inventario | `InventoryItem` (usuario, objeto, cantidad) | En uso |
| Premio de logro | `reward.itemId` en `shared/game-data/achievements.json` (20 ids `ach_item_*`) | `InventoryService.grantExclusiveItem` crea al vuelo un `Item` de `kind: "cosmetic"` sin arte ni efecto |
| Premios de temporada | `skin_*` en `shared/game-data/seasons.json` | Ids sin catálogo detrás |
| Precio con moneda | Muebles en `shared/game-data/habitats.json` (`price` + `currency: "coins" \| "gems"`) | En uso; es el precedente a seguir |
| Accesorio de festival | `accessory` en `shared/game-data/festivals.json` | Un emoji sobre la mascota (`EnvironmentalOverlay.svelte`) |
| Rarezas | `normal`, `rare`, `super_rare`, `legendary`, `mythic` | Las mismas para prendas |
| Arte por especie y etapa | `shared/assets/species/<id>/<etapa>/{base.png, mask.png, anim.json}` | Frames de 128×128, hoy generados desde SVG |

No existe: catálogo de accesorios, campo de ranura, prendas equipadas en `Pet`, anclas, ni
render de una prenda sobre el sprite.

## 3. Catálogo: `shared/game-data/accessories.json`

Fuente de verdad, como `habitats.json` para los muebles. El seed crea un `Item` por entrada.

```json
{
  "slots": ["head", "face", "neck", "back"],
  "accessories": [
    {
      "id": "acc_gorro_lana_azul",
      "name": "Gorro de lana",
      "description": "Abriga las ideas.",
      "slot": "head",
      "rarity": "normal",
      "color": "blue",
      "unlock": { "type": "coins", "price": 250 }
    },
    {
      "id": "acc_capa_gala",
      "name": "Capa de gala",
      "description": "Para entrar en la arena con estilo.",
      "slot": "back",
      "rarity": "rare",
      "color": "violet",
      "unlock": { "type": "gems", "price": 12 }
    },
    {
      "id": "ach_item_care_blanket",
      "name": "Bufanda de siesta",
      "description": "Premio por una buena rutina de descanso.",
      "slot": "neck",
      "rarity": "super_rare",
      "color": "mint",
      "unlock": { "type": "achievement", "achievementId": "care_sleep_75" }
    }
  ]
}
```

| Campo | Regla |
|---|---|
| `id` | `^[a-z][a-z0-9_]*$`, único entre todos los `Item`. Prefijo `acc_`, salvo las prendas de logro, que conservan su `ach_item_*` para no tocar `achievements.json` |
| `name`, `description` | En español. Nombre de 1 a 3 palabras |
| `slot` | Uno de `slots` |
| `rarity` | `normal`, `rare`, `super_rare`, `legendary` o `mythic` |
| `color` | Rampa de la guía §7.6: `ember`, `sunburst`, `mint`, `blue`, `violet`, `lavender`, `white`, `carbon`. Es informativo (filtros de tienda y contraste con el elemento); el color real está en el PNG |
| `unlock.type` | `coins`, `gems` o `achievement` |
| `unlock.price` | Entero > 0. Obligatorio con `coins` y `gems` |
| `unlock.achievementId` | Id existente en `achievements.json`, cuyo `reward.itemId` es el `id` de la prenda. Obligatorio con `achievement` |
| `animated` (opcional) | `true` si la prenda trae aleteo propio de 2 frames (rareza `legendary` o superior) |
| `fx` (opcional) | Partícula propia: `heart`, `zzz`, `sparkle` o `drop` (rareza `mythic`) |

Una prenda no tiene `effects`: es cosmética (decisión 8.1).

**Mapeo a `Item`:** `kind: "accessory"`, `effects: { slot, rarity }`, y `priceCoins` o `priceGems`
según `unlock`. Las de logro van con ambos precios a 0 y no aparecen como comprables.

## 4. Propiedad y equipado

- **Propiedad:** `InventoryItem` con `qty = 1`. Comprar una prenda que ya se tiene es un error, no
  una segunda unidad.
- **Equipado:** campo nuevo en `Pet`:

```prisma
/// Prendas equipadas por ranura: { head, face, neck, back }, cada una un itemId o ausente.
accessories Json @default("{}")
```

- Una misma prenda puede estar equipada en varias mascotas del usuario a la vez (decisión 8.2).
- Equipar valida: la prenda es del usuario, su `slot` coincide con la ranura y la mascota es suya.
- Regalar o perder una prenda la desequipa de todas las mascotas del usuario.

**Contrato HTTP** (regenerar OpenAPI al añadirlo):

| Método y ruta | Qué hace |
|---|---|
| `GET /accessories` | Catálogo con el estado del usuario por prenda: `locked`, `available`, `owned` |
| `POST /accessories/:id/buy` | Compra con monedas o gemas; descuenta del monedero en la misma transacción |
| `PUT /pets/:petId/accessories` | Cuerpo `{ head?, face?, neck?, back? }` con `itemId` o `null`; devuelve las prendas equipadas |

La respuesta de mascota (`GET /pets/:id` y las vistas públicas) incluye `accessories`, para que
otros jugadores vean las prendas en combate, visitas y perfiles.

## 5. Anclas por especie y etapa

Archivo nuevo junto a cada `anim.json`:
`shared/assets/species/<id>/<etapa>/anchors.json`

```json
{
  "size": "L",
  "base": { "head": [32, 16], "face": [38, 28], "neck": [32, 39], "back": [18, 36] },
  "eyeGap": 7,
  "frames": {
    "idle": [[0, 0], [0, 0], [0, 1], [0, 1], [0, 0], [0, 0]],
    "sleep": { "head": [[2, 6], [2, 6], [2, 7], [2, 7]], "hidden": ["back"] }
  }
}
```

| Campo | Regla |
|---|---|
| `size` | Talla de prenda de la etapa: `S` (baby), `M` (juvenile), `L` (adult y final) |
| `base` | Las cuatro anclas en **píxeles nativos** del frame de 64×64 (la hoja se guarda a ×2, así que en `base.png` son el doble) |
| `eyeGap` | Píxeles entre el borde derecho del ojo cercano y el izquierdo del lejano. Las gafas eligen su puente con este valor |
| `frames.<anim>` | Desplazamiento `[dx, dy]` por frame, respecto a `base`. Una lista vale para las cuatro anclas; un objeto permite una lista por ancla |
| `frames.<anim>.hidden` | Ranuras que no se pintan en esa animación (por ejemplo, la capa cuando duerme enroscado) |

- Una animación sin entrada usa `[0, 0]` en todos sus frames.
- El número de desplazamientos de una animación coincide con sus frames en `anim.json`.
- En espejo (`scaleX(-1)`) el cliente refleja las anclas: `x' = 63 − x`.
- `head` es el centro del borde superior de la cabeza; `face`, el punto medio entre los ojos;
  `neck`, la unión de cabeza y torso (bajo la boca si hay un solo volumen); `back`, detrás del
  hombro, en el lado izquierdo de la pantalla.

## 6. Arte de la prenda

```
shared/assets/accessories/<id>/
  s.png  m.png  l.png     hojas a ×2; si la prenda es animada, 2 frames en horizontal
  meta.json
```

```json
{
  "slot": "head",
  "sizes": {
    "s": { "w": 16, "h": 16, "anchor": [8, 13] },
    "m": { "w": 24, "h": 24, "anchor": [12, 20] },
    "l": { "w": 32, "h": 32, "anchor": [16, 27] }
  },
  "frames": 1,
  "frameMs": 220
}
```

- `anchor` es el píxel nativo del lienzo que se coloca sobre el ancla de la especie.
- Lienzos: 16×16 (S), 24×24 (M), 32×32 (L). Las prendas de espalda admiten hasta 32×40 en L.
- PNG de 8 bits con transparencia binaria, como los sprites.

**Orden de pintado** (lo hace el cliente con tres capas): prenda `back` → sprite del Pockai →
prendas `neck`, `face` y `head`, en ese orden.

Limitación conocida: con el sprite en una sola capa, el gorro queda **por delante** del rasgo
icónico, no detrás como pide la guía. Se acepta en la primera versión; la solución es que el
generador exporte una capa `front.png` con las piezas que deben tapar a la prenda (decisión 8.4).

## 7. Validación

`scripts/validate-game-data.js`:
- `accessories.json` cumple la tabla de la sección 3; ids únicos y sin choque con `foods.json`.
- Cada `unlock.achievementId` existe y su `reward.itemId` apunta de vuelta a la prenda.
- Todo `reward.itemId` de `achievements.json` que sea una prenda tiene `unlock.type: "achievement"`.

`scripts/validate-assets.js`:
- Cada prenda tiene `s.png`, `m.png`, `l.png` y `meta.json`, con las medidas de `meta.json`.
- Cada carpeta de especie y etapa tiene `anchors.json`, con las cuatro anclas dentro del frame
  (2–61 en ambos ejes) y tantos desplazamientos por animación como frames tiene en `anim.json`.

## 8. Decisiones abiertas

| # | Pregunta | Propuesta |
|---|---|---|
| 8.1 | ¿Las prendas dan efectos de juego? | **No**, solo cosméticas. Evita pagar por ventaja y no toca el equilibrio |
| 8.2 | ¿Una prenda sirve para todas las mascotas del usuario? | **Sí**: se compra una vez y se equipa en las que se quiera |
| 8.3 | Precios | En `balance.json`, por rareza y vía; esta spec no fija números |
| 8.4 | Gorro detrás del rasgo icónico | Primera versión, por delante; después, capa `front.png` |
| 8.5 | Los 20 `ach_item_*` actuales | Se convierten en prendas poco a poco; los que no tengan arte siguen como `cosmetic` |
| 8.6 | Los `skin_*` de temporada | Fuera de esta spec: una *skin* cambia la paleta del sprite, no es una prenda |
| 8.7 | Accesorios de festival | Pasan a ser prendas temporales que se equipan solas en la ranura `head` mientras dura el festival, sin entrar en el inventario |

## 9. Dependencia: el arte en pixel art

Las prendas son pixel art y los Pockais se siguen generando en SVG. Una prenda en píxeles sobre
un sprite vectorial no casa. Por eso el render (lote 3) va **después** de migrar los sprites a
pixel art (`GUIA_ARTISTICA.md` §7.5). Los lotes 1 y 2 no dependen de esa migración.

## 10. Lotes

Un PR por lote, en orden. Cada lote deja los tests y las validaciones en verde.

**Lote 1: datos y validación**
- `shared/game-data/accessories.json` con 6 a 8 prendas de arranque que cubran las cuatro
  ranuras y las tres vías de desbloqueo.
- Reglas de la sección 7 en `validate-game-data.js`.
- Seed: un `Item` de `kind: "accessory"` por prenda, sin pisar precios ya editados desde el panel
  de admin (mismo criterio que la comida).
- Protección en `InventoryService.buyItem`, porque al sembrar las prendas ya existen en `Item` y
  la compra genérica (`POST /v1/shop/buy`) las alcanzaría: los objetos de logro (`cosmetic` y
  prendas con `unlock: "achievement"`) no se venden, y una prenda se compra una sola vez.

Hecho. Queda pendiente: `GET /v1/shop` sin filtro sigue listando las prendas junto a la comida,
también las de logro a precio 0 (no se pueden comprar, pero se ven). Lo resuelve el catálogo
propio del lote 2.

**Lote 2: backend**
- Migración: `Pet.accessories`.
- Rutas de la sección 4, con sus tests: comprar dos veces, equipar en ranura equivocada, equipar
  una prenda ajena, saldo insuficiente.
- `grantExclusiveItem` usa el `Item` del catálogo cuando el id es una prenda, en lugar de crear un
  `cosmetic` genérico.
- OpenAPI regenerado.

**Lote 3: anclas y render** (tras la migración a pixel art)
- `anchors.json` para las especies existentes, en las cuatro etapas.
- Reglas de arte de la sección 7 en `validate-assets.js`.
- Render por capas en `shared/scene` (PixiJS), en la mascota flotante de escritorio y en Android,
  con vecino más próximo y posiciones a píxel entero.
- Tienda y armario, con los estados y chips de la guía §7.6.

**Lote 4: skill `pockai-accessory-architect`**
- Diseña la prenda (ranura, rareza, color, vía de desbloqueo), la dibuja en tres tallas, la revisa
  con una hoja de contactos sobre cada especie y etapa, y la integra y valida.
- Va la última porque necesita el catálogo del lote 1 y, para la hoja de contactos, las anclas del
  lote 3. Puede adelantarse tras el lote 1 si se limita a ficha, datos y validación.

## 11. Fuera de alcance

- *Skins* que cambian la paleta o el patrón del sprite.
- Prendas con efectos de juego.
- Intercambio o regalo de prendas entre usuarios.
- Más de cuatro ranuras (mano, aura).
