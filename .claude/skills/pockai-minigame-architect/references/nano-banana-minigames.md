# El arte con Nano Banana

El arte propio de un minijuego lo dibuja una IA de imagen (Nano Banana, por la API de Gemini) y el repo lo importa. Es el mismo flujo que los objetos (`pockai-item-architect/references/nano-banana-items.md`) y el mismo generador; cambian las plantillas y el destino.

## Requisitos
- La clave va en `GEMINI_API_KEY`, en el entorno o en `.env.local` en la raíz (ignorado por git). **La pone el usuario.** No la escribas tú en ningún archivo ni comando, y no intentes leer `.env.local`. Si la pega en el chat, recomiéndale revocarla.
- El generador busca `.env.local` solo en el directorio actual. En un worktree no estará: pídele al usuario que la exporte en el entorno o que copie el archivo.
- **Cada imagen se cobra** (unos céntimos) y el prompt sale hacia Google. Confirma con el usuario antes de la primera llamada de la sesión y dile cuántas llevas cada vez.
- Ante un error 429 por tope de gasto, para y dilo. No lo rodees.
- Dependencias instaladas (`pnpm install`): los importadores usan `sharp`.

## Qué se genera

Por juego, **dos imágenes** si sale a la primera:
1. Una **lámina de piezas**: todas las piezas propias del juego en fila sobre magenta.
2. Un **fondo de arena**.

No se genera lo que ya existe (comida, mascota) ni lo que es una marca de CSS (`pixel-minigame-brief.md`).

## Piezas

1. **Prompt.** Copia `references/minigame-prompt.txt` a `sprite-previews/minigames/<id>-pieces.txt` y rellena las marcas `{{…}}` con el brief. `sprite-previews/` está ignorado por git.
2. **Genera:**
   ```bash
   node scripts/sprites/concept/generate.mjs sprite-previews/minigames/<id>-pieces.png \
     --prompt sprite-previews/minigames/<id>-pieces.txt --ratio 16:9
   ```
   Con `--ref <png>` pasas piezas ya aprobadas de otro juego (`sprite-previews/minigames/<otro>-import.png`) o un objeto (`shared/assets/items/spicy_berry.png`) para que copie la mano. Hasta cuatro piezas por lámina; con más, salen pequeñas y se emborronan: haz dos láminas.
3. **Mira la lámina** (Read). ¿Son las piezas del brief, en el orden pedido? ¿Fondo magenta liso? ¿Píxeles gordos y cuadrados? ¿Sin texto ni sombras? Si no, corrige el prompt y repite.
4. **Importa** con el importador de objetos, a la carpeta del juego:
   ```bash
   node scripts/sprites/items/import.mjs sprite-previews/minigames/<id>-pieces.png \
     --ids <pieza1>,<pieza2>,<pieza3> --free-ids --out shared/assets/minigames/<id> \
     --preview sprite-previews/minigames/<id>-import.png
   ```
   `--free-ids` deja usar nombres que no están en `foods.json`. El resto de opciones son las de siempre: `--pick`, `--colors 12`, `--fit 28`, `--size 32`, `--no-outline`, `--crop x,y,w,h`. Para una pieza grande: `--size 48 --fit 44`, en una llamada aparte con `--pick`.

## Fondo

1. **Prompt.** Copia `references/backdrop-prompt.txt` a `sprite-previews/minigames/<id>-backdrop.txt` y rellénalo.
2. **Genera:**
   ```bash
   node scripts/sprites/concept/generate.mjs sprite-previews/minigames/<id>-backdrop.png \
     --prompt sprite-previews/minigames/<id>-backdrop.txt --ratio 4:3 --size 1K
   ```
   Pasa como `--ref` el fondo de un juego ya aprobado, o un fondo de sala (`shared/assets/habitat-backdrops/*.webp`) si es el primero.
3. **Mira el fondo.** ¿Se entiende el lugar? ¿La zona de juego está limpia? ¿No hay personajes, objetos del juego ni texto?
4. **Importa:**
   ```bash
   node scripts/sprites/minigames/backdrop.mjs sprite-previews/minigames/<id>-backdrop.png <id> [--dim 0.15] [--focus top|center|bottom]
   ```
   Recorta a 4:3, reduce a 680×520 y escribe `shared/assets/minigames/<id>/backdrop.webp`. `--dim` lo oscurece un poco si se come a las piezas; `--focus` elige qué parte se queda al recortar.

## Hoja de contactos y manifiesto

```bash
pnpm generate:minigames --preview   # sprite-previews/minigames-contact.png
pnpm generate:minigames             # comprueba tamaños y colores y escribe shared/assets/minigames/manifest.json
```
**Mira** la hoja con la checklist de `pixel-minigame-brief.md`. Después arranca el juego (`pockai-minigames-dev`, `/?demo=<id>`) y saca una captura: una pieza que se lee quieta puede no leerse cayendo.

## Cómo iterar
- **Primero el prompt, luego el importador.** Si la forma no es la del brief, cambia el prompt. Si la forma es buena y el resultado a 32 px no, prueba `--fit`, `--colors` o `--no-outline`.
- **Un juego hasta que guste, y después los demás.** Enséñaselo al usuario jugando, no solo en la hoja.
- Con el estilo fijado, pasa siempre una pieza y un fondo aprobados como `--ref`: todos los juegos tienen que parecer de la misma mano.
- No retoques un PNG a mano ni con código: lo siguiente que se regenere lo pisaría. Si hace falta un arreglo fino, que quede en el prompt o en las opciones del importador, y anótalo en el brief.

## Lo que ya se sabe de Nano Banana a este tamaño
Heredado de objetos y efectos:
- Dibuja en una rejilla de unos 27 a 70 px aunque le pidas menos. Pide **formas grandes y pocas piezas**; el detalle fino se pierde al reducir.
- Por debajo de unos 22 px de ancho el dibujo se emborrona: cada pieza llena su lienzo.
- Pide **colores exactos por hex**, pocos, y fondo magenta `#ff00ff` liso. El importador trata el rosa como fondo: una pieza no puede llevar rosa ni magenta.
- A veces repite una pieza, añade destellos sueltos o una sombra en el suelo. Las motas se descartan solas; lo demás, con `--pick` o `--crop`.
- No sabe contar píxeles ni respetar un orden largo: comprueba que las piezas salen en el orden de `--ids`.
- En los fondos tiende a llenar el centro de detalle. Dile dónde tiene que quedar vacío y de qué color.
- Tarda unos 35 s por imagen.

## Coste
Dos imágenes por juego, más las repeticiones. Referencia: 13 imágenes costaron unos 0,82 $. Lleva la cuenta y dila al cerrar.
