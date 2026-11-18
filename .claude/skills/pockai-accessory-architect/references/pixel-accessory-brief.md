# Brief de arte de una prenda (pixel art)

Resumen práctico de `docs/GUIA_ARTISTICA.md` §7.6. Si hay conflicto, manda la guía.

El arte todavía no se dibuja ni se integra (lote 3 de la spec 38). El brief deja la prenda lista para dibujar: quien la dibuje no debería tener que decidir nada.

## Reglas comunes
- Pixel art en la rejilla nativa del sprite (frame de 64×64). Sin antialiasing, sin transparencias parciales, sin degradados.
- **Tres tallas dibujadas, no escaladas:** S para baby (lienzo de 16×16), M para juvenile (24×24) y L para adult y final (32×32). Las prendas de espalda admiten hasta 32×40 en L.
- Cada lienzo marca su **punto de anclaje**: el píxel que se coloca sobre el ancla de la especie.
- Contorno exterior de 1 px en el tono `900` **de la prenda**. Sombra `700` abajo a la derecha, base `500`, luz `300` arriba a la izquierda. Sin brillo.
- Como mucho 6 colores, contorno incluido. Lo normal son 4: una rampa.
- Nada de menos de 2 px. Sin textos ni logotipos.
- La prenda puede superar la altura de la etapa en 6 px como mucho y no sale del frame.

## Rampas

| `color` | 900 contorno | 700 sombra | 500 base | 300 luz |
|---|---|---|---|---|
| `ember` | `#3d0e1a` | `#c1122d` | `#fb4903` | `#fb9059` |
| `sunburst` | `#331b00` | `#dfa004` | `#ffd731` | `#feee8c` |
| `mint` | `#012825` | `#02ab8c` | `#55db9c` | `#a0f6b1` |
| `blue` | `#1c1b44` | `#4a6dd4` | `#4da2ff` | `#7fc7fe` |
| `violet` | `#170c35` | `#490ca4` | `#5c4ade` | `#8a6be9` |
| `lavender` | `#211e36` | `#b1a3d8` | `#e9ccff` | `#f9e2fe` |
| `white` | `#4b4862` | `#d6d4e0` | `#ffffff` | `#ffffff` |
| `carbon` | `#0b0a14` | `#17162a` | `#3d3a63` | `#4b4862` |

Una prenda rara puede sumar una segunda rampa para el ribete, el pompón o el forro.

## Por ranura

| Ranura | Reglas propias |
|---|---|
| `head` | Se apoya en el ancla por su base. El rasgo icónico cercano de la especie se pinta por delante, así que deja la parte baja izquierda sin detalle importante. Ancho máximo: la mitad de la cabeza |
| `face` | Montura de 1 px alrededor de cada ojo, puente y una patilla hacia la izquierda. El ojo lejano es 1 px más estrecho: su aro también. Con los ojos cerrados la prenda se queda puesta |
| `neck` | Banda de 2 a 3 px de alto, por debajo de la boca, con un cabo que cuelga hacia la izquierda. No tapa la barriga entera |
| `back` | Se pinta detrás del cuerpo y delante de la cola. Sobresale al menos 4 px por la izquierda. Puede tener aleteo de 2 frames |

## Rareza en la forma

| Rareza | Qué la distingue |
|---|---|
| `normal` | Una rampa, forma simple |
| `rare` | Dos rampas |
| `super_rare` | Un detalle que rompe la silueta (visera, flecos, plumas) |
| `legendary` | Animación propia de 2 frames (`animated: true`) |
| `mythic` | Animación y una partícula (`fx`) |

## Plantilla del brief: `docs/accesorios/<id>.md`

````markdown
# <Nombre>

> <description exacta de accessories.json>

| Ranura | Rareza | Color | Desbloqueo |
|---|---|---|---|
| <slot> | <rarity> | <color> (+ <segunda rampa, si la hay>) | <250 monedas / 12 gemas / Logro «…»> |

## Idea
<Una frase: qué es y por qué existe. Si es de logro, qué tiene que ver con él.>

## Forma
- **Piezas:** <cúpula, ribete, pompón…> y qué tono lleva cada una.
- **Silueta:** <qué sobresale del cuerpo y por dónde>.
- **Punto de anclaje:** <qué parte de la prenda toca el ancla>.

## Por talla
| Talla | Lienzo | Qué se conserva y qué se simplifica |
|---|---|---|
| S (baby) | 16×16 | <…> |
| M (juvenile) | 24×24 | <…> |
| L (adult, final) | 32×32 | <…> |

## Convivencia
- **No tapa:** <ojos, boca, rasgo icónico: cómo lo evita>.
- **Con otras ranuras:** <si choca con alguna prenda típica y cómo se resuelve>.
- **Etapa final:** <qué pasa con la cresta, la segunda cola o las púas>.

## Animación *(solo legendary y mythic)*
<Los 2 frames y cuándo se reproducen; la partícula, si la hay.>

**Estado del arte:** pendiente (lote 3 de la spec 38)
````

## Checklist visual (para cuando haya arte)
- [ ] Se reconoce a ×1 sobre una baby y sobre una final.
- [ ] Contorno de 1 px en el tono de la prenda, sin huecos.
- [ ] Luz arriba a la izquierda.
- [ ] No tapa ojos, boca ni rasgo icónico en ninguna de las especies.
- [ ] Las tres tallas parecen la misma prenda y ninguna es otra escalada.
- [ ] En espejo no hay nada «al revés».
- [ ] Sobre un Pockai de su mismo color sigue separándose del cuerpo.
