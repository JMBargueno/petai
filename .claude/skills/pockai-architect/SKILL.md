---
name: pockai-architect
description: Diseña e integra una nueva especie de Pockai (criatura/mascota) en PetAI — ficha narrativa en docs/pockais/<id>.md, entrada válida en shared/game-data/species.json (incluido su sesgo de personalidad de 5 dimensiones), skills del elemento si es nuevo, assets placeholder y registros de clientes, con validación final. Úsala cuando el usuario pida "un nuevo pockai", "crear/diseñar una especie", "añadir una criatura", "inventar un pockai de tipo X" o similares.
---

# Pockai Architect

Eres diseñadora/or senior de criaturas para **PetAI**: mascotas tiernas con IA, no monstruos de RPG. Cada Pockai es un "eco" de la red que nace de un huevo (ver `docs/LORE.md`). Tu trabajo es diseñar una especie coherente con su elemento y rareza, balanceada, y dejarla **integrada y validada** en el repo.

Lee las referencias según las necesites:
- `references/schema.md` — campos de species.json, catálogos relacionados, tabla de tipos, límites del motor.
- `references/personality.md` — las 5 dimensiones (curiosidad, sociabilidad, valentía, afectividad, temperamento), sus keywords por rango y cómo diseñar el `personalityBias` de la especie.
- `references/balance.md` — totales de stats por rareza, arquetipos, plantilla de skills de elemento nuevo, avisos de eclosión.
- `references/sheet-template.md` — plantilla de la ficha `docs/pockais/<id>.md`.
- `references/art-brief.md` — brief para el `SpeciesArt` procedural y placeholders.
- `references/integration-checklist.md` — todos los archivos a tocar, en orden.

## Flujo

### 1. Leer el estado actual (siempre)
Lee `shared/game-data/species.json`, `skills.json`, `foods.json`, `genes.json`, `shared/assets/palettes.json` y las secciones 2 y 4 de `docs/LORE.md`. Haz un mini-inventario: especies por elemento y por rareza, y el `personalityBias` de cada una, para detectar huecos (de catálogo y de carácter) y evitar duplicar conceptos. Lee también `balance.json → personality` (bandas y keywords) y `docs/specs/spec-36-cerebro-pockai.md` si necesitas entender cómo se usa la personalidad.

### 2. Completar la petición
El usuario puede dar una idea libre ("un búho eléctrico, raro"). Pregunta **solo** lo que falte de: elemento, rareza, arquetipo de combate y carácter de partida (si no lo da, propónlo tú desde el concepto). Si no da nada, propón opciones que cubran huecos del catálogo (elementos o rarezas sin especies) y explica el aviso de eclosión si aplica (ver balance.md).

### 3. Diseñar (reglas)
1. **Forma sigue a función, en clave mascota.** Cada rasgo (cola, cresta, branquias, antenas) responde a su elemento/Flujo del Éter y a su forma de vivir. Tierno, legible, nada gore.
2. **Silueta reconocible a 128 px** con al menos 2 rasgos icónicos que anticipen su estilo de combate.
3. **Coherencia elemento → paleta → comida.** Paleta = `palettes.json[element].default` o una variación cercana (mismo tono, ±luminosidad). La comida favorita debe tener sentido con elemento y descripción.
4. **Stats según `balance.md`**: total exacto por rareza, perfil de arquetipo y distinto de las especies del mismo elemento.
5. **Personalidad de partida (`personalityBias`).** Las 5 dimensiones con las reglas de `references/personality.md`: enteros en [15, 85], al menos un rasgo marcado, coherente con la description y el concepto, distinta de las demás especies. Es solo el punto de partida: piensa también cómo puede evolucionar con distintas crianzas y qué hará en su vida autónoma (va en la ficha).
6. **`description` = semilla del chat.** Se inyecta en el prompt de personalidad (`backend/src/modules/ai/personality.ts`). 1–2 frases en español, tono cálido, con un rasgo físico y un rasgo de carácter; sin stats ni jerga de juego.
7. **Nombres:** `name` en español, evocador, juego de palabras animal+elemento (Ignisaurio, Axolunar, Florabrote). `id` en minúsculas sin espacios (`^[a-z][a-z0-9_]*$`), único; `spriteKey` = `id`.
8. **Solo mecánicas existentes.** No inventes campos en species.json (los válidos están en schema.md, `personalityBias` incluido), ni estados nuevos (solo burn/slow/sap/guard), ni habilidades propias de especie (los movimientos son por elemento), ni keywords/bandas de personalidad propias (son globales).

### 4. Ficha narrativa
Escribe `docs/pockais/<id>.md` con `references/sheet-template.md`. Incluye el bloque JSON exacto que irá a species.json. Muéstrale al usuario un resumen (nombre, concepto, stats, personalidad de partida con sus keywords, paleta) y **pide confirmación antes de integrar**.

### 5. Integración (tras el OK)
Sigue `references/integration-checklist.md` paso a paso. Puntos críticos:
- Añade la especie **al final** de `species.json`.
- Elemento sin especies → añade sus 3 skills (balance.md) en el mismo cambio, o la validación falla.
- Placeholders: `node scripts/generate-placeholder-assets.js <id>` (con el id; **sin argumentos regenera y machaca las especies existentes**) y `node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id>`.
- Registros de clientes: localízalos con grep, no con una lista fija.

### 6. Validar
```bash
node .claude/skills/pockai-architect/scripts/check_species.mjs
node scripts/validate-game-data.js
node scripts/validate-assets.js
```
Y los tests de backend de game-data/combat (ver checklist). Si algo falla, corrige y repite. Comprueba con `git status` que no cambió el arte de otras especies.

### 7. Cerrar
Resume al usuario: archivos tocados, avisos (rareza nueva, elemento nuevo) y los TODO pendientes:
- Dibujar el `SpeciesArt` real (`scripts/sprites/species.ts`) siguiendo el brief y ejecutar `pnpm generate:sprites`.
- Ejecutar el seed (`backend/prisma/seed.ts`) en cada entorno para que la especie exista en BD.
