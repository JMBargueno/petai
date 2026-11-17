# Checklist de integración

Rutas relativas a la raíz del repo. Marca cada paso en el resumen final.

## Datos de juego
1. **`shared/game-data/species.json`** — añade la entrada **al final** (los tests de combate usan la primera especie de cada elemento).
2. **`shared/game-data/foods.json`** — solo si `favoriteFood` no existe (formato en schema.md).
3. **`shared/game-data/skills.json`** — solo si el elemento no tenía especies: sus 3 skills (balance.md). Sin ellas falla "El elemento X no tiene habilidad de nivel 1".

## Elemento nuevo en clientes (solo si es la primera especie del elemento)
4. `backend/src/modules/ai/personality.ts` — mapa de nombre de elemento en español (hoy solo fire/water/plant).
5. `web/src/app/landing/content.ts` — `ELEMENT_RELATIONS` y `ELEMENT_COLORS`.
   (`desktop/src/lib/ui/maps.ts` ya cubre los 6.)
   Busca otros mapas por elemento: `grep -rnE "\b(fire|water|plant)\b\s*:" --include=*.ts --include=*.svelte --include=*.kt backend/src web/src desktop/src mobile`.

## Assets placeholder
6. `node scripts/generate-placeholder-assets.js <id>` (¡con id!).
7. `node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id>`.

## Registros de especies en clientes
8. Localiza los registros con:
   ```bash
   grep -rlE "ignisaur|axolunar|florabud" --exclude-dir=node_modules --exclude-dir=assets --exclude-dir=docs --exclude-dir=.specify --exclude="*.spec.ts" --exclude=species.json --exclude=openapi.json .
   ```
   Para cada archivo decide:
   - **Registro** (debe listar todas las especies): edítalo. Conocidos:
     - `desktop/src/lib/sprites.ts` — imports de `base.png`/`mask.png`/`anim.json` y `<id>_idle.svg?raw`, `SPECIES_REGISTRY`, `PREVIEW_SVG`.
     - `mobile/android/.../ui/habitat/HabitatScreen.kt` — `KNOWN_SPRITE_KEYS`.
     - Revisa también `desktop/src/lib/visitors.ts`, `desktop/src/components/PetMiniAvatar.svelte`, `PetView.svelte`, `mobile/android/.../data/Models.kt`, `backend/src/modules/assets/*`.
   - **Ejemplo/decorado** (landing, 404, lore, OG, fallbacks a `ignisaur`, scripts de sprites): no lo toques.
   Indica en el resumen qué clasificaste como cada cosa.

## Arte real (paso 5b de SKILL.md)
9. `scripts/sprites/species.ts`: añade el `SpeciesArt` en 3/4 con `stage` y regístralo en `SPECIES` (ver `art-brief.md` e `iso-style.md`).
9a. `npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id>`: **lee el PNG** y pasa la checklist de `art-brief.md`. Itera hasta que pase.
9b. `pnpm generate:sprites` → `shared/assets/species/<id>/` (adult), `species/<id>/{baby,juvenile,final}/` y `sprites/<id>_idle.svg`.
    Luego borra los placeholders `sprites/<id>_{eat,happy,sleep}.svg` solo si el generador ya los produce; si no, regénéralos con `placeholder_svgs.mjs <id> --force` (plantilla 3/4).

## Personalidad
9c. `personalityBias` presente con las 5 dimensiones (reglas en `personality.md`). No toques `balance.json → personality` por una especie: es global.

## Validación
10. `node .claude/skills/pockai-architect/scripts/check_species.mjs` (también comprueba `personalityBias`)
11. `node scripts/validate-game-data.js`
12. `node scripts/validate-assets.js`
13. Tests backend: desde `backend/`, `npx jest src/modules/game-data src/modules/battles src/modules/hatching src/modules/mind` (ajusta al runner de `backend/package.json`).
14. `git status` / `git diff --stat`: solo deben cambiar los archivos de la nueva especie (y `animation-specs.json`, que lista todas). **Nada en las carpetas de otras especies de `shared/assets/species/` ni en `shared/assets/patterns`**, salvo que hayas tocado a propósito código común de `scripts/sprites/` (dilo en el resumen).

## Después (recordar al usuario)
15. Seed de BD: `backend/prisma/seed.ts` (upsert de species). Sin él, eclosionar la especie falla por la FK `Pet.speciesId`.
