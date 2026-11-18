# Checklist de integración (objetos)

Las rutas son relativas a la raíz del repo.

## Datos
1. Añade el objeto **al final** de `shared/game-data/foods.json` (`item-schema.md`). No reordenes ni toques los demás.
2. Según la vía acordada, en `shared/game-data/balance.json`:
   - **Cofres:** una línea `{ "itemId", "tier", "qtyMin", "qtyMax" }` en la `dropTable` de cada cofre donde entre (`balance.md`). No toques `tierWeights`.
   - **Minijuego:** `minigames.games.<id>.itemDrop` (uno por juego: si ya tiene, se sustituye; dilo).
   - **Hallazgos:** añade el id a `personality.autonomy.itemFind.items`.
3. Si pasa a ser favorita: `favoriteFood` en `shared/game-data/species.json`, solo en las especies acordadas.
4. No hay que registrar el objeto en ningún cliente: la tienda y el inventario lo reciben del servidor.

## Brief
5. Escribe `docs/objetos/<id>.md` con la plantilla de `pixel-item-brief.md`.

## Arte
6. Sigue `nano-banana-items.md`: prompt, lámina, importar, hoja de contactos.
7. `pnpm generate:items` → comprueba `shared/assets/items/<id>.png` y actualiza `manifest.json`.
8. Si no se hace el arte ahora, no dejes archivos a medias en `shared/assets/items/`.

## Validación
9. `node .claude/skills/pockai-item-architect/scripts/check_items.mjs <id>`: errores a 0; revisa los avisos.
10. `node scripts/validate-game-data.js` y `node scripts/validate-assets.js`.
11. Desde `backend/`: `npx jest src/modules/game-data src/modules/pets src/modules/chests src/modules/inventory`.
12. `git diff --stat`: solo cambian `foods.json`, lo acordado de `balance.json` o `species.json`, el brief y, si hay arte, `shared/assets/items/<id>.png` y `manifest.json`.

## Después
13. El seed (`backend/prisma/seed.ts`) crea el `Item`; hay que ejecutarlo en cada entorno. Sin seed el objeto no existe en la tienda y un cofre que lo suelte fallaría al entregarlo: **datos y seed se despliegan juntos**.
14. El precio del JSON solo se usa al crear el `Item`. Para cambiarlo después, panel de admin.
15. El escritorio pinta el icono solo, en cuanto existe el PNG: tienda, chips de «Alimentar» y premios de un cofre (`desktop/src/lib/items.ts`, `ItemIcon.svelte`). Sin PNG cae al icono genérico. Web y Android aún no los pintan.
16. `desktop/vite.mock.ts` y `PlayScreen.kt` (Android) llevan nombres de objetos a mano para la demo y el premio de minijuego. Si el objeto nuevo es premio de un minijuego, añádelo ahí o dilo al cerrar.
