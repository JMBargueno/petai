---
name: pockai-accessory-architect
description: Diseña, dibuja e integra accesorios (prendas) para los Pockais de PetAI, como gorros, coronas, gafas, bufandas, collares, capas, alas o mochilas. Cubre la entrada en shared/game-data/accessories.json (ranura, rareza, color, desbloqueo por monedas, gemas o logro), el arte en pixel art procedural en tres tallas revisado con una hoja de contactos sobre cada especie y etapa, el brief en docs/accesorios/<id>.md, el enlace con achievements.json cuando la prenda es premio de logro y la validación. Úsala cuando el usuario pida "un accesorio nuevo", "una prenda", "un gorro/unas gafas/una capa para los pockais", "ropa o cosméticos para la mascota", "convertir el premio de un logro en prenda" o "más cosas para la tienda de accesorios". Para criaturas usa pockai-architect; para muebles y salas, pockai-habitat-architect; para efectos del escritorio, pockai-effect-architect. Para minijuegos, pockai-minigame-architect.
---

# Pockai Accessory Architect

Diseñas lo que los Pockais **llevan puesto**. Una prenda es cosmética: no cambia stats, cambia cómo se ve la mascota y qué cuenta de su Custodio. Cada prenda debe:
- leerse a 64 px sobre cualquier especie y etapa,
- ocupar una sola ranura y convivir con las otras tres,
- no tapar nunca ojos, boca ni rasgo icónico,
- y tener una vía de desbloqueo que encaje con su rareza.

Lee las referencias cuando las necesites:
- `references/accessory-schema.md`: campos de `accessories.json`, ranuras, vías de desbloqueo y qué hace el backend con ellos.
- `references/pixel-accessory-brief.md`: reglas de dibujo por ranura y talla, la plantilla del brief y la checklist visual.
- `references/balance.md`: rareza frente a desbloqueo, precios orientativos y reparto del catálogo.
- `references/integration-checklist.md`: archivos que hay que tocar y validación.

La norma es `docs/GUIA_ARTISTICA.md` §7.6 (visual) y `docs/specs/spec-38-accesorios-pockai.md` (datos). Si hay conflicto con esta skill, mandan ellas.

**Estado del sistema:** el catálogo, la compra, el equipado, el arte y el render funcionan (spec 38). La escena compartida y la mascota de escritorio pintan la prenda en cuanto existe su arte; el armario solo está en el escritorio.

## Flujo

### 1. Leer el estado actual
Lee `shared/game-data/accessories.json` y ejecuta:

```bash
node .claude/skills/pockai-accessory-architect/scripts/check_accessories.mjs
```

Da el inventario por ranura, rareza, vía y color, los avisos de diseño y los premios de logro (`ach_item_*`) que aún no son prenda. Sirve para ver huecos y no repetir.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada en cada pregunta:
- **Ranura:** `head`, `face`, `neck` o `back`. Recomienda la que tenga menos prendas o la que pida el concepto.
- **Rareza.** Propónla tú según lo elaborada que sea la prenda (`balance.md`).
- **Vía de desbloqueo:** monedas, gemas o logro. Si es logro, cuál.
- **Color:** una de las ocho rampas. Recomienda una que aún no esté en esa ranura.

Si el usuario no da idea, propón 2 o 3 prendas que cubran huecos: ranuras con pocas prendas, rampas sin usar, rarezas sin representar o premios de logro pendientes de convertir.

### 3. Diseñar (reglas)
1. **Una idea por prenda.** Un gorro son una cúpula, un ribete y un pompón. Si necesitas explicarla, sobra algo.
2. **Universal.** No sabes en qué especie ni etapa acabará: nada que dependa de orejas, cuernos, brazos o una forma de cuerpo concreta. Se coloca en un ancla y ya.
3. **Los ojos mandan.** En `face` solo monturas de 1 px alrededor de cada ojo, antifaces con los ojos abiertos o narices. Nada de cristales tintados.
4. **Se ve en la silueta.** Las prendas de `back` sobresalen al menos 4 px del cuerpo; las de `head` suben hasta 6 px por encima de la etapa.
5. **Color de marca.** La rampa es una de las ocho de la guía; el contorno es el tono oscuro de la propia prenda. Como mucho 6 colores.
6. **La rareza está en la forma,** no en añadir tonos: una rampa (normal), dos (raro), un detalle que rompe la silueta (super-raro), animación de 2 frames (legendario), animación y partícula (mítico).
7. **Vía acorde a la rareza** (`balance.md`). Las prendas de logro cuentan la historia del logro: una bufanda para el de dormir, una capa para el de combate.
8. **Sin efectos de juego.** No añadas buffs, stats ni campos que no estén en `accessory-schema.md`.
9. **`id`** en snake_case con prefijo `acc_`, único. Si es premio de logro, el `id` es el `reward.itemId` que ya tiene el logro (`ach_item_*`), sin cambiarlo. **`name`** en español, de 1 a 3 palabras. **`description`** de una frase, con gracia y sin jerga de juego.
10. **Sin textos ni logotipos** en la prenda: en espejo se leerían al revés.

### 4. Propuesta
Muestra al usuario: nombre, ranura, rareza, color, vía de desbloqueo con su precio o su logro, y el brief visual resumido (qué se ve en talla S, M y L). Indica cómo queda el reparto del catálogo tras añadirla. **Pide confirmación antes de integrar.**

### 5. Integrar
Sigue `references/integration-checklist.md`:
1. Añade la entrada **al final** de `accessories` en `shared/game-data/accessories.json`.
2. Si es premio de logro, comprueba que el logro existe y que su `reward.itemId` es el `id` de la prenda. No toques `achievements.json` salvo que el usuario pida un logro nuevo.
3. Escribe el brief en `docs/accesorios/<id>.md` con la plantilla de `pixel-accessory-brief.md`.
4. Dibuja la prenda: añade su entrada en `ACCESSORY_ART` (`scripts/sprites/pixel/accessories.ts`), reutilizando una forma existente (`beanie`, `partyHat`, `crown`, `glasses`, `scarf`, `cape`, `wings`) o escribiendo una nueva.
5. Genera la hoja de contactos con `pnpm generate:accessories --preview` y **mírala** (Read de `sprite-previews/accessories-contact.png`): cada prenda sobre las tres especies en sus cuatro etapas. Corrige hasta que pase la checklist visual.
6. `pnpm generate:accessories` escribe `shared/assets/accessories/<id>/{s,m,l}.png` y `meta.json`.

### 6. Validar
```bash
node .claude/skills/pockai-accessory-architect/scripts/check_accessories.mjs <id>
node scripts/validate-game-data.js
node scripts/validate-assets.js
```
Desde `backend/`, ejecuta también `npx jest src/modules/accessories src/modules/inventory`. Si algo falla, corrige y repite.

### 7. Cerrar
Resume al usuario:
- Archivos tocados y resultado de las validaciones.
- Avisos del script que hayas dejado sin resolver, y por qué.
- Hoja de contactos revisada.
- Dónde se ve: en la sala y en la mascota de escritorio, tras equiparla en Mascota › Armario.
- El paso que queda fuera del repo: ejecutar el seed (`backend/prisma/seed.ts`) en cada entorno para que la prenda exista como `Item`. El precio solo se fija al crearla; después se cambia desde el panel de admin.
