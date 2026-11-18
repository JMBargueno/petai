# Estilo de los efectos

Norma base: `docs/GUIA_ARTISTICA.md` §7 (pixel art 64 px nativo ×2, escala entera). En los sprites, los fx van horneados en las hojas (`scripts/sprites/poses.ts`, tipos `sparkle`, `ring`, `glow`, `puff`…). Los efectos del escritorio se dibujan aparte, con estas reglas.

## Rejilla y escala
- Rejilla nativa de como mucho 64×80. Se pinta ×2 (`scale: 2`): un píxel nativo son 2×2 px de pantalla.
- La mascota mide 128 px de pantalla (64 nativos), con los pies a unos 4 px del borde inferior. Una puerta que la tiene que tragar mide entre 56 y 66 nativos de alto.
- El anclaje va en los pies del efecto. Así el efecto y la mascota comparten suelo, también sobre la barra de una ventana.

## Color
- Solo la rampa del Flujo y el vacío: `outline`, `deep`, `mid`, `light`, `glow`, `void0` y `void1`. Como mucho 12 colores por frame (lo comprueban el test y la hoja).
- **Contorno siempre** de 1 px en `outline`. Los escritorios pueden ser blancos, negros o fotos; el contorno es lo que lo hace legible.
- `glow` solo en puntos: puntas de hebra, núcleo, chispas. Si brilla todo, no brilla nada.
- Sin degradados ni alfa por píxel. Para transparencias, usa tramado (dither) de dos tonos o `opacity` del efecto entero.

## Movimiento
- Cadencia de 12 fps: `EffectLayer` cuantiza el tiempo y el progreso de fase.
- Lo que fluye siempre (trenza, remolino, titileo) usa `frame.time`, y lo que cambia por fase usa `frame.t`. Con `reduced` nada de eso se mueve.
- Easing: `easeOut` para lo que aparece y caída cuadrática para lo que se suelta. Nada lineal salvo los pasos de la mascota.
- Duración total sin `hold`: entre 1,5 y 2,5 s. La mascota no debe esperar más de 1,2 s a que el efecto esté listo.

## Composición con la mascota
- El efecto va detrás (`layer="behind"`) salvo que la tape a propósito.
- Colócalo donde se vea: dentro de la pantalla y fuera del panel de control abierto (`.panel-card`). Si no cabe hacia donde mira la mascota, ponlo al otro lado (ver `portalSpot` en PetView).
- Una animación CSS sobre `.pet-body` pisa su `transform` en línea, incluido el giro. Repite el giro con `scaleX(var(--dir))` en cada keyframe.
- Al volver de un sitio invisible, la mascota reaparece en el suelo, sin quedarse colgada del techo, de una pared o de una ventana.
- Para desaparecer dentro de algo, encoge hacia su centro (no hacia el suelo), sube el brillo y se funde, en 0,4-0,5 s. Para salir, la misma animación al revés.
- El nombre y el nivel (`.pet-badge`) se ocultan mientras cruza.
- Un bocadillo corto antes y otro después dicen qué ha pasado. Por ejemplo: «¡Me voy al Santuario de Marta!» y «¡Ya volví!».

## Checklist de la hoja de frames
Mira `sprite-previews/effects/<id>-contact.png`, con una fila por Flujo y fondos oscuro y claro alternos:
- [ ] Se lee la silueta en todas las celdas, también en `light` sobre fondo claro.
- [ ] Cada fase se distingue de la anterior: hay progresión, no saltos ni frames repetidos.
- [ ] El último frame de `vanish` está vacío o casi.
- [ ] No hay píxeles sueltos fuera de la intención (restos de partículas a mitad de la rejilla).
- [ ] La variante `--reduced` es el efecto completo y quieto.
- [ ] Tiene un detalle propio que lo distingue de un marco genérico (ver el nivel de ambición en la skill pockai-architect, `design-lessons.md`).
