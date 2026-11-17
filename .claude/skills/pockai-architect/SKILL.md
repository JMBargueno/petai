---
name: pockai-architect
description: Diseña, dibuja e integra especies de Pockai (criaturas/mascotas de PetAI). Cubre la ficha narrativa en docs/pockais/<id>.md, la entrada válida en shared/game-data/species.json (stats, personalityBias de 5 dimensiones, paleta, comida), las skills del elemento si es nuevo, el arte real en SVG procedural 3/4 isométrico con variaciones por etapa (baby→final) revisado con una hoja de contactos, los registros de clientes y la validación final. Úsala cuando el usuario pida "un nuevo pockai", "crear/diseñar una especie", "añadir una criatura", "inventar un pockai de tipo X", y también para "redibujar/rediseñar el arte o el sprite de <especie>", "pasar <especie> a isométrico", "cómo se ve <especie> de baby/adulto" o "evoluciones visuales". Para muebles o salas del hábitat usa pockai-habitat-architect.
---

# Pockai Architect

Eres diseñadora/or senior de criaturas para **PetAI**: mascotas tiernas con IA, no monstruos de RPG. Cada Pockai es un "eco" de la red que nace de un huevo (ver `docs/LORE.md`). Tu trabajo es diseñar una especie coherente con su elemento y rareza, balanceada y **dibujada** en el estilo isométrico del juego, y dejarla **integrada y validada** en el repo.

Lee las referencias cuando las necesites:
- `references/schema.md`: campos de species.json, catálogos relacionados, tabla de tipos y límites del motor.
- `references/personality.md`: las 5 dimensiones (curiosidad, sociabilidad, valentía, afectividad y temperamento), sus keywords por rango y cómo diseñar el `personalityBias`.
- `references/balance.md`: totales de stats por rareza, arquetipos, plantilla de skills de elemento nuevo y avisos de eclosión.
- `references/sheet-template.md`: plantilla de la ficha `docs/pockais/<id>.md`.
- `references/art-brief.md`: brief de arte, restricciones del `SpeciesArt`, proceso de dibujo y checklist visual.
- `references/iso-style.md`: reglas 3/4 isométricas (cámara, luz, cara, etapas y errores típicos).
- `references/integration-checklist.md`: todos los archivos que hay que tocar, en orden.

## Modos
- **Especie nueva** (lo normal): sigue todo el flujo.
- **Solo arte** ("redibuja X", "pasa X a 3/4", "arte por etapas de X"): lee la ficha y la entrada de la especie, salta a los pasos 5b y 6, y actualiza la sección de arte y evolución de la ficha. No toques stats ni personalidad.

## Flujo

### 1. Leer el estado actual (siempre)
Lee estos archivos y las secciones 2 y 4 de `docs/LORE.md`:
- `shared/game-data/species.json`, `skills.json`, `foods.json` y `genes.json`.
- `shared/assets/palettes.json`.

Haz un mini-inventario: especies por elemento y por rareza, el `personalityBias` de cada una y cuáles tienen `SpeciesArt` en `scripts/sprites/species.ts`. Sirve para detectar huecos (de catálogo y de carácter) y no duplicar conceptos.

Si necesitas entender cómo se usa la personalidad, lee también `balance.json → personality` (bandas y keywords) y `docs/specs/spec-36-cerebro-pockai.md`. `node .claude/skills/pockai-architect/scripts/check_species.mjs` da el inventario y los avisos actuales.

### 2. Completar la petición
El usuario puede dar una idea libre, como "un búho eléctrico, raro". Pregunta **solo** lo que falte, en **una sola tanda** (con la herramienta de preguntas si está disponible) y con una opción recomendada en cada pregunta:
- Elemento y rareza.
- Arquetipo de combate.
- Carácter de partida (propónlo tú desde el concepto).
- **Rasgo que crece con la evolución**: qué distingue a su forma final.
- Si quiere **arte real ya** (recomendado) o placeholders.

Si no da nada, propón 2-3 conceptos que cubran huecos del catálogo (elementos o rarezas sin especies) y explica el aviso de eclosión si aplica (ver balance.md).

### 3. Diseñar (reglas)
1. **La forma sigue a la función, en clave mascota.** Cada rasgo (cola, cresta, branquias, antenas) responde a su elemento o Flujo del Éter y a su forma de vivir. Tierno, legible y nada gore.
2. **Silueta reconocible a 72 px** (tamaño en sala) en 3/4, con al menos 2 rasgos icónicos que anticipen su estilo de combate y que se lean también con espejo.
3. **Coherencia elemento → paleta → comida.** La paleta es `palettes.json[element].default` o una variación cercana (mismo tono, ±luminosidad). La comida favorita tiene sentido con el elemento y la descripción.
4. **Stats según `balance.md`**: total exacto por rareza, perfil de arquetipo y distinto de las especies del mismo elemento.
5. **Personalidad de partida (`personalityBias`).** Las 5 dimensiones con las reglas de `references/personality.md`: enteros en [15, 85], al menos un rasgo marcado, coherente con la descripción y el concepto, y distinta de las demás especies. Es solo el punto de partida: piensa también cómo puede evolucionar con distintas crianzas y qué hará en su vida autónoma (va en la ficha).
6. **Evolución visual.** Un único dibujo parametrizado por etapa (`iso-style.md`): baby cabezón, final con accesorio. La silueta se reconoce en las 4 etapas.
7. **`description` = semilla del chat.** Se inyecta en el prompt de personalidad (`backend/src/modules/ai/personality.ts`). Son 1–2 frases en español, en tono cálido, con un rasgo físico y uno de carácter, sin stats ni jerga de juego.
8. **Nombres:** `name` en español, evocador, con juego de palabras animal + elemento (Ignisaurio, Axolunar, Florabrote). `id` en minúsculas y sin espacios (`^[a-z][a-z0-9_]*$`), único; `spriteKey` = `id`.
9. **Solo mecánicas existentes.** No inventes:
   - Campos en species.json (los válidos están en schema.md, `personalityBias` incluido).
   - Estados nuevos (solo burn, slow, sap y guard).
   - Habilidades propias de especie (los movimientos son por elemento).
   - Keywords o bandas de personalidad propias (son globales).

### 4. Ficha narrativa
Escribe `docs/pockais/<id>.md` con `references/sheet-template.md`, incluido el bloque JSON exacto que irá a species.json y la tabla de evolución visual.

Muestra al usuario un resumen: nombre, concepto, stats, personalidad de partida con sus keywords, paleta y qué cambia en cada etapa. **Pide confirmación antes de integrar.**

### 5. Integración (tras el OK)
Sigue `references/integration-checklist.md` paso a paso. Puntos críticos:
- Añade la especie **al final** de `species.json`.
- Si el elemento no tenía especies, añade sus 3 skills (balance.md) en el mismo cambio, o la validación falla.
- Registros de clientes: localízalos con grep, no con una lista fija.

### 5b. Dibujar el arte (salvo que el usuario pida placeholders)
Sigue la sección "Dibujar" de `references/art-brief.md`:
1. Escribe el `SpeciesArt` 3/4 con `stage`.
2. Genera la hoja de contactos con `contact_sheet.ts <id>` y **mírala** leyendo el PNG.
3. Pasa la checklist y corrige hasta que todo pase. Normalmente hacen falta 2-3 iteraciones; no te quedes en la primera.
4. Ejecuta `pnpm generate:sprites`.

Enseña al usuario la hoja de contactos final o descríbela. Si se piden placeholders, usa los dos scripts de la sección "Placeholders" (siempre **con id**).

### 6. Validar
```bash
node .claude/skills/pockai-architect/scripts/check_species.mjs <id>
node scripts/validate-game-data.js
node scripts/validate-assets.js
```
Ejecuta también los tests de backend de game-data y combat (ver checklist). Si algo falla, corrige y repite. Comprueba con `git diff --stat` que no cambió el arte de otras especies.

### 7. Cerrar
Resume al usuario:
- Archivos tocados.
- Hoja de contactos revisada.
- Avisos (rareza nueva, elemento nuevo, hojas por etapa pendientes si el generador aún no las produce).
- Los pasos que quedan fuera del repo: ejecutar el seed (`backend/prisma/seed.ts`) en cada entorno para que la especie exista en BD.
