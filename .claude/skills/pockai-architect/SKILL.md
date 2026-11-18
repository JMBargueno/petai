---
name: pockai-architect
description: Diseña, dibuja e integra especies de Pockai (criaturas/mascotas de PetAI). Cubre la ficha narrativa en docs/pockais/<id>.md, la entrada válida en shared/game-data/species.json (stats, personalityBias de 5 dimensiones, paleta, comida), las skills del elemento si es nuevo, el arte real en pixel art 3/4 (un boceto procedural por etapa que una IA de imagen, Nano Banana, redibuja a partir de una hoja objetivo y el repo importa a 64 px) revisado con una hoja de contactos, las anclas de accesorios, los registros de clientes y la validación final. Úsala cuando el usuario pida "un nuevo pockai", "crear/diseñar una especie", "añadir una criatura", "inventar un pockai de tipo X", y también para "redibujar/rediseñar el arte o el sprite de <especie>", "cómo se ve <especie> de baby/adulto" o "evoluciones visuales". Para muebles o salas del hábitat usa pockai-habitat-architect; para prendas y accesorios, pockai-accessory-architect; para efectos del escritorio (portales, apariciones, transiciones), pockai-effect-architect.
---

# Pockai Architect

Eres diseñadora/or senior de criaturas para **PetAI**: mascotas tiernas con IA, no monstruos de RPG. Cada Pockai es un "eco" de la red que nace de un huevo (ver `docs/LORE.md`). Tu trabajo es diseñar una especie coherente con su elemento y rareza, balanceada y **dibujada** en el pixel art del juego, y dejarla **integrada y validada** en el repo.

Lee las referencias cuando las necesites:
- `references/schema.md`: campos de species.json, catálogos relacionados, tabla de tipos y límites del motor.
- `references/personality.md`: las 5 dimensiones (curiosidad, sociabilidad, valentía, afectividad y temperamento), sus keywords por rango y cómo diseñar el `personalityBias`.
- `references/balance.md`: totales de stats por rareza, arquetipos, plantilla de skills de elemento nuevo y avisos de eclosión.
- `references/sheet-template.md`: plantilla de la ficha `docs/pockais/<id>.md`.
- `references/art-brief.md`: cómo se dibuja una especie en pixel art (`PixelSpecies`), brief de arte, proceso y checklist visual.
- `references/iso-style.md`: reglas 3/4 isométricas (cámara, luz, cara, etapas y errores típicos).
- `references/pixel-style.md`: estilo pixel art, evolución por etapas (plan corporal propio y regla de los cuatro ejes) y anclas de accesorios.
- `references/target-sheet-pipeline.md`: **el flujo del arte final**: generar cada etapa con Nano Banana a partir del boceto y de la hoja objetivo, importarla a 64 px, clasificar el color y validar. Léela antes de dibujar.
- `references/design-lessons.md`: lecciones sacadas de comparar el generador con las ocho hojas objetivo de `references/examples/` (raras, legendarias y míticas), y lo que el generador aún no hace. **Léela antes de dibujar cualquier especie.**
- `references/concept-prompt.md`: cómo preparar un pase de concepto con una IA de imagen y qué hacer con el resultado. Los prompts reales del usuario están en `references/examples/prompts.md`.
- `references/integration-checklist.md`: todos los archivos que hay que tocar, en orden.

## Modos
- **Especie nueva** (lo normal): sigue todo el flujo.
- **Solo arte** ("redibuja X", "arte por etapas de X"): lee la ficha y la entrada de la especie, salta a los pasos 5b y 6, y actualiza la sección de arte y evolución de la ficha. No toques stats ni personalidad.

## Flujo

### 1. Leer el estado actual (siempre)
Lee estos archivos y las secciones 2 y 4 de `docs/LORE.md`:
- `shared/game-data/species.json`, `skills.json`, `foods.json` y `genes.json`.
- `shared/assets/palettes.json`.

Haz un mini-inventario: especies por elemento y por rareza, el plan corporal de cada una (tabla de `pixel-style.md`), el `personalityBias` de cada una y cuáles tienen `PixelSpecies` en `scripts/sprites/pixel/species.ts`. Sirve para detectar huecos (de catálogo y de carácter) y no duplicar conceptos.

Si necesitas entender cómo se usa la personalidad, lee también `balance.json → personality` (bandas y keywords) y `docs/specs/spec-36-cerebro-pockai.md`. `node .claude/skills/pockai-architect/scripts/check_species.mjs` da el inventario y los avisos actuales.

### 2. Completar la petición
El usuario puede dar una idea libre, como "un búho eléctrico, raro". Pregunta **solo** lo que falte, en **una sola tanda** (con la herramienta de preguntas si está disponible) y con una opción recomendada en cada pregunta:
- Elemento y rareza.
- Arquetipo de combate.
- Carácter de partida (propónlo tú desde el concepto).
- **Rasgo que crece con la evolución**: qué distingue a su forma final y qué pieza nueva gana.
- Si quiere **arte real ya** (recomendado) o placeholders.

Si no da nada, propón 2-3 conceptos que cubran huecos del catálogo (elementos o rarezas sin especies) y explica el aviso de eclosión si aplica (ver balance.md).

### 3. Diseñar (reglas)
1. **La forma sigue a la función, en clave mascota.** Cada rasgo (cola, cresta, branquias, antenas) responde a su elemento o Flujo del Éter y a su forma de vivir. Tierno, legible y nada gore.
2. **Silueta reconocible a 64 px** (tamaño en sala) en 3/4, con al menos 2 rasgos icónicos que anticipen su estilo de combate y que se lean también con espejo.
   **Cada especie, un cuerpo distinto.** Elige primero su plan corporal (`pixel-style.md`: bípedo, alado, tentacular, cuadrúpedo, flotante, columna u otro nuevo) y no repitas el de otra especie del mismo elemento ni de la misma rareza. Frente a cualquier otra especie debe cambiar en al menos cuatro de: apoyo, proporción, cabeza, extremidades, rasgo icónico, contorno y cara (forma, tamaño y sitio de los ojos). Un bípedo redondo con otro adorno no es una especie nueva. **La anatomía tiene que tener sentido** para el animal que es: una ballena no tiene pies, un pulpo no tiene brazos.
   **Cuanto más rara, más trabajada.** La rareza se tiene que ver en el dibujo: un legendario impone por proporción y piezas compuestas, y un mítico usa la técnica de míticos (cuerpo en curva lisa, segunda lectura de color, piezas a lo largo del cuerpo, brillos en color literal) y llena el frame en su etapa final. Ver la tabla de `pixel-style.md`.
3. **Coherencia elemento → paleta → comida.** La paleta es `palettes.json[element].default` o una variación cercana (mismo tono, ±luminosidad). La comida favorita tiene sentido con el elemento y la descripción.
4. **Stats según `balance.md`**: total exacto por rareza, perfil de arquetipo y distinto de las especies del mismo elemento.
5. **Personalidad de partida (`personalityBias`).** Las 5 dimensiones con las reglas de `references/personality.md`: enteros en [15, 85], al menos un rasgo marcado, coherente con la descripción y el concepto, y distinta de las demás especies. Es solo el punto de partida: piensa también cómo puede evolucionar con distintas crianzas y qué hará en su vida autónoma (va en la ficha).
6. **Evolución visual: evolucionar es cambiar.** Cada etapa tiene su propio plan corporal (`pixel-style.md`): baby es una bola sin brazos ni cola con el rasgo en brote; juvenile, un cuerpo con brazos, cola y barriga; adult separa cabeza y torso, completa el rasgo y gana manchas; final suma piezas que rompen el contorno (segunda cola, púas, alas), su accesorio de elemento, franjas y una mirada más decidida. En cada salto cambian al menos cuatro de cinco ejes: plan corporal, rasgo icónico, piezas, color y marcas, cara. Se mantienen la paleta, el sitio de los ojos y el sitio del rasgo icónico, para que las 4 etapas sigan siendo la misma especie. **La forma dice la edad:** la cría es redonda y de ojo grande; cada etapa cambia curvas por puntas y estrena dos o tres piezas con nombre; en la final el ojo es más pequeño y duro, y aparece un material o un color oscuro que no había (`design-lessons.md`). Escribe la evolución como una lista de estrenos, una frase por etapa. Cada etapa es una geometría propia en el `PixelSpecies` (`art-brief.md`).
7. **Sitio para accesorios.** La especie debe poder llevar gorro, gafas, bufanda y capa en las 4 etapas sin tapar ojos, boca ni rasgo icónico. Define sus anclas `head`, `face`, `neck` y `back` por etapa en la ficha (`pixel-style.md`).
8. **`description` = semilla del chat.** Se inyecta en el prompt de personalidad (`backend/src/modules/ai/personality.ts`). Son 1–2 frases en español, en tono cálido, con un rasgo físico y uno de carácter, sin stats ni jerga de juego.
9. **Nombres:** `name` en español, evocador, con juego de palabras animal + elemento (Ignisaurio, Axolunar, Florabrote). `id` en minúsculas y sin espacios (`^[a-z][a-z0-9_]*$`), único; `spriteKey` = `id`.
10. **Solo mecánicas existentes.** No inventes:
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
El arte se hace en dos tiempos. Primero el **boceto** procedural, que fija las poses y sirve de disposición; después el **arte final**, que dibuja Nano Banana y el repo importa.

**Boceto.** Sigue la sección "Dibujar" de `references/art-brief.md`:
0. Abre el par de `references/examples/` de su rareza que más se le parezca (`<id>-generador.png` y `<id>-objetivo.*`) y repasa `design-lessons.md`: el objetivo es el nivel que se espera, en todas las rarezas.
1. Escribe el `PixelSpecies` con sus cuatro geometrías, con las diferencias por etapa de `pixel-style.md`. Empieza por la etapa final.
2. Genera la hoja de contactos con `contact_sheet.ts <id>` y **mírala** leyendo el PNG.
3. Pasa la checklist y corrige hasta que todo pase. Normalmente hacen falta 2-3 iteraciones; no te quedes en la primera.
3b. Si es rara o superior y la hoja pasa pero se queda corta, ofrece al usuario un pase de concepto (`concept-prompt.md`): le das el prompt, lo ejecuta con la hoja adjunta y tú incorporas lo que estrena cada etapa.
4. Ejecuta `pnpm generate:sprites` (hojas, anclas de accesorio y vistas previas).

**Arte final.** Sigue `references/target-sheet-pipeline.md`:
1. Comprueba que hay clave de la API (`node scripts/sprites/concept/generate.mjs --list`). Si no, pide al usuario que cree `.env.local`; nunca la escribas tú. Confirma con él antes de la primera llamada: cada imagen se cobra.
2. La especie necesita una **hoja objetivo** con su diseño (`references/examples/<id>-objetivo.*`). Si no la tiene, genera una con `concept-prompt.md` y espera a que el usuario la apruebe.
3. Empieza por la **etapa final**: genérala con `stage.mjs`, mírala, impórtala y enséñasela al usuario. Con su visto bueno, haz las otras tres.
4. `roles.mjs` y `set-palette.mjs`, hoja de contactos real, `pnpm generate:sprites` y `pnpm validate:all`.
5. Si una etapa sale con ruido, con caras que no se leen o con otro diseño, regenera solo esa etapa.

No des por terminada una especie con el boceto: el boceto no tiene la calidad que pide el usuario.

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
