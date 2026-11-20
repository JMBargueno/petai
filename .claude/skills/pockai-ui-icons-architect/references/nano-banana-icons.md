# Concepto de iconos con Nano Banana

Nano Banana genera imágenes raster. **No produce el SVG**: sirve para fijar la forma y el ritmo antes de dibujar a mano en `icon-defs.mjs`.

## Requisitos
- `GEMINI_API_KEY` en el entorno o en `.env.local` (ignorado por git). **La pone el usuario.** No la escribas en ningún archivo ni comando, ni la muestres.
- **Cada imagen se cobra.** Confirma antes de la primera llamada de la sesión y di cuántas llevas.
- `node scripts/sprites/concept/generate.mjs --list` lista los modelos sin generar nada.

## Uso
1. Copia `references/icon-prompt.txt` a `sprite-previews/icons/<nombre>-prompt.txt` y rellena los destinos.
2. Genera:
   ```bash
   node scripts/sprites/concept/generate.mjs sprite-previews/icons/<nombre>-concept.png --prompt sprite-previews/icons/<nombre>-prompt.txt --ratio 16:9
   ```
3. Mira la imagen con Read y enséñasela al usuario.
4. Dibuja cada icono en `scripts/icon-defs.mjs` tomando **la silueta y el ritmo**, no el dibujo: la retícula de 24 px y el trazo de 1.75 mandan.

`sprite-previews/` está en `.gitignore`: los conceptos no se suben. Si uno define el diseño, descríbelo con palabras en `icon-defs.mjs`.

## Lo que aprendimos del concepto de referencia
- Nano Banana dibuja con **contorno grueso y tinta clara** bajo la forma principal: eso se traduce en el acento duotone (`fill-opacity="0.18"`), no en un degradado.
- Mete demasiado detalle (carita en la mascota, sombras). En el SVG se quita: a 16 px no se lee.
- Los iconos de «rayo en órbita» y «slider» salen bien en silueta; el «cerebro» necesita simplificarse a un chip con nodos.
