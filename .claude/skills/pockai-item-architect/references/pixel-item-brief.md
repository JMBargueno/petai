# Brief de arte de un objeto

La norma es `docs/GUIA_ARTISTICA.md` §7.7. Un objeto es **pixel art**, como las criaturas (§7.5): es un trozo del mundo, no un icono de interfaz. Los iconos de moneda, gema y botones siguen siendo vectoriales.

## Lienzo
- **32×32 px nativos**, exportado a ×2: `shared/assets/items/<id>.png` mide 64×64.
- El objeto ocupa de 24 a 28 px en su lado mayor y deja al menos 1 px libre en cada borde. Va centrado.
- Fondo transparente. Sin sombra de suelo: la pone el cliente si la necesita.
- Vista en 3/4 desde arriba, la misma cámara que las criaturas: se ve la cara de delante y un poco la de arriba. Nada de perfil plano ni de vista cenital.

## Dibujo
- Contorno exterior de **1 px** en el tono `900` de su rampa: un oscuro teñido, nunca negro puro.
- Luz desde **arriba a la izquierda**. Brillo `100` de 1 a 3 px en el volumen principal; sombra `700` abajo a la derecha.
- La sombra gira de tono (hacia el violeta por el camino corto) y gana saturación; no es el mismo color más oscuro.
- **Como mucho 12 colores** opacos. Sin degradados, sin transparencias parciales, sin antialiasing, sin tramado.
- Un rasgo de menos de 2 px no existe. Nada de texto, números ni etiquetas.
- **Sin cara.** Un objeto no tiene ojos ni boca: se confundiría con una criatura.
- Dos o tres piezas como mucho: el cuerpo, un remate (hoja, rabito, tapón, envoltorio) y, si la rareza lo pide, un detalle.

## Color
Un objeto de un Flujo usa la **rampa de ese Flujo** (§7.5) para su cuerpo, y un segundo color para el remate.

| Flujo | 900 contorno | 700 sombra | 500 base | 300 luz | 100 brillo |
|---|---|---|---|---|---|
| Fuego | `#3e0e18` | `#b41922` | `#e25822` | `#f9853c` | `#f4b68c` |
| Agua | `#002633` | `#117584` | `#38a3a5` | `#6bc2b9` | `#acd7ce` |
| Planta | `#002826` | `#1e9d85` | `#57cc99` | `#96e9ac` | `#d5fcd6` |
| Eléctrico | `#371800` | `#e09b38` | `#ffd166` | `#feeb9c` | `#fffbe3` |
| Sombra | `#161421` | `#2b2841` | `#4a4e69` | `#626c84` | `#7f8795` |
| Luz | `#26211a` | `#ccc2ad` | `#f4f1de` | `#fbf9ee` | `#ffffff` |

Un objeto neutro (Mímesis Terrenal) usa el color real de lo que imita, tomado de las **rampas de marca** de §7.6 (ember, sunburst, mint, electric blue, violet, lavender, blanco, carbón): una manzana es ember con hoja mint.

- El remate nunca va en la misma rampa que el cuerpo.
- Sombra y Luz se pierden sobre fondos de su mismo tono: en Sombra, el brillo y el remate van en lavender o violet; en Luz, la sombra `700` tiene que verse y el remate va en sunburst.
- No uses magenta ni rosa chillón: el importador los toma por fondo.

## La rareza se ve en la forma
No en añadir colores. El tier es el más común con el que sale de un cofre (`balance.md`).

| Tier | Qué se espera |
|---|---|
| `common` | Una pieza y un remate. Silueta de una sola curva |
| `uncommon` | Dos materiales que se distinguen: fruta y glaseado, semilla y cáscara |
| `rare` | Una pieza que rompe la silueta: hojas que asoman, un lazo, un tapón alto |
| `epic` | Un núcleo o brillo en color literal (una brasa, una perla, un líquido que luce) y facetas o capas con su luz y su sombra |
| `legendary` | Lo anterior, más una segunda lectura de color y destellos de 1 px alrededor, dentro del lienzo |

## Familias: que se distingan en negro
Pon los iconos en silueta. Dos objetos del catálogo no pueden confundirse.
- **Fruta:** redonda, con rabito u hoja arriba.
- **Dulce:** envoltorio con dos puntas, o piezas apiladas.
- **Plato:** más ancho que alto, con base.
- **Frasco (medicina):** cuerpo, cuello y tapón; el líquido deja ver el nivel.
- **Cristal (evolución):** facetas rectas y puntas; el único objeto anguloso del catálogo.

## Plantilla del brief (`docs/objetos/<id>.md`)

```markdown
# <Nombre> (`<id>`)

- **Tipo:** food | medicine | evolution
- **Origen:** <Flujo> | Mímesis Terrenal | Telar de Mulberry
- **Lore:** <una frase>
- **Tier:** <tier de cofre más común, o «solo tienda»>

## Silueta
<Familia y forma en una frase. Qué la distingue en negro de los objetos parecidos.>

## Piezas
1. <Cuerpo>: <forma, rampa>
2. <Remate>: <forma, rampa>
3. <Detalle de rareza, si lo hay>

## Color
- Cuerpo: <rampa>
- Remate: <rampa>
- Brillo literal: <hex, si lo hay>

## Notas
<Lo que no debe pasar: «que no parezca un tomate», «el tapón no tapa el nivel del líquido».>
```

## Checklist visual (hoja de contactos)
`pnpm generate:items --preview` escribe `sprite-previews/items-contact.png`: cada objeto a 32, 64 y 128 px sobre fondo claro y oscuro, y a la escala de la mascota junto a una cría.

- [ ] A 32 px se sabe qué es sin leer el nombre.
- [ ] Se lee igual de bien sobre claro que sobre oscuro: el contorno no se pierde ni hace halo.
- [ ] No queda ningún píxel magenta ni rosa del fondo, ni motas sueltas alrededor.
- [ ] El contorno es continuo y de 1 px: sin tramos dobles ni huecos.
- [ ] Luz arriba a la izquierda, como la cría de al lado.
- [ ] 12 colores o menos (lo dice `pnpm generate:items`).
- [ ] Junto a la cría, el objeto parece algo que podría llevarse a la boca: ni una miga ni más grande que ella.
- [ ] En negro no se confunde con ningún otro objeto del catálogo.
- [ ] La rareza se nota al lado de un `common`.
