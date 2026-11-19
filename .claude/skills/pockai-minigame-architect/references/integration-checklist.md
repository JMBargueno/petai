# Checklist de integración (minijuegos)

Las rutas son relativas a la raíz del repo.

## Lógica
1. `shared/minigames/src/games/<id>.ts`: la `GameDefinition`, con las constantes exportadas y la cuenta del techo en su comentario (`minigame-contract.md`).
2. `shared/minigames/src/logic.ts`: añádela a `GAME_DEFINITIONS`. Este archivo no puede importar nada con DOM.
3. `shared/minigames/src/games.spec.ts`: el bot perfecto del juego en las dos variantes. El test de catálogo ya exige que lógica, registro, `balance.json` y `accessibility.json` tengan los mismos ids.

## Datos
4. `shared/game-data/balance.json` → `minigames.games.<id>`, **al final** (`balance.md`). No reordenes los demás.
5. `shared/game-data/accessibility.json` → `minigames.<id>` con `"variant": "<id>_easy"`.
6. Si da premio en objeto: `itemDrop`, y el nombre del objeto en `desktop/vite.mock.ts` y en `PlayScreen.kt`.

## Vista
7. `shared/minigames/src/views/<id>View.ts` (`minigame-contract.md`, `pockai-in-game.md`). Sin emoji.
8. `shared/minigames/src/registry.ts`: `createView`, `icon` (un nombre que exista en `desktop/src/components/Ico.svelte`; es solo el respaldo mientras no haya `icon.png`) y `howTo`.
9. Sonido: añade los ids del juego a `MG` en `shared/minigames/src/sound.ts` y a `shared/game-data/sounds.json` (`mg.<id>.<sonido>`, con su `prompt` en inglés; `source: "synth"` y receta en `shared/audio/src/synth.ts` si tiene que ir exacto al tempo o seguir una escala). Un test exige que coincidan. Generar los ficheros es aparte y cuesta dinero (`pnpm sfx:generate --only mg`, spec 40).
9b. Estilos en `shared/minigames/src/styles.ts`, con prefijo `pmg-` y una clase de arena propia (`pmg-arena--<algo>`).
10. Icono de tarjeta: `shared/assets/minigames/<id>/icon.png` (32 px nativos, ver `nano-banana-minigames.md` y ART_PIPELINE §11). Escritorio y Android lo cogen solos.
10b. Android lleva su propio mapa de iconos de respaldo y pistas por juego (`mobile/android/.../ui/play/PlayScreen.kt`): añade el juego ahí o dilo al cerrar.

## Brief y arte
11. `docs/minijuegos/<id>.md` con la plantilla de `pixel-minigame-brief.md`.
12. Piezas y fondo en `shared/assets/minigames/<id>/` (`nano-banana-minigames.md`).
13. `pnpm generate:minigames` → comprueba el arte y actualiza `shared/assets/minigames/manifest.json`.
14. Si no se hace el arte ahora, no dejes archivos a medias en esa carpeta.

## Validación
15. `node .claude/skills/pockai-minigame-architect/scripts/check_minigames.mjs <id>`: errores a 0; revisa los avisos.
16. `pnpm --filter @pockai/minigames test` y `pnpm --filter @pockai/minigames typecheck`; `pnpm validate:sounds` si tocaste el catálogo.
17. `node scripts/validate-game-data.js` y `node scripts/validate-assets.js`.
18. Si cambió la lógica: `pnpm --filter @pockai/minigames build:node` y, desde `backend/`, `npx jest src/modules/minigames`.
19. Desde `desktop/`: `npx svelte-check --threshold error`.
20. **Jugar:** `preview_start` con `pockai-minigames-dev`, `/?demo=<id>` y `/?demo=<id>&easy`. Ratón y teclado, consola sin errores, captura. En esa página `window.__pockaiSfx` lista los sonidos pedidos: comprueba que cada suceso pide el suyo.
21. `git diff --stat`: solo cambia lo previsto.

## Después
22. **Cliente y servidor salen juntos** si cambiaron las reglas de un juego que ya existía. El backend recompila la lógica en `build` y `start`.
23. Android recibe juegos y arte dentro del APK: `pnpm --filter @pockai/minigames build:embed` y una versión nueva de la app. Hasta entonces sigue con lo anterior.
24. La demo del escritorio (`pockai-desktop-demo`) lista los juegos desde `desktop/vite.mock.ts`: añade el nuevo, o cambia el nombre, si quieres verlo ahí.
25. `docs/specs/spec-39-minijuegos-compartidos.md` lleva la tabla de reglas de cada juego (§4 y §5): actualízala.
26. `docs/API.md` y la landing (`web/src/locale/messages.*.json`) citan cuántos minijuegos hay.
