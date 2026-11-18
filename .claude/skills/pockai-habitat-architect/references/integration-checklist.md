# Checklist de integración (muebles y salas)

Las rutas son relativas a la raíz del repo.

## Datos
1. Añade el mueble o la sala al final de su lista en `shared/game-data/habitats.json`.
2. Si es una sala nueva, revisa los sitios donde se enumeran salas o etapas:
   ```bash
   grep -rnE "\b(sala|jardin|santuario|citafinal)\b" --include=*.ts --include=*.svelte --include=*.kt backend/src desktop/src mobile | grep -v spec
   ```
   Los colores de la sala van en su `theme` (habitats.json); añade también la sala a `shared/scene/src/embed/demoRoom.ts` para probarla.

## Arte
3. Añade el mueble a `FURNITURE_ART` en `scripts/sprites/furniture.ts` (`iso-furniture-brief.md`). `pnpm generate:furniture --preview`, lee la hoja de contactos e itera.
4. `pnpm generate:furniture` → `shared/assets/furniture/<id>_{a,b}.svg` + `furniture.json` (ancla). Los clientes lo cogen solos (`furnitureUrl` de `@pockai/scene`).
   - **Mueble que da luz** (lámpara, farol, vela, cristal): añádelo a `FURNITURE_LIGHTS` en `shared/scene/src/room/roomLife.ts` con `dy` (px desde el ancla hasta el punto que brilla), radio y color. Se enciende solo al anochecer.
   - **Sala nueva:** en su estilo de `roomStyles.ts` declara `glows` (luces de la carcasa), `panes` (cristales, para gotas y escarcha), `snow` si tiene parte a la intemperie y `life` (partículas). Y su fondo del modo híbrido: `node scripts/art/habitat-backdrops/generate.mjs <sala>` (1 llamada de pago; pide permiso), luego `node scripts/art/habitat-backdrops/import.mjs sprite-previews/habitat-backdrops/<sala>.jpg shared/assets/habitat-backdrops/<sala>.webp` y revisa `<sala>.preview.png` (día y noche). Reinicia el servidor de la demo para que Vite vea el archivo nuevo.

## Validación
5. `node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs`
6. `node scripts/validate-game-data.js`
7. Desde `backend/`: `npx jest src/modules/habitat src/modules/game-data`; desde `shared/scene`: `pnpm test`.
8. `git diff --stat`: solo cambian los datos y el arte de este mueble o sala.

## Después
9. Los muebles se leen del game-data (con hot-reload), así que no hace falta seed. Si hay migración de Prisma pendiente (rotación o huellas), recuérdalo.
