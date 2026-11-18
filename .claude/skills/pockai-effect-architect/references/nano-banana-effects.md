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
