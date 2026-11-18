# Checklist de integración (accesorios)

Las rutas son relativas a la raíz del repo.

## Datos
1. Añade la prenda **al final** de `accessories` en `shared/game-data/accessories.json` (`accessory-schema.md`).
2. Si es premio de logro:
   - Busca el logro en `shared/game-data/achievements.json` y comprueba que su `reward.itemId` es el `id` de la prenda.
   - No cambies ids de logros ni de premios existentes: los usuarios que ya lo ganaron tienen ese `itemId` en el inventario.
3. No hay que registrar la prenda en ningún cliente: el catálogo se sirve por `GET /accessories`.

## Brief
4. Escribe `docs/accesorios/<id>.md` con la plantilla de `pixel-accessory-brief.md`.

## Validación
5. `node .claude/skills/pockai-accessory-architect/scripts/check_accessories.mjs <id>`: errores a 0; revisa los avisos.
6. `node scripts/validate-game-data.js`
7. Desde `backend/`: `npx jest src/modules/accessories src/modules/inventory`.
8. `git diff --stat`: solo cambian `accessories.json` y el brief de la prenda.

## Después
9. El seed (`backend/prisma/seed.ts`) crea el `Item` de la prenda; hay que ejecutarlo en cada entorno. Sin seed la prenda aparece en `GET /accessories`, pero no se puede comprar.
10. El precio del JSON solo se usa al crear el `Item`. Para cambiarlo después, panel de admin.
11. Arte y render: pendientes del lote 3 de `docs/specs/spec-38-accesorios-pockai.md`. Cuando exista, la prenda necesitará `shared/assets/accessories/<id>/{s,m,l}.png` y `meta.json`.
