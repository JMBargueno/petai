# Estilo pixel art para Pockais

Es un resumen práctico de `docs/GUIA_ARTISTICA.md` §7.5 y §7.6. Si hay conflicto, manda la guía. La cámara, la luz y la cara en 3/4 siguen en `iso-style.md`.

**Estado:** los Pockais se generan en pixel art (`scripts/sprites/pixel/`) y llevan sus accesorios puestos (spec 38).

## Reglas de diseño
- **Evolucionar es cambiar.** Cada etapa tiene su propio plan corporal y su propia geometría.
- **Formas grandes.** Se dibuja en 64×64: un rasgo de menos de 2 px no existe.
- **Tres tonos por volumen**, sin degradados: luz arriba a la izquierda, base, sombra abajo a la derecha. Los pone el rasterizador.
- **Dos colores de paleta:** primario (cuerpo, y oscurecido para las marcas) y secundario (barriga y rasgo icónico).
- **Sitio para accesorios.** La especie debe poder llevar gorro, gafas, bufanda y capa en todas las etapas.

## Planes corporales: cada especie, un cuerpo distinto
Dos especies no pueden ser el mismo muñeco con otro adorno. Antes de pensar en el rasgo icónico, elige el **plan corporal** de la especie y comprueba que no lo usa ya otra del mismo elemento ni de la misma rareza. Si se repite, la especie nueva tiene que diferenciarse en proporciones y en cómo se apoya.

| Plan | Cómo es | Qué cambia en la geometría | Especies |
|---|---|---|---|
| Bípedo redondo | De pie, cabeza grande sobre torso, brazos cortos | La geometría común de `stage()` tal cual | Ignisaurio, Axolunar, Florabrote, Solarejo |
| Bípedo alado | Bípedo con alas que doblan su anchura | `lowered()` y alas en `behind` | Livolt |
| Tentacular | Cuerpo con manto y apoyos múltiples, sin brazos | `arm: undefined` y tentáculos en `behind` | Inktopus |
| Cuadrúpedo bajo | Bajo y largo: cuerpo tumbado, cabeza delante, cuatro patas cortas | `torso` horizontal, `head` a la derecha, patas traseras con `hindFar` (en `behind`) y `hindNear` (en `front`) | Magmadillo |
| Cuadrúpedo sentado | Grupa en el suelo, patas delanteras rectas y cabeza grande encima | `torso` vertical, `sitting()` en `front` (pata delantera y muslo), orejas con `floppyEar` | Cerbito |
| Cuadrúpedo esbelto | Patas largas y finas, cuello alto, hocico; el cuerpo queda lejos del suelo | `feet: undefined`, cuatro `longLeg` (dos en `behind`, dos en `front`), cuello como polígono de la pieza 4, `muzzle()` | Kirisol |
| Ave | Sin brazos: alas. Pico, patas finas y plumas | `arm: undefined`, `beak()`, `foldedWing()` y `plumes()` | Fénixel |
| Flotante | Sin patas ni apoyos: el cuerpo queda en el aire, a unos 6 px del suelo | `feet: undefined`, `head: undefined`, `arm: undefined`, aleta al costado en `front`, ancla `hat` | Nubeballena |
| Columna | Un solo volumen que crece en vertical, con ramas fundidas al tronco | `head: undefined` en las 4 etapas, ramas con la pieza del tronco | Cactuerno |
| Serpentino, árbol, insecto, etc. | Libres | Combina lo anterior | — |

Qué debe diferenciar a dos especies (cuantas más, mejor; **mínimo cuatro de siete**):

- **Apoyo:** dos pies, cuatro patas, flota, repta, raíces.
- **Proporción:** más alto que ancho, más ancho que alto, o cuadrado. Mira la fila de siluetas de las dos especies una junto a otra.
- **Cabeza:** fundida con el cuerpo, aparte y encima, o aparte y delante.
- **Extremidades:** brazos, aletas, alas, ramas o ninguna.
- **Rasgo icónico:** dónde sale (cabeza, lomo, cola, costados) y qué forma tiene.
- **Contorno:** liso, dentado, lobulado o con placas.
- **Cara:** la forma del ojo (`eye.style`), su tamaño y dónde cae en el cuerpo. Estilos: por defecto (alto y redondeado), `bead` (cuenta de 3 px: criaturas grandes de ojo diminuto, como la Nubeballena), `lid` (párpado caído y tranquilo, como el Magmadillo) `grumpy` (párpado caído con ceja inclinada, como el Cactuerno), `almond` (rasgado, de ave, como Fénixel), `shine` (doble brillo de cachorro, como el Cerbito) y `lash` (con pestaña, como Kirisol). Elige el que cuente su carácter y no repitas el de las especies de su misma rareza. Si ninguno encaja, añade un estilo en `scripts/sprites/pixel/face.ts`.

**La anatomía tiene que tener sentido.** Cada pieza responde a qué animal es: una ballena no tiene pies ni nada que cuelgue bajo el cuerpo y se lea como tal; un pulpo no tiene brazos; un cactus no tiene cola. Antes de dar por buena una hoja, pregúntate por cada pieza: «¿esto lo tendría el animal de verdad?». Lo que la geometría común trae y la criatura no tendría, se quita con `undefined`.

Con un plan que no es bípedo, la tabla de etapas se lee por su intención y no al pie de la letra: «un volumen» en baby significa la forma más simple de ese plan (el Magmadillo enroscado, la Nubeballena posada), y «dos volúmenes» en adult significa su forma completa. Las alturas son máximos: un cuadrúpedo puede quedarse muy por debajo y crecer a lo ancho.

**Prueba entre especies:** pon en negro el adulto de la especie nueva junto a los adultos de las demás. Si alguien puede confundirlo con otro, falta diferencia.

## Etapas
Las alturas van en px nativos; en la hoja de 128 son el doble.

| Eje | baby | juvenile | adult | final |
|---|---|---|---|---|
| Altura máxima | 28 px | 36 px | 46 px | 54 px |
| Plan corporal | Un volumen: una bola. Sin brazos ni cola, solo pies | Un volumen alargado, con brazos y cola | Dos volúmenes: cabeza y torso, con el cuello marcado | Dos volúmenes más anchos y piezas que rompen el contorno |
| Rasgo icónico | Un solo brote de 4–5 px | Doble y pequeño | Completo | Alargado, más un accesorio que lea el elemento (cresta, aura, corona) |
| Piezas nuevas | Ninguna | Brazos, cola con punta | Cuello, cola grande | Segunda cola, púas en el lomo (o alas, o melena) |
| Color y marcas | Sin barriga; mofletes de 2 px | Barriga | Manchas en cabeza y lomo | Franjas, emblema en el pecho, pies y manos en el acento |
| Cara | Ojos enormes, brillo de 2×2 | Ojos grandes | Ojos normales | Ceja de 1 px: mirada decidida |
| Color que no es el base | ~5 % | ~15 % | ~25 % | ~35 % |

**Regla de los cuatro ejes:** en cada salto de etapa cambian al menos cuatro de estos cinco ejes: plan corporal, rasgo icónico, piezas, color y marcas, cara. Además, a lo largo de la línea el plan corporal cambia como mínimo dos veces (bola, cuerpo con extremidades, cabeza y torso).

**Prueba de siluetas:** pon las cuatro etapas en negro a 64 px. Tienen que distinguirse sin color y sin mirar el tamaño.

Lo que no cambia nunca, para que siga siendo la misma especie:

- La rampa del elemento y los colores secundario y acento.
- La forma del ojo (rectángulo oscuro de esquinas recortadas con brillo arriba a la izquierda).
- El sitio del rasgo icónico: crece, se duplica o se adorna, pero sale del mismo punto.
- La vista en tres cuartos y la luz.

Las piezas nuevas de la etapa final tienen que verse en la silueta.

## Accesorios (§7.6)
- Cuatro ranuras: cabeza, cara, cuello y espalda. La especie define un ancla por ranura y etapa (`head`, `face`, `neck`, `back`), y van en la ficha.
- Al diseñar, comprueba que nada lo impide: el rasgo icónico no ocupa el centro de la cabeza (o el ancla `head` se ladea), hay sitio bajo la boca para una bufanda y la espalda queda libre por el lado izquierdo.
- Las piezas propias de la especie (cresta, segunda cola) no son accesorios: no se quitan ni se venden.

## Cómo sale el color
- La hoja no guarda colores: guarda tonos de gris (`base.png`) y papeles (`mask.png`), y el cliente los multiplica por la paleta de la mascota.
- El contorno es el color de la pieza muy oscurecido: un oscuro teñido, no negro.
- La luz suma una parte del secundario: por eso gira hacia el color cálido de la paleta.
- Ojos, boca y efectos son colores literales.
- En sala se muestra a 64 px (×1); en la mascota flotante, a 128 px (×2). Siempre sin suavizado.

## Errores típicos
- Una especie que es el bípedo redondo de siempre con otro adorno en la cabeza.
- Piezas heredadas de la geometría común que el animal no tendría: pies en una ballena, brazos en un pulpo. También apoyos o aletas colocados bajo el cuerpo, que se leen como pies.
- La misma cara en todas las especies: mismos ojos, mismo tamaño, misma altura.
- Etapas que solo cambian de tamaño o de proporción de cabeza.
- Un baby que ya tiene todas las piezas del adulto en pequeño.
- Una etapa final cuyo extra queda dentro del cuerpo y no altera la silueta.
- Cambiar de paleta o de forma de ojo al evolucionar: deja de parecer la misma especie.
- Un rasgo icónico que no deja sitio a un gorro o a unas gafas.
- Detalles finos (bigotes, dedos, texturas) que no sobrevivirán a 64 px.
