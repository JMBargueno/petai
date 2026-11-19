---
name: pockai-minigame-architect
description: Diseña, programa, dibuja e integra los minijuegos de PetAI (Cosecha del Éter, Cristal de Recuerdos, Pesca de Códices y las Pruebas de los Seis Flujos) con sentido de lore. Cubre la lógica determinista en shared/minigames (reglas por ticks que el servidor repite para validar la partida), el techo de puntos demostrado con un bot perfecto, la variante accesible, la entrada en shared/game-data/balance.json y accessibility.json, el Pockai del jugador como protagonista dentro del juego, el arte propio en pixel art (piezas y fondo de arena a partir de láminas de Nano Banana importadas y revisadas con una hoja de contactos), la vista DOM accesible con ratón, teclado y táctil, el brief en docs/minijuegos/<id>.md y la validación. Úsala cuando el usuario pida "un minijuego nuevo", "rediseñar o mejorar un minijuego", "que los minijuegos tengan que ver con el lore", "arte o assets para los minijuegos", "quitar los emoji de los juegos", "que el pockai salga en el juego", "una prueba para el Flujo X" o "cambiar las reglas o el premio de un minijuego". Para criaturas usa pockai-architect; para comidas y consumibles, pockai-item-architect; para prendas, pockai-accessory-architect; para muebles y salas, pockai-habitat-architect; para efectos del escritorio, pockai-effect-architect.
---

# Pockai Minigame Architect

Diseñas a lo que **juegan** un Custodio y su Pockai. En el lore, un minijuego es un «acertijo de sincronización»: los dos hacen algo juntos en un rincón del Éter y eso genera Resonancia. No es un pasatiempo genérico con otra piel. Cada minijuego debe:
- explicarse con una frase de lore (dónde ocurre, qué hace el Pockai y por qué);
- tener al Pockai del jugador dentro, haciendo algo, no mirando;
- ser **determinista**: la misma semilla y las mismas entradas dan la misma partida, porque el servidor la repite;
- tener un techo de puntos demostrado, que ni un bot perfecto rompe;
- tener variante accesible, y jugarse con ratón, teclado y táctil;
- llevar arte propio en pixel art: ni un emoji, ni un icono genérico;
- entenderse en cinco segundos sin leer nada.

Lee las referencias cuando las necesites:
- `references/minigame-contract.md`: `GameDefinition`, ticks, semilla, registro, repetición en el servidor, techo y qué se rompe al cambiar reglas.
- `references/lore-minigames.md`: qué es un minijuego en el Éter, el lugar y la frase de lore de cada juego, vocabulario e ideas sin hacer.
- `references/balance.md`: bandas de duración, techo y recompensas, afinidad, premio en objeto y variante accesible.
- `references/pixel-minigame-brief.md`: tamaños de pieza y de fondo, rampas, legibilidad en movimiento, plantilla del brief y checklist visual.
- `references/nano-banana-minigames.md`: generar láminas de piezas y fondos, importarlos y lo que ya se sabe de Nano Banana.
- `references/minigame-prompt.txt` y `references/backdrop-prompt.txt`: plantillas de prompt.
- `references/pockai-in-game.md`: cómo se pinta la mascota del jugador dentro de una vista.
- `references/integration-checklist.md`: archivos que hay que tocar y validación.

La norma es `docs/specs/spec-39-minijuegos-compartidos.md` (arquitectura y antitrampas), `docs/GUIA_ARTISTICA.md` §7 (visual) y `docs/LORE.md` (mundo). Si chocan con esta skill, mandan ellas.

**Estado del sistema:**
- Un solo paquete, `shared/minigames` (`@pockai/minigames`), sirve a todos: el escritorio importa el código fuente, Android carga el bundle `dist/embed` en un WebView y el backend importa solo la lógica (`dist/node`) para repetir la partida.
- Cada juego son tres piezas: lógica pura en `src/games/<id>.ts`, vista DOM en `src/views/<id>View.ts` y una línea en `src/registry.ts`. Los números viven en `shared/game-data/balance.json` (`minigames.games`) y la variante fácil en `accessibility.json`.
- El arte vive en `shared/assets/minigames/<id>/` y la vista lo pide por nombre (`src/assets.ts`). La comida se reutiliza de `shared/assets/items/`. La mascota se pinta con `src/pet.ts`.
- No hay sonido ni vibración. No hay sistema de traducción: los textos van en español en la vista, en `registry.ts` (`howTo`) y en `balance.json` (`name`).
- Los `id` de juego están en sesiones, misiones, logros y en la herramienta de IA `suggest_minigame`: **no se renombran**. El nombre visible sí puede cambiar.

## Flujo

### 1. Leer el estado actual
```bash
node .claude/skills/pockai-minigame-architect/scripts/check_minigames.mjs
```
Da el inventario (Flujo, duración, techo, recompensas, variante accesible, si tiene arte y brief, emoji que quedan en la vista), los huecos y los avisos. Sirve para no repetir mecánicas y para saber qué falta.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada en cada pregunta:
- **Qué es:** juego nuevo, rediseño de reglas de uno que existe, o solo arte.
- **Flujo:** uno de los seis (es una Prueba y da afinidad) o ninguno (un juego del Santuario, para todos).
- **Verbo:** qué hace el jugador con la mano. Uno solo: recoger, pescar, emparejar, seguir el ritmo, guiar, mantener.
- **Premio en objeto**, si lo hay, y cuál (`pockai-item-architect` si el objeto no existe).
- **Arte ahora o después.** Generar las láminas cuesta dinero: ver el paso 6.

Si el usuario no da idea, propón 2 o 3 juegos que cubran huecos de `check_minigames.mjs` y de `lore-minigames.md`.

Si lo que piden es solo **el arte de un juego que ya existe**, salta al paso 6.

### 3. Diseñar (reglas)
1. **Lore primero.** Una frase: «En X, tu Pockai hace Y porque Z» (`lore-minigames.md`). La mecánica se deduce del lugar: en el Pulso Voltaico se vive en el milisegundo, así que se juega al ritmo; en la Bio-Red se tiene paciencia, así que se piensa.
2. **Un verbo.** Si el jugador tiene que aprender dos cosas, sobra una. La profundidad sale de la presión (más rápido, más denso), no de más reglas.
3. **El Pockai es quien lo hace.** Él recoge, nada, pesca o aviva; el jugador lo guía. Reacciona cuando acierta y cuando falla. Nunca es un adorno en una esquina.
4. **Sin castigo que duela.** El mundo es acogedor: se pierde tiempo o racha, no la partida. Nada de vidas, muerte ni «game over». Un fallo aturde, enfría o ensucia.
5. **Determinismo sin excepciones** (`minigame-contract.md`): todo el azar de `createRng(seed)`, el tiempo en ticks, nada de reloj ni de `Math.random`, y nada de azar en la vista que cambie el estado.
6. **El techo se calcula antes de programar.** Escribe la cuenta: «un fruto cada 0,5 s que vale 2 como mucho → 4 pt/s». `maxScorePerSecond` va un poco por encima y el test del bot perfecto lo comprueba.
7. **La variante accesible no es otro juego.** Mismo verbo, más despacio, con más margen o con una ayuda visible. Da las mismas recompensas.
8. **Tres entradas.** Ratón, teclado y táctil desde el primer día; los mandos son botones de verdad con `aria-label`.
9. **Partidas cortas:** de 30 a 90 s (`balance.md`).
10. **No toques lo que ya cuenta.** No renombres un `id`. Si cambias reglas de un juego vivo, el cliente y el servidor tienen que salir a la vez (`minigame-contract.md`).
11. **`id`** en snake_case sin tildes (los de las Pruebas, en español: `pulso_voltaico`). **`name`** en español, de 2 a 4 palabras, con vocabulario del Éter («Pesca de Códices»). **`howTo`** de una línea, que diga qué hacer con la mano.
12. **Vocabulario del mundo**, sin jerga de juego: nada de «combo», «power-up», «vidas» ni «nivel».

### 4. Propuesta
Enseña al usuario: nombre, `id`, Flujo, frase de lore, el verbo, cómo puntúa con la cuenta del techo, qué hace el Pockai, la variante accesible, las recompensas junto al juego más parecido que ya existe, y el brief visual resumido (piezas, fondo, rampa). **Pide confirmación antes de programar.**

### 5. Lógica y datos
Sigue `references/integration-checklist.md`:
1. `shared/minigames/src/games/<id>.ts`: la `GameDefinition`. Constantes exportadas arriba, con la cuenta del techo en el comentario.
2. Regístralo en `src/logic.ts`, y con su vista en `src/registry.ts`.
3. `shared/game-data/balance.json` → `minigames.games.<id>`, **al final**; `accessibility.json` → su variante.
4. `src/games.spec.ts`: el bot perfecto del juego, para las dos variantes.
5. Brief en `docs/minijuegos/<id>.md` con la plantilla de `pixel-minigame-brief.md`.

### 6. Dibujar
El arte lo dibuja Nano Banana y el repo lo importa a la rejilla nativa (`nano-banana-minigames.md`). No lo dibujes con formas por código ni dejes emoji «de momento».
1. **Confirma el coste antes de la primera llamada de la sesión** y di cuántas imágenes llevas cada vez que generes otra. La clave la pone el usuario en `.env.local`; no la escribas tú.
2. **Reutiliza antes de generar.** La comida ya está en `shared/assets/items/`, la mascota en `shared/assets/species/` y los efectos en `shared/scene/src/effects/`. Solo se genera lo que el juego tiene de propio.
3. Una **lámina de piezas** por juego (todas en fila sobre magenta) y un **fondo de arena**. Rellena los prompts en `sprite-previews/minigames/<id>-*.txt`.
4. **Mira cada lámina** (Read) antes de importar. Si no cumple el brief, corrige el prompt.
5. Importa las piezas a `shared/assets/minigames/<id>/` y el fondo a `backdrop.webp`.
6. `pnpm generate:minigames --preview` y **mira** `sprite-previews/minigames-contact.png`: las piezas a tres escalas sobre el fondo del juego y junto a un Pockai. Repasa la checklist de `pixel-minigame-brief.md` e itera.
7. **Afina un juego y enséñaselo al usuario antes de hacer los demás.** Con el estilo aprobado, pásalo como `--ref` a los siguientes.
8. `pnpm generate:minigames` actualiza `shared/assets/minigames/manifest.json`.

Si no hay clave o el usuario no quiere gastar ahora, deja la lógica, el brief y los prompts hechos y dilo al cerrar. La vista cae a un recuadro con el color de la pieza; no pongas emoji.

### 7. Vista
`shared/minigames/src/views/<id>View.ts`, DOM sin framework (`views/types.ts`):
- La vista **solo pinta el estado y encola entradas** con `ctx.push`. Nunca cambia el estado.
- Las piezas son `<img>` con `pieceUrl(id, nombre)` y `image-rendering: pixelated`, a escala entera.
- La mascota es `ctx.pet` (`pockai-in-game.md`): cambia de clip según lo que pase en el estado.
- Respeta `ctx.reducedMotion`: sin sacudidas ni destellos; el estado se sigue leyendo.
- Los avisos de puntuación van en `status()`, que el HUD anuncia con `role="status"`.

### 8. Validar
```bash
node .claude/skills/pockai-minigame-architect/scripts/check_minigames.mjs <id>
pnpm --filter @pockai/minigames test
pnpm --filter @pockai/minigames typecheck
node scripts/validate-game-data.js
node scripts/validate-assets.js
```
Si cambiaste reglas: `pnpm --filter @pockai/minigames build:node` y, desde `backend/`, `npx jest src/modules/minigames`.

**Juega una partida.** `preview_start` con `pockai-minigames-dev` y abre `/?demo=<id>` (y `&easy`). Comprueba con ratón y con teclado, mira la consola y saca una captura. Un minijuego que pasa los tests y no se ha jugado no está terminado.

### 9. Cerrar
Resume al usuario:
- Lore del juego en una frase, el verbo y qué hace el Pockai.
- La cuenta del techo y las recompensas.
- Archivos tocados y resultado de las validaciones; avisos de `check_minigames.mjs` que dejes sin resolver, y por qué.
- La hoja de contactos y la captura de la partida, y cuántas imágenes de Nano Banana ha costado.
- Lo que queda fuera del repo: el backend y los clientes se despliegan juntos si cambiaron las reglas; Android necesita `build:embed` y una versión nueva de la app para recibir el arte.
