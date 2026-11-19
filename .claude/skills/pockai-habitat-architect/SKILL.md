---
name: pockai-habitat-architect
description: Diseña, dibuja e integra muebles y salas del hábitat isométrico de Pockai (PetAI). Cubre la entrada en shared/game-data/habitats.json (sala, precio, moneda, buffs dentro de buffCaps, huella W×D, montaje suelo/pared, interacción con el Pockai), el arte SVG isométrico con sus 2 orientaciones revisado con una hoja de contactos, los temas de sala y la validación. Úsala cuando el usuario pida "un mueble nuevo", "decoración para el hábitat/jardín/santuario", "una sala nueva", "rediseñar el arte de un mueble", "cambiar el tema de una sala" o "pasar los muebles a isométrico". Para criaturas usa pockai-architect; para efectos del escritorio (portales, apariciones, transiciones), pockai-effect-architect. Para minijuegos, pockai-minigame-architect.
---

# Pockai Habitat Architect

Diseñas el **hogar** de los Pockais: salas isométricas cozy (dioramas tipo casa de muñecas) y los muebles que el Custodio compra, coloca y gira. Cada mueble debe:
- verse bien en isométrico,
- tener una huella honesta,
- estar balanceado frente a los topes de buffs,
- y, si se puede, darle al Pockai algo que hacer (dormir, comer, jugar, bañarse o sentarse).

Lee las referencias cuando las necesites:
- `references/furniture-schema.md`: campos de `habitats.json` (actuales y los de la migración isométrica), huellas habituales e interacciones.
- `references/iso-furniture-brief.md`: cómo se dibuja un mueble isométrico (caja base, tres tonos, contorno, anclaje, orientaciones), la plantilla del brief y la checklist visual.
- `references/balance.md`: precios por tipo, buffs y topes.
- `references/integration-checklist.md`: archivos que hay que tocar y validación.

Las reglas visuales de referencia están en `docs/GUIA_ARTISTICA.md` §7.4.

## Flujo

### 1. Leer el estado actual
Lee:
- `shared/game-data/habitats.json`: salas, muebles y `buffCaps`.
- El esquema `habitatsSchema` de `backend/src/modules/game-data/game-data.schemas.ts`, para saber qué campos existen ya: `footprint`, `mount`, `interaction` y `theme` llegan con la migración isométrica.
- Si existe, `scripts/sprites/furniture.ts`.

Ejecuta `node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs` para tener el inventario por sala y la suma de buffs frente a los topes.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada en cada pregunta:
- **Sala:** cuál. Recomienda la que tenga menos muebles o la que encaje con el concepto.
- **Función:** decorativo, buff (cuál) o interacción con el Pockai.
- **Tamaño:** huella W×D, y si va en el suelo o en la pared.
- **Precio y moneda.** Propónlos tú según `balance.md`.

Si el usuario no da idea, propón 2-3 muebles que cubran huecos: salas con pocos muebles, interacciones que aún no tienen mueble o buffs lejos de su tope.

### 3. Diseñar (reglas)
1. **Cozy y legible a escala de sala.** Hay que reconocerlo a su tamaño real (de 16 a 64 px de alto), sin texto ni detalles de menos de 3 px.
2. **Huella honesta.** Lo que ocupa en el dibujo coincide con su `footprint`, y el Pockai (~72 px) cabe al lado de forma creíble.
3. **Coherencia con la sala.** Paleta del tema de la sala y materiales que encajen: madera y tela en la sala, piedra y plantas en el jardín, cristal y luz en el santuario.
4. **Buffs dentro de los topes.** La suma de buffs del mismo tipo de toda la sala puede pasar del tope (se recorta), pero un mueble solo nunca debe acercarse al tope. Ver `balance.md`.
5. **Interacción con sentido.** `sleep` → cama, `eat` → comedero, `bathe` → agua, `play` → juguete y `sit` → banco o cojín. Como mucho una interacción por mueble.
6. **Solo claves de buff existentes:** `hygiene_decay_reduction`, `happiness_decay_reduction`, `energy_recovery_boost` y `combat_mood_bonus`. No inventes buffs nuevos sin implementar su efecto en el backend.
7. **`id`** en snake_case, único. **`name`** en español, corto. **`description`** de 1 frase que cite el buff con su número.

### 4. Propuesta
Muestra al usuario: nombre, sala, huella y montaje, interacción, precio, buffs (y cómo quedan las sumas de la sala frente a los topes) y el brief visual. **Pide confirmación antes de integrar.**

### 5. Integrar y dibujar
Sigue `references/integration-checklist.md`:
1. Añade la entrada a `habitats.json` con `footprint`, `mount` e `interaction` (esquema en `game-data.schemas.ts`).
2. Dibuja el mueble en `scripts/sprites/furniture.ts`, con orientación `a` y `b`, según `iso-furniture-brief.md`.
3. Genera la hoja de contactos con `pnpm generate:furniture --preview` y **mírala** (Read de `sprite-previews/furniture-contact.png`). Corrige hasta que pase la checklist.
4. Genera los SVG finales y el manifiesto con `pnpm generate:furniture`. El script falla si el arte y `habitats.json` no tienen la misma huella.
5. Pruébalo en la sala: `pnpm --filter @pockai/scene dev` y abre `/?demo=room` (añádelo a la sala de ejemplo en `shared/scene/src/embed/demoRoom.ts`).

El arte se escribe en `scripts/sprites/furniture.ts` con el lápiz isométrico `Pen` (`box`, `cyl`, `flat`, `ball`, `raw`), usando las coordenadas propias del mueble (u a lo largo, v a lo ancho, z en px): la orientación `b` sale sola.

### 6. Validar
```bash
node .claude/skills/pockai-habitat-architect/scripts/check_habitats.mjs
node scripts/validate-game-data.js
```
Ejecuta también los tests del módulo de hábitat del backend (ver checklist).

### 7. Cerrar
Resume: archivos tocados, hoja de contactos revisada, sumas de buffs por sala frente a los topes y lo que queda pendiente (seed o migración, si aplica).
