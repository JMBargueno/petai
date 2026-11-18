# Concepto con Nano Banana

El generador es `scripts/sprites/concept/generate.mjs`. Llama a la API de Gemini con un modelo de imagen («Nano Banana») y guarda la primera imagen de la respuesta.

## Cuándo usarlo
- **Sí:** para fijar la forma y el ritmo de un efecto nuevo cuando hay varias ideas, o cuando el usuario quiere elegir entre opciones antes de que dibujes.
- **Sí, como arte final:** solo si el efecto es figurativo y no se puede dibujar con reglas (una criatura que asoma, un objeto detallado). En ese caso, importa la lámina a frames con `scripts/sprites/concept/import.mjs` (mismo flujo que en `pockai-architect/references/target-sheet-pipeline.md`) y pinta los frames con un `PixelSink` desde datos.
- **No:** para efectos geométricos (portales, anillos, partículas). El procedural se tiñe por Flujo, no pesa en el bundle y es determinista.

## Requisitos
- La clave va en `GEMINI_API_KEY`, en el entorno o en `.env.local` en la raíz (ignorado por git). **La pone el usuario.** No la escribas tú en ningún archivo ni comando. Si la pega en el chat, recomiéndale revocarla.
- **Cada imagen se cobra** y el prompt sale hacia Google. Confirma con el usuario antes de la primera llamada de la sesión y dile cuántas llevas.
- `node scripts/sprites/concept/generate.mjs --list` muestra los modelos disponibles. El de por defecto es `gemini-nano-banana-2.1`.

## Uso
1. Copia `references/effect-prompt.txt` a `sprite-previews/effects/<id>-prompt.txt` y rellena las marcas `{{…}}`.
2. Opcional: añade como referencia una captura de la mascota (`sprite-previews/<especie>-pixel-contact.png`) para fijar la escala.
3. Genera:
   ```bash
   node scripts/sprites/concept/generate.mjs sprite-previews/effects/<id>-concept.png \
     --prompt sprite-previews/effects/<id>-prompt.txt [--ref sprite-previews/<especie>-pixel-contact.png] --ratio 16:9
   ```
4. **Mira la imagen** (Read) y enséñasela al usuario. Si falla, el script deja `<salida>.respuesta.json` con la respuesta de la API.
5. Dibuja el efecto procedural tomando de la lámina la silueta, el orden de las fases y los detalles. No calques píxel a píxel: la rejilla y la paleta mandan.

`sprite-previews/` está ignorado por git: los conceptos no se suben. Si uno define el diseño, descríbelo con palabras en el comentario de cabecera del efecto.

## Arte final por roles (cofre, huevo, paquete, sello, altar, jefe de raid, manitas, capullo, portal, resonancia, hebra, trenza, descarga)
Para los efectos figurativos, la lámina de Nano Banana ES el arte, importado **por roles de color** para que el motor lo siga tiñendo (Flujo, metal, tier):
1. **Prompt:**
   - Pide una tira de frames sobre fondo magenta `#ff00ff`, todos al mismo tamaño y sobre la misma línea de suelo.
   - Pide **colores exactos**, uno por rol. Usa gris puro para lo que se recolorea (metal, caja) y tonos chillones como clave (`#00ffff`, `#ff0000`) para la luz o los adornos del Flujo.
   - Plantillas: `sprite-previews/effects/<id>-prompt.txt`, en local.
2. **Roles:** escribe `sprite-previews/effects/<id>-roles.json`, `{ "outline": "#101010", … }`, con los mismos colores del prompt. El rol `outline` limpia la silueta.
3. **Importa** a `shared/scene/src/effects/frames/<id>.json`:
   ```bash
   node scripts/sprites/effects/import.mjs <lámina> shared/scene/src/effects/frames/<id>.json \
     --palette <roles.json> --width <px nativos> [--same-scale i] [--order 0,1,2,4,5] [--crop x,y,w,h] [--preview <png>]
   ```
   - Las piezas se localizan por manchas: lo que comparte columna se funde, como una tapa que flota.
   - Sin `--same-scale`, cada pieza se escala por la anchura de su base. Úsalo cuando el tamaño cambia de verdad entre frames, como un pergamino que se desenrolla.
   - `--crop` sirve cuando la IA repite la tira en dos filas; `--order` quita frames repetidos.
4. **Pinta** con `paintSheetFrame(c, sheet, frame, { rol: color }, { x, bottom })` (`effects/sheet.ts`), en un `Canvas2` propio que se vuelca con `flush(sink, null)`: la lámina ya trae su contorno. Las partículas, haces y anillos siguen siendo procedurales, en otra capa con contorno.
5. **Tamaño:** NB dibuja a ~70 px nativos aunque pidas 24. Por debajo de ~22 px de ancho se emborrona. La rejilla máxima es 64×80, así que lo que vaya junto a la mascota cabe hasta ~26 px.

Coste real: 13 imágenes para 13 efectos (~0,82 $). Una lámina puede servir a dos efectos: impórtala dos veces con `--order` (el Códice de la resonancia y el ovillo de la hebra comparten imagen). Por debajo de ~12 px (una mano) el arte de NB se vuelve una mancha: dale a esas piezas su propia anchura con `--widths`.

`paintSheetFrame` también refleja (`flipX`), estrecha desde el centro (`scaleX`, un portal que se abre), recorta bajo el suelo (`clipBottom`) y acepta un color por rol y fila (runas que se encienden de abajo arriba).

**Mixto (capullo, portal):** cuando el efecto vive de animación procedural (la trenza que fluye, la trama que se teje, el remolino del vacío), NB dibuja solo la pieza física: el capullo o el arco con su clave. Las formas que antes eran geometría se sacan de la lámina: `inCocoon` lee la máscara del frame, y la boca del portal es el hueco interior del arco, fila a fila.
