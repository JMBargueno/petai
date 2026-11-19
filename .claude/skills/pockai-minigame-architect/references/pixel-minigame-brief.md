# Brief de arte de un minijuego

La norma es `docs/GUIA_ARTISTICA.md` §7 (pixel art de mundo) y, para las piezas pequeñas, las mismas reglas que un objeto (`pockai-item-architect/references/pixel-item-brief.md`). Un minijuego es **un trozo del mundo en movimiento**: piezas pequeñas que se cruzan deprisa sobre un fondo. Lo primero es que se lea.

## Qué arte lleva un juego

| Capa | Qué es | De dónde sale |
|---|---|---|
| Fondo de arena | El lugar del Éter donde ocurre. Uno por juego | Nano Banana → `backdrop.webp` |
| Piezas | Lo que se recoge, se esquiva, se pulsa o se gira | Nano Banana → `<pieza>.png` |
| Mascota | El Pockai del jugador | Ya existe: `ctx.pet` (`pockai-in-game.md`) |
| Comida | Frutos y Mímesis Terrenal | Ya existe: `shared/assets/items/` |
| Marcas | Carriles, líneas, franjas, casillas | CSS con los colores de la rampa. No se generan |

Todo va en `shared/assets/minigames/<id>/`. Antes de pedir una pieza, mira si ya existe en `items/` o si es una marca que se hace con CSS.

## La arena

- Tamaño lógico fijo, el de la lógica del juego (lo habitual: **340×260**). La vista la escala al ancho disponible.
- **Una sola densidad de píxel.** Mascota (64 px nativos), comida y piezas (32 px) se pintan a la misma escala: un píxel de la pieza mide lo mismo que uno de la mascota. Nada de una pieza a ×3 junto a una mascota a ×1.
- `image-rendering: pixelated` en todo lo que sea pixel art. Sin filtros, sin giros libres, sin escalados fraccionarios por CSS (`transform: scale(1.1)` no; un salto de 2 px sí).

## Fondo

- `backdrop.webp`, **680×520** (el doble de la arena), sin transparencia.
- Pintado, en el mismo estilo que los fondos de sala: formas grandes, pocos planos, sin personajes ni objetos del juego.
- **Callado.** El fondo no compite: poco contraste, valores medios u oscuros, y **nada del color de las piezas**. Si las piezas buenas son cálidas, el fondo es frío.
- La **zona de juego queda limpia**: el detalle va en los bordes y arriba; por donde caen o pasan las piezas, un plano liso.
- La franja donde pisa la mascota se lee como suelo (una orilla, una repisa, un sendero).
- Dice el lugar de un vistazo: una corriente del Éter, la orilla del Telar, una cámara del Deep Éter.
- Usa la rampa del Flujo del juego para la luz ambiente; el vacío del Éter es `#0d0a1a` / `#231a42` (`FLOW_PALETTES`).

## Piezas

- **32×32 px nativos** (archivo de 64×64) las normales. Las grandes (un yunque, un Códice, una carta), **48×48** (archivo de 96×96). El dibujo llena el lienzo y deja 1 px de margen.
- Fondo transparente, sin sombra de suelo.
- Contorno de 1 px en un oscuro teñido, nunca negro. Luz arriba a la izquierda. Como mucho 12 colores, sin degradados ni antialiasing. Sin texto.
- Vista en 3/4 desde arriba, como las criaturas y los objetos.
- **Sin cara**, salvo que sea un ser del mundo.
- Una pieza se mueve: **silueta de una sola lectura**, sin detalle de menos de 2 px.

### Bueno contra malo: se distingue sin color

El jugador decide en un cuarto de segundo, y puede ser daltónico. Lo que suma y lo que estorba se diferencian por **tres cosas a la vez**:

| | Lo que suma | Lo que estorba (ruido del Éter) |
|---|---|---|
| Silueta | Redonda, cerrada | Rota, dentada, con huecos |
| Color | La rampa de su Flujo, saturada | Gris violáceo desaturado con un solo acento chillón |
| Movimiento (en la vista) | Cae recto, estable | Tiembla 1 px o parpadea (se apaga con movimiento reducido) |

El ruido del Éter tiene su propia rampa, la misma en todos los juegos, para que se aprenda una vez:

| 900 contorno | 700 sombra | 500 base | 300 luz | acento |
|---|---|---|---|---|
| `#1a1426` | `#3d3654` | `#6b6485` | `#a8a2bd` | `#7cf5e6` (un píxel o dos de «fallo») |

### Rampas

Las de los Seis Flujos, de `pixel-item-brief.md` (`900`/`700`/`500`/`300`/`100`). Para brillos y efectos de la vista, `FLOW_PALETTES` de `shared/scene/src/effects/palettes.ts`. No uses magenta ni rosa chillón: el importador los toma por fondo.

## Estados

Una pieza que cambia (un sello encendido y apagado, una carta boca arriba y boca abajo) son **dos PNG**, no un filtro. Nómbralos `<pieza>.png` y `<pieza>_on.png`. La reacción a un acierto (un salto de 2 px, un destello de la rampa `glow`) se hace en CSS y dura menos de 200 ms.

## Plantilla del brief (`docs/minijuegos/<id>.md`)

```markdown
# <Nombre> (`<id>`)

- **Familia:** Juego del Santuario | Prueba de <Flujo>
- **Lugar:** <rincón del Éter>
- **Lore:** <una frase: «En X, tu Pockai hace Y porque Z»>
- **Verbo:** <lo que hace el jugador con la mano>

## Reglas
<Cómo se puntúa, qué estorba y qué pasa al fallar. La cuenta del techo.>

## Variante accesible
<Qué cambia.>

## El Pockai
<Dónde está, qué hace, qué clip usa al acertar y al fallar.>

## Fondo
<El lugar en una frase. Qué planos tiene, dónde queda limpio, rampa de la luz.>

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `<pieza>.png` | … | 32 | … | … |

## Reutilizado
<Comida de `items/`, efectos, marcas en CSS.>

## Notas
<Lo que no debe pasar.>
```

## Checklist visual

`pnpm generate:minigames --preview` escribe `sprite-previews/minigames-contact.png`: cada juego con su fondo, las piezas encima a tamaño de juego y a ×3, y un Pockai al lado. Después, **una captura de una partida real**.

- [ ] Se sabe qué lugar es sin leer el nombre.
- [ ] Ningún emoji, ningún icono de interfaz, ningún texto dentro de la arena.
- [ ] Cada pieza se reconoce a tamaño de juego, sobre su propio fondo.
- [ ] Lo que suma y lo que estorba se distinguen en negro y en escala de grises.
- [ ] El fondo no se come a las piezas: la zona de juego es lisa y de otro color.
- [ ] La mascota y las piezas tienen el mismo tamaño de píxel y la misma luz.
- [ ] La mascota es lo que más se ve después de las piezas, y hace algo.
- [ ] No queda magenta ni rosa del fondo, ni motas sueltas.
- [ ] 12 colores o menos por pieza (lo dice `pnpm generate:minigames`).
- [ ] Con movimiento reducido, sin sacudidas, se sigue jugando igual.
- [ ] Al lado de otro juego ya hecho, parecen del mismo mundo y de la misma mano.
