# Estilo pixel art para Pockais

Es un resumen práctico de `docs/GUIA_ARTISTICA.md` §7.5 y §7.6. Si hay conflicto, manda la guía. La cámara, la luz y la cara en 3/4 siguen en `iso-style.md`.

**Estado:** los Pockais ya se generan en pixel art (`scripts/sprites/pixel/`). El render de accesorios sobre la mascota sigue pendiente (spec 38, lote 3).

## Reglas de diseño
- **Evolucionar es cambiar.** Cada etapa tiene su propio plan corporal y su propia geometría.
- **Formas grandes.** Se dibuja en 64×64: un rasgo de menos de 2 px no existe.
- **Tres tonos por volumen**, sin degradados: luz arriba a la izquierda, base, sombra abajo a la derecha. Los pone el rasterizador.
- **Dos colores de paleta:** primario (cuerpo, y oscurecido para las marcas) y secundario (barriga y rasgo icónico).
- **Sitio para accesorios.** La especie debe poder llevar gorro, gafas, bufanda y capa en todas las etapas.

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
- Etapas que solo cambian de tamaño o de proporción de cabeza.
- Un baby que ya tiene todas las piezas del adulto en pequeño.
- Una etapa final cuyo extra queda dentro del cuerpo y no altera la silueta.
- Cambiar de paleta o de forma de ojo al evolucionar: deja de parecer la misma especie.
- Un rasgo icónico que no deja sitio a un gorro o a unas gafas.
- Detalles finos (bigotes, dedos, texturas) que no sobrevivirán a 64 px.
