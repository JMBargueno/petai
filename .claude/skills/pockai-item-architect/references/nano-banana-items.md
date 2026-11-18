# El arte con Nano Banana

El arte de un objeto lo dibuja una IA de imagen (Nano Banana, por la API de Gemini) y el repo lo importa a la rejilla nativa. Es el mismo flujo que el arte final de las criaturas y de los efectos figurativos; dibujar con formas por código se queda un escalón por debajo y no se usa aquí.

## Requisitos
- La clave va en `GEMINI_API_KEY`, en el entorno o en `.env.local` en la raíz (ignorado por git). **La pone el usuario.** No la escribas tú en ningún archivo ni comando. Si la pega en el chat, recomiéndale revocarla.
- **Cada imagen se cobra** (unos céntimos) y el prompt sale hacia Google. Confirma con el usuario antes de la primera llamada de la sesión y dile cuántas llevas cada vez.
- Dependencias instaladas (`pnpm install`): el importador usa `sharp`.
- `node scripts/sprites/concept/generate.mjs --list` enseña los modelos disponibles con esa clave.

## Pasos

1. **Prompt.** Copia `references/item-prompt.txt` a `sprite-previews/items/<id>-prompt.txt` y rellena las marcas `{{…}}` con el brief. `sprite-previews/` está ignorado por git.
2. **Genera:**
   ```bash
   node scripts/sprites/concept/generate.mjs sprite-previews/items/<id>-sheet.png \
     --prompt sprite-previews/items/<id>-prompt.txt --ratio 1:1
   ```
   Con `--ref <png>` puedes pasar un objeto ya aprobado (`sprite-previews/items/<otro>-import.png`) para que copie el estilo. Si falla, el script deja `<salida>.respuesta.json` con la respuesta de la API.
3. **Mira la lámina** (Read). Antes de importar: ¿es el objeto del brief?, ¿fondo magenta liso?, ¿píxeles cuadrados y gordos, sin suavizar?, ¿sin texto ni sombra en el suelo? Si no, corrige el prompt y repite; importar una mala lámina no la arregla.
4. **Importa:**
   ```bash
   node scripts/sprites/items/import.mjs sprite-previews/items/<id>-sheet.png --ids <id> \
     --preview sprite-previews/items/<id>-import.png
   ```
   Escribe `shared/assets/items/<id>.png` y una vista ×8 sobre claro y oscuro. Opciones:
   - `--ids a,b,c`: una lámina con varios objetos en fila, de izquierda a derecha.
   - `--pick 0,2`: de las piezas encontradas, cuáles se usan (cuando la IA dibuja de más).
   - `--colors 12`: máximo de colores (por defecto 12).
   - `--fit 28`: lado mayor del objeto en px nativos (por defecto 28). Si la lámina trae su propia rejilla, acércate a ella: reducir un dibujo de 27 celdas a 22 lo emborrona.
   - `--no-outline`: no fuerza el contorno. Úsalo si el contorno sale doble.
   - `--crop x,y,w,h`: solo una zona de la lámina.
5. **Hoja de contactos:** `pnpm generate:items --preview`, y **mira** `sprite-previews/items-contact.png` con la checklist de `pixel-item-brief.md`.
6. **Manifiesto:** `pnpm generate:items` comprueba tamaño, colores y transparencias y actualiza `shared/assets/items/manifest.json`.

## Cómo itera
- **Primero el prompt, luego el importador.** Si la forma no es la del brief, cambia el prompt. Si la forma es buena y el resultado a 32 px no, prueba `--fit`, `--colors` o `--no-outline`.
- **Un objeto hasta que guste, y después los demás.** Enséñaselo al usuario antes de seguir: prefiere afinar sobre un ejemplo.
- Cuando el estilo esté fijado, pide **varios objetos en una lámina** (tres o cuatro en fila, `--ratio 16:9`) y pasa el aprobado como `--ref`. Sale más barato y quedan de la misma mano.
- No retoques el PNG a mano ni con código: lo siguiente que se regenere lo pisaría. Si hace falta un arreglo fino, que quede en el prompt o en las opciones del importador, y anótalo en el brief.

## Lo que ya se sabe de Nano Banana a este tamaño
Heredado de los efectos (`pockai-effect-architect/references/nano-banana-effects.md`):
- En efectos dibuja a unos 70 px nativos aunque le pidas menos. En objetos, con este prompt, la Baya Ígnea salió en una rejilla limpia de unos 27 px de alto: por eso el lienzo es de 32 y no de 24, donde la hoja perdía las puntas. Pide **formas grandes y pocas piezas**; el detalle fino se pierde al reducir y deja ruido.
- Por debajo de unos 22 px de ancho el dibujo se emborrona: por eso el objeto llena el lienzo.
- Pide **colores exactos por hex**, pocos, y fondo magenta `#ff00ff` liso. A veces mancha el borde con rosa: el importador lo trata como fondo, así que el objeto no puede llevar rosa ni magenta.
- A veces repite el objeto, añade destellos sueltos o una sombra en el suelo. Las motas se descartan solas; lo demás, con `--pick` o `--crop`.
- No sabe contar píxeles: «contorno de 1 px» se cumple al importar, no en la lámina.

## Coste
Una imagen por objeto, más las repeticiones. Los 13 efectos figurativos costaron 13 imágenes, unos 0,82 $ en total. Lleva la cuenta y dila al cerrar.
