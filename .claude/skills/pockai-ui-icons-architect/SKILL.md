---
name: pockai-ui-icons-architect
description: Diseña, dibuja y mantiene el set de iconos de interfaz de PetAI (menús, pestañas, subsecciones y acciones) en SVG propio, de 24×24, con variante outline y duotone, themeable con currentColor y variables CSS. Cubre el catálogo de destinos (Mascota, Jugar, Chat, Social, Progreso, Tienda, Ajustes y sus subsecciones), la spec técnica (trazo 1.75, round, sin hex), el concepto con Nano Banana, el build desde icon-defs.mjs, el checker y el cableado con Ico (prefijo `ui:`). Úsala cuando el usuario pida "un icono nuevo para el menú", "iconos de la interfaz", "rediseñar los iconos de navegación", "el set de iconos", "un icono para la pestaña/sección X" o "iconos para iOS/Android/desktop". Para iconos de criaturas usa pockai-architect; para objetos y comida, pockai-item-architect; para insignias de logro, shared/game-data/achievements.json (Lucide).
---

# Pockai UI Icons Architect

Diseñas los iconos que el usuario toca **sin pensar**: pestañas, subsecciones, acciones y ajustes. Cada icono tiene que leerse a 16 y 20 px en claro y en oscuro, sin depender del color para entender el destino. El set es **propio** y convive con Lucide: `Ico.svelte` sigue pintando Lucide por nombre y resuelve el set propio con el prefijo `ui:`.

Lee las referencias cuando las necesites:
- `references/icon-spec.md`: la spec técnica (reglas y por qué).
- `references/catalog.md`: destinos, subsecciones y nombres del set, con su palabra de lore/función.
- `references/nano-banana-icons.md`: cuándo y cómo pedir un concepto a Nano Banana, y cómo se traduce al SVG.
- `references/icon-prompt.txt`: plantilla del prompt de concepto.

## Estado del sistema

- Fuente de verdad: `scripts/icon-defs.mjs` (formas por icono, en `base` y `acc`).
- Build: `scripts/build_icons.mjs` escribe `shared/ui/src/icons/<nombre>.outline.svg`, `<nombre>.duo.svg`, `index.ts` y `raw.d.ts`. **No edites los SVG a mano**.
- Checker: `scripts/check_icons.mjs` valida la spec sobre esos archivos.
- Cableado: `shared/ui/src/Ico.svelte` (`n="ui:pet"`, `active` para duotone). Lo usan la navegación de escritorio (`desktop/src/components/ControlPanel.svelte`, `NAV`), las subsecciones (`Segmented`) y la barra móvil (`shared/mobile/src/config.ts`, `MobileApp.svelte`).
- 37 iconos, 74 archivos.

## Flujo

### 1. Leer el estado
```bash
node .claude/skills/pockai-ui-icons-architect/scripts/check_icons.mjs
```
Confirma que la spec pasa antes de tocar nada.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada:
- **Destino:** qué pestaña, subsección o acción es. Propón el nombre del set (kebab/camel corto, en inglés, como `hatch`, `wardrobe`).
- **Significado:** qué hace el destino en una frase. Si el icono es de lore, mira `docs/LORE.md`.
- **Uso:** dónde se pinta (nav, subsección, barra móvil) y si tiene estado activo.

### 3. Diseñar (reglas)
1. **Una forma reconocible** por destino, sin detalle que se pierda a 16 px.
2. **Como mucho 12 formas** por icono. Si hace falta más, simplifica.
3. **Duotone:** el acento va en una forma cerrada que se tiñe con `var(--icon-accent, currentColor)` y `fill-opacity="0.18"`. La forma de fondo usa `var(--icon-bg, transparent)`.
4. **Sin hex, sin nombres de color, sin grupos ni transforms.** Solo `currentColor`, `none`, `transparent` o `var(--icon-…)`.
5. **Concepto (opcional):** si la forma no está clara, pide una lámina a Nano Banana (ver `nano-banana-icons.md`). **Confirma antes de la primera llamada de pago de la sesión.** El concepto orienta el dibujo; el SVG se escribe a mano.

### 4. Implementar
1. Añade la entrada en `scripts/icon-defs.mjs` (`base`, `acc`) con las formas en el viewBox 0 0 24 24.
2. Regenera:
   ```bash
   node .claude/skills/pockai-ui-icons-architect/scripts/build_icons.mjs
   node .claude/skills/pockai-ui-icons-architect/scripts/check_icons.mjs
   ```
3. Cablea: en el sitio que lo pinta, usa `<Ico n="ui:<nombre>" active={…} size={…} />`. En móvil, el icono va en `config.ts` como `icon: 'ui:<nombre>'`.
4. Actualiza `references/catalog.md` con el destino nuevo.

### 5. Verificar
- `check_icons.mjs` en verde.
- Hoja de contactos a 16 y 20 px, en claro y en oscuro. Revísala a simple vista: si un icono no se distingue de su vecino, cámbialo.
- Tests de `shared/ui` y del escritorio.

### 6. Propuesta
Enseña al usuario el destino, la forma en contorno y en duotone y dónde queda cableado. Pide confirmación antes de cambiar un icono que ya se ve en producción.

## Reglas que no se negocian
- El set es **de trazo**, no de relleno: el relleno sale solo del acento duotone.
- Nada de emoji en la UI (`docs/GUIA_ARTISTICA.md` §6).
- El nombre del icono es el del destino en el set, no el nombre de Lucide que tuviera antes.
- Si cambias un icono que ya está en producción, dilo: afecta a todas las plataformas a la vez.
