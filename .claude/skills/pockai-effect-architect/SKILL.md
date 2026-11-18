---
name: pockai-effect-architect
description: Diseña, dibuja y cablea efectos especiales del escritorio de PetAI con sentido de lore, como portales, puertas, apariciones, desapariciones, transiciones o destellos que acompañan a la mascota cuando hace algo (irse de visita, volver, entrar en su hábitat, evolucionar, ser invocada, recibir a un amigo). Cubre el motor de efectos procedurales en pixel art (desktop/src/lib/effects), la rampa de color por Flujo del Éter, la sincronía con la mascota en PetView, el movimiento reducido, la hoja de frames para revisarlo a simple vista y, si hace falta, un concepto previo con Nano Banana. Úsala cuando el usuario pida "un efecto", "una animación de entrada o salida", "que aparezca una puerta/portal", "que el pockai desaparezca o aparezca con estilo", "un efecto para cuando evoluciona/se va/vuelve" o "más vistosidad en el escritorio". Para criaturas usa pockai-architect; para muebles y salas, pockai-habitat-architect; para prendas, pockai-accessory-architect.
---

# Pockai Effect Architect

Diseñas lo que **pasa alrededor** de la mascota cuando hace algo importante en el escritorio. Un efecto no es decoración suelta: cuenta un momento del lore y ata la acción a un sitio del mundo (el Nexo, el Telar, el Santuario, el Éter). Cada efecto debe:
- explicarse con una frase de lore (`docs/LORE.md`);
- leerse a 64 px nativos ×2 sobre **cualquier** fondo de escritorio, claro u oscuro;
- teñirse con el Flujo del Éter del Pockai, sin assets por especie;
- llevar a la mascota de la mano: nunca aparece ni desaparece de golpe;
- no bloquear nunca los clics del escritorio;
- tener una versión quieta para `prefers-reduced-motion`.

Lee las referencias cuando las necesites:
- `references/effect-engine.md`: API de `desktop/src/lib/effects` (EffectDef, fases, `hold`, EffectPlayer, EffectLayer) y cómo se sincroniza con PetView.
- `references/lore-effects.md`: qué lugar del lore encaja con cada evento, los Seis Flujos y sus rampas, y la lista de efectos hechos y pendientes.
- `references/pixel-fx-style.md`: reglas visuales (rejilla, contorno, colores, cadencia, duración) y la checklist de la hoja de frames.
- `references/nano-banana-effects.md`: cuándo y cómo pedir un concepto a Nano Banana, el coste y la confirmación.
- `references/integration-checklist.md`: archivos que hay que tocar y validación.
- `references/effect-prompt.txt`: plantilla del prompt de concepto.

Manda la norma de `docs/GUIA_ARTISTICA.md` (§3.6 color por elemento, §7 pixel art) y el lore de `docs/LORE.md`. Si chocan con esta skill, mandan ellos.

**Estado del sistema:** el motor y siete efectos existen:
- `portal-nexo`: el Pockai se va de visita y vuelve, y los amigos llegan a tu hábitat y se van, en su propio Flujo.
- `capullo-telar`: evolución.
- `resonancia`: subida de nivel.
- `hebra-invocacion`: invocación rápida.
- `revelacion-densidad`: nacimiento, con la Promesa del Telar y el Rayo Cósmico según los datos.
- `altar-santuario`: entrar en casa y salir de ella.
- `descarga-calida`: bienvenida tras una ausencia.
- `sello-logro`, `proyeccion-astral`, `trenza-juramento`, `chispa-despertar`, `paquete-hebra`: logro, arena, clan, despertar y regalos.
- Menores y de ambiente: `manitas-espirituales`, `glitch-animo`, `polvo-estatico`, `desfragmentacion`, `polvo-impacto`, `estela-flujo`, `destello-prisma` y `clima` (ver «Canales» en `effect-engine.md`).

Hay dos patrones de referencia:
- **Viaje con estado de juego:** `visitTravel.ts` + `departThroughPortal` en PetView.
- **Efecto de momento:** `effect` en `eventMap.ts` + `startMoment` en PetView.

En `lore-effects.md` está la lista priorizada de lo pendiente.

## Flujo

### 1. Leer el estado actual
```bash
node .claude/skills/pockai-effect-architect/scripts/check_effects.mjs
```
Lista los efectos registrados, su lore, fases, duración y si tienen test y variante reducida, y avisa de lo que falte. Lee también el efecto de referencia (`desktop/src/lib/effects/portalNexo.ts`) antes de escribir uno nuevo.

### 2. Completar la petición
Pregunta en **una sola tanda** y solo lo que falte, con una opción recomendada en cada pregunta:
- **Disparador:** qué evento lo lanza (store, evento de socket, acción del usuario) y dónde está ese código.
- **Lore:** qué lugar o fenómeno representa. Propón 2 o 3 ideas sacadas de `lore-effects.md` y recomienda una.
- **Sincronía con la mascota:** entra, sale, se transforma o solo reacciona. Y qué hace mientras: anda, salta, encoge…
- **Alcance:** solo el efecto, o también el estado que lo hace necesario. Ejemplo: para el portal hubo que crear el estado «fuera de casa».

Si falta el estado de juego que da sentido al efecto (la mascota no se va de verdad, no hay evento…), dilo y propón construirlo. Un efecto sin consecuencia es un adorno.

### 3. Diseñar (reglas)
1. **Lore primero.** Una frase: «X porque en el lore Y». Si no hay frase, no hay efecto.
2. **Una forma reconocible** más un detalle que la haga suya: la clave en rombo y la hebra al Nexo del portal. Ambición en el detalle, no en el ruido.
3. **Rejilla nativa** de como mucho 64×80, ×2 entero, sin suavizado. El anclaje va en los pies, a la altura de los de la mascota.
4. **Color:** la rampa del Flujo (`flowPalette(element)`), con 5 tonos más los 2 del vacío. Contorno siempre `outline`. **Como mucho 12 colores por frame.**
5. **Fases con nombre:** aparecer, abrir/actuar, `hold` (lo que tarde la mascota), cerrar y desvanecer. Como mucho **2,5 s** sin contar el `hold`.
6. **12 fps.** El tiempo se cuantiza: se mueve como un sprite, no como un tween.
7. **La mascota nunca se teletransporta.** Si cambia de sitio, anda; si desaparece, lo hace dentro del efecto.
8. **Sin clics bloqueados:** el canvas va con `pointer-events: none` y la mascota oculta con `visibility: hidden`, que el click-through ignora.
9. **Movimiento reducido:** el mismo dibujo quieto, con un fundido de opacidad y fases cortas (`reducedPhases`).
10. **Determinista:** nada de `Math.random` en el dibujo; usa `hash(x, y, seed)` con la semilla del Pockai.

### 4. Concepto (opcional)
Si la forma no está clara o el usuario quiere ver opciones, pide una lámina de concepto a Nano Banana (`nano-banana-effects.md`). **Confirma antes de la primera llamada de pago de la sesión.** El concepto orienta el dibujo procedural; no se importa al juego salvo que el efecto sea figurativo y no se pueda proceduralizar.

### 5. Propuesta
Enseña al usuario: lore en una frase, disparador, guion por fases con la mascota (qué pasa en cada una y cuánto dura), colores y, si lo hay, el concepto. **Pide confirmación antes de integrar.**

### 6. Implementar
Sigue `integration-checklist.md`:
1. `desktop/src/lib/effects/<nombre>.ts`: un `EffectDef` con `draw` sobre un `PixelSink`. Regístralo en `effects/index.ts`.
2. Test `desktop/src/lib/effects/<nombre>.spec.ts` como `portalNexo.spec.ts`: duración, ≤12 colores en los siete Flujos, quieto con movimiento reducido y las comprobaciones propias del efecto.
3. Hoja de frames (abajo). **Mírala** y corrige hasta que pase la checklist de `pixel-fx-style.md`.
4. Cablea con `EffectPlayer` + `<EffectLayer>`, y en `hold` mueve a la mascota (patrón de `departThroughPortal` en PetView). Si hay estado nuevo, va en `desktop/src/lib/` con su spec y un presentador, como `visitTravel.ts`.

```bash
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id>             # sprite-previews/effects/<id>-contact.png
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id> --reduced   # variante quieta
```

### 7. Validar
```bash
node .claude/skills/pockai-effect-architect/scripts/check_effects.mjs <id>
cd desktop && npx vitest run src/lib/effects src/lib/visitTravel.spec.ts
```
Después, pruébalo de verdad: `preview_start` con `pockai-desktop-demo` (puerto 5175, API simulada), lanza el disparador y captura cada fase (zoom sobre la mascota). Comprueba que no hay errores de consola, que al terminar no queda nada pintado y que la mascota vuelve a recibir clics.

### 8. Cerrar
Resume al usuario:
- Lore del efecto y guion por fases.
- Archivos tocados y resultado de tests y del `check_effects`.
- La hoja de frames revisada y las capturas de la demo.
- Lo que queda sin verificar: en Tauri real (ventana transparente, click-through) solo se ha probado el navegador.
