---
name: pockai-item-architect
description: Diseña, dibuja e integra los objetos consumibles de PetAI, como comidas (Manzana Crujiente, Baya Ígnea, Coral Glaseado), medicinas (Elixir Reparador) y el objeto de evolución (Piedra de Evolución). Cubre la entrada en shared/game-data/foods.json (tipo, precio en monedas o gemas, efectos sobre hambre, felicidad, energía y salud), su sitio en el lore del Éter, su vía de obtención (tienda, cofres, minijuegos, hallazgos, comida favorita de un Flujo), el icono en pixel art a partir de una lámina de Nano Banana importada a 32 px y revisada con una hoja de contactos, el brief en docs/objetos/<id>.md y la validación. Úsala cuando el usuario pida "un objeto nuevo", "un consumible", "una comida/baya/fruta/dulce/poción para los pockais", "otra medicina", "la comida favorita del elemento X", "más cosas para la tienda o los cofres", "el arte/icono de la manzana" o "dibujar los objetos". Para criaturas usa pockai-architect; para prendas, pockai-accessory-architect; para muebles y salas, pockai-habitat-architect; para efectos del escritorio, pockai-effect-architect. Para minijuegos, pockai-minigame-architect.
---

# Pockai Item Architect

Diseñas lo que los Pockais **comen, beben y gastan**. Un consumible desaparece al usarlo y cambia la Armonía Vital de la mascota; no es una prenda ni un mueble. Cada objeto debe:
- explicarse con una frase de lore (de qué corriente del Éter sale y por qué hace lo que hace);
- hacer algo que el backend sepa ejecutar hoy;
- costar lo que vale: entrar en su banda de precio y efectos;
- conseguirse por al menos una vía (tienda, cofre, minijuego o hallazgo);
- reconocerse por la silueta en un icono de 32 px, sobre fondo claro y oscuro.

Lee las referencias cuando las necesites:
- `references/item-schema.md`: campos de `foods.json`, qué hace el backend con cada `kind` y dónde se referencia un id.
- `references/lore-items.md`: qué es cada tipo de objeto en el Éter, los Seis Flujos y la frase de lore de los objetos que ya existen.
- `references/balance.md`: bandas de precio y efectos, tiers de cofre y vías de obtención.
- `references/pixel-item-brief.md`: reglas de dibujo, rampas de color, cómo se nota la rareza, plantilla del brief y checklist visual.
- `references/nano-banana-items.md`: generar la lámina, importarla y lo que ya se sabe de cómo dibuja Nano Banana a este tamaño.
- `references/item-prompt.txt`: plantilla del prompt.
- `references/integration-checklist.md`: archivos que hay que tocar y validación.

La norma es `docs/GUIA_ARTISTICA.md` §7.7 (visual, con las rampas de §7.5 y §7.6) y `docs/LORE.md` (mundo). Si chocan con esta skill, mandan ellas.

**Estado del sistema:**
- Los datos funcionan de punta a punta: `foods.json` → seed → `Item` → tienda, inventario, cofres, minijuegos, hallazgos y regalos.
- Tipos con mecánica: `food` (alimentar), `medicine` (curar) y `evolution` (la Forma Final, un único objeto). **Nada más.** Un juguete (`toy`) o un ingrediente de `recipes.json` no hacen nada hoy: si te piden uno, dilo y propón construir antes la mecánica.
- El arte de objetos tiene pipeline (`scripts/sprites/items/import.mjs`, `pnpm generate:items`) y los 11 objetos de partida tienen icono. **El escritorio los pinta solo** en la tienda, en los chips de «Alimentar» y al abrir un cofre (`desktop/src/components/ItemIcon.svelte`); un objeto sin PNG cae al icono genérico. Android también (`ui/theme/ItemIcon.kt`: tienda, selector de comida, cofres y premio de minijuego), con el arte dentro del APK. El contrato para cualquier cliente está en `docs/ART_PIPELINE.md` §10; iOS y la web aún no los pintan.

## Flujo

### 1. Leer el estado actual
```bash
node .claude/skills/pockai-item-architect/scripts/check_items.mjs
```
Da el inventario por tipo (precio, efectos, de qué Flujo es favorita, dónde sale, si tiene arte), los huecos del catálogo y los avisos. Sirve para no repetir y para proponer lo que falta.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada en cada pregunta:
- **Tipo:** `food` o `medicine`. (`evolution` ya está ocupado: ver `item-schema.md`.)
- **Flujo:** uno de los seis, o neutro (Mímesis Terrenal). Si es de un Flujo, si pasa a ser la favorita de alguna especie.
- **Banda:** básica, de Flujo, capricho, saludable o remedio (`balance.md`). Propónla tú según la idea.
- **Vía de obtención:** tienda, cofres (y en qué tier), minijuego, hallazgo.
- **Arte ahora o después.** Generar la lámina cuesta dinero: ver el paso 6.

Si el usuario no da idea, propón 2 o 3 objetos que cubran huecos de `check_items.mjs`.

Si lo que piden es solo **el arte de un objeto que ya existe**, salta al paso 6.

### 3. Diseñar (reglas)
1. **Lore primero.** Una frase: «X sale de Y, por eso hace Z» (`lore-items.md`). El efecto se deduce del lore, no al revés: una baya del Termo-Impulso calienta (energía), no calma.
2. **Una idea por objeto.** Una baya con una llama por hoja. Si necesitas tres adjetivos para describirlo, sobra algo.
3. **Solo lo que el backend lee.** `effects` admite `hunger`, `happiness`, `energy`, `health` y `curesSick`. No inventes claves: el servidor las ignora y el objeto miente.
4. **Dentro de su banda** (`balance.md`). Una comida potente lleva contrapartida: el Pastel sube 35 de felicidad y baja 5 de salud. Una medicina también puede: el Elixir cura y baja 10 de felicidad.
5. **No toques lo que ya está en manos de los jugadores.** Nunca renombres un `id` ni cambies el `kind` de un objeto existente: está en inventarios, cofres y regalos.
6. **Comida favorita con cuidado.** Cambiar `favoriteFood` de una especie cambia qué comida le sacia y le alegra un 50 % más. Solo si el usuario lo pide, y nunca a todas las especies de un Flujo a la vez sin decirlo.
7. **`id`** en snake_case, en inglés, sin prefijo (`acc_` y `ach_item_` son de las prendas). **`name`** en español, de 1 a 3 palabras: un sustantivo y un apellido del Éter («Baya Ígnea», «Miel de Alba»). **`description`** de una frase que diga qué es y qué hace sin números; si es favorita de un Flujo, una segunda frase corta: «Favorita de las criaturas de fuego».
8. **Vocabulario del mundo**, sin jerga de juego: nada de «buff», «stat», «HP» ni «+15».
9. **La rareza se ve en el dibujo** (`pixel-item-brief.md`), y el tier de cofre acompaña al precio (`balance.md`).

### 4. Propuesta
Enseña al usuario: nombre, `id`, tipo, Flujo, frase de lore, precio, efectos en una tabla junto al objeto más parecido que ya existe, vías de obtención y el brief visual resumido (silueta, rampa, detalle de rareza). **Pide confirmación antes de integrar.**

### 5. Integrar los datos
Sigue `references/integration-checklist.md`:
1. Añade la entrada **al final** de `shared/game-data/foods.json`.
2. Según la vía acordada, en `shared/game-data/balance.json`: tablas de cofre (`chests.<tipo>.dropTable`), `minigames.games.<id>.itemDrop` o `personality.autonomy.itemFind.items`. Si solo se vende en tienda, no toques `balance.json`.
3. Si pasa a ser favorita, cambia `favoriteFood` en `shared/game-data/species.json` solo en las especies acordadas.
4. Escribe el brief en `docs/objetos/<id>.md` con la plantilla de `pixel-item-brief.md`.

### 6. Dibujar
El arte lo dibuja Nano Banana y el repo lo importa a la rejilla nativa (`nano-banana-items.md`). No lo dibujes con formas por código.
1. **Confirma el coste antes de la primera llamada de la sesión** y di cuántas imágenes llevas cada vez que generes otra. La clave la pone el usuario en `.env.local`; no la escribas tú.
2. Rellena el prompt desde `references/item-prompt.txt` en `sprite-previews/items/<id>-prompt.txt` y genera la lámina.
3. **Mira la lámina** (Read). Si no cumple el brief, corrige el prompt antes de importar.
4. Importa: `node scripts/sprites/items/import.mjs <lámina> --ids <id> --preview sprite-previews/items/<id>-import.png`.
5. `pnpm generate:items --preview` y **mira** `sprite-previews/items-contact.png`: el icono a tres escalas, sobre claro y oscuro y junto a una cría. Repasa la checklist de `pixel-item-brief.md` e itera.
6. **Afina un objeto y enséñaselo al usuario antes de hacer los demás.** Varios objetos pueden ir en una sola lámina cuando el estilo ya está fijado.
7. `pnpm generate:items` actualiza `shared/assets/items/manifest.json`.

Si no hay clave o el usuario no quiere gastar ahora, deja los datos y el brief hechos y dilo al cerrar: el objeto funciona sin arte.

### 7. Validar
```bash
node .claude/skills/pockai-item-architect/scripts/check_items.mjs <id>
node scripts/validate-game-data.js
node scripts/validate-assets.js
```
Desde `backend/`, ejecuta también `npx jest src/modules/game-data src/modules/pets src/modules/chests src/modules/inventory`. Si algo falla, corrige y repite.

### 8. Cerrar
Resume al usuario:
- Lore del objeto en una frase, qué hace y cuánto cuesta.
- Archivos tocados y resultado de las validaciones; avisos de `check_items.mjs` que dejes sin resolver, y por qué.
- La hoja de contactos revisada, y cuántas imágenes de Nano Banana ha costado.
- El paso que queda fuera del repo: ejecutar el seed (`backend/prisma/seed.ts`) en cada entorno para que el objeto exista como `Item`. El precio solo se fija al crearlo; después se cambia desde el panel de admin.
- Dónde se ve: en el escritorio, en Tienda, en «Alimentar» y al abrir un cofre. Para comprobarlo, `preview_start` con `pockai-desktop-demo`; la demo solo lista los objetos de `desktop/vite.mock.ts`, así que añade ahí el nuevo si quieres verlo.
