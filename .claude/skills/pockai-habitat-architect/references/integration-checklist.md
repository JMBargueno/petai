# Checklist de integración (muebles y salas)

Las rutas son relativas a la raíz del repo.

## Datos
1. Añade el mueble o la sala al final de su lista en `shared/game-data/habitats.json`.
2. Si es una sala nueva, revisa los sitios donde se enumeran salas o etapas:
   ```bash
   grep -rnE "\b(sala|jardin|santuario|citafinal)\b" --include=*.ts --include=*.svelte --include=*.kt backend/src desktop/src mobile | grep -v spec
   ```
   Por ejemplo, el tema CSS por sala en `desktop/src/components/HabitatTab.svelte` (hasta que exista `theme` en los datos).

## Arte
3. Dibuja `scripts/sprites/furniture.ts` con las orientaciones `a` y `b` (`iso-furniture-brief.md`). Genera la hoja de contactos, léela e itera.
4. Genera los SVG en `shared/assets/furniture/<id>_{a,b}.svg`.
5. Sustituye la entrada de emoji en `FURN_ICON` (`HabitatTab.svelte`), si sigue existiendo.

## Validación
6. `node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs`
7. `node scripts/validate-game-data.js`
8. Desde `backend/`: `npx jest src/modules/habitat src/modules/game-data`
9. `git diff --stat`: solo cambian los datos y el arte de este mueble o sala.

## Después
10. Los muebles se leen del game-data (con hot-reload), así que no hace falta seed. Si hay migración de Prisma pendiente (rotación o huellas), recuérdalo.
