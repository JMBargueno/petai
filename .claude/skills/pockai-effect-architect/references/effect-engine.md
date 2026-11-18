# Motor de efectos del escritorio

Código: `shared/scene/src/effects/` y `desktop/src/components/EffectLayer.svelte`. No depende del navegador salvo `CanvasSink` y el componente: se prueba en Node (vitest, entorno `node`) y la hoja de frames se pinta con `sharp`.

## Piezas

| Archivo | Qué hace |
|---|---|
| `types.ts` | `EffectDef`, `FxPhase`, `FxFrame`, `FxPalette`, `PixelSink`. |
| `timeline.ts` | `EffectPlayer` (fases y `hold`), `fixedDuration`, `quantize`. Lógica pura. |
| `palettes.ts` | `FLOW_PALETTES` y `flowPalette(element)`: la rampa de cada Flujo del Éter. |
| `render.ts` | `GridSink` (memoria, tests y hoja), `CanvasSink` (pantalla) y `renderFrame`. |
| `index.ts` | Registro `EFFECTS`: todo efecto nuevo se añade aquí. |
| `portalNexo.ts` | Efecto de referencia. |
| `EffectLayer.svelte` | Canvas absoluto, `pointer-events: none`, anima con rAF a la cadencia del efecto. |

## EffectDef

```ts
{
  id: 'portal-nexo',
  lore: 'Una frase con la referencia a LORE.md',
  width: 44, height: 66, scale: 2,      // rejilla nativa y escala entera
  anchor: { x: 22, y: 63 },              // píxel que cae sobre el punto (x, y) que da quien lo lanza
  points: { mouth: { x: 22, y: 42 } },   // puntos con nombre para colocar a la mascota
  phases: [{ name: 'appear', ms: 560 }, …, { name: 'hold', ms: 'hold' }, …],
  reducedPhases: [...],                  // mismos nombres, cortas
  fps: 12,
  draw(sink, frame) { … },               // frame = { phase, t 0..1, time ms cuantizado, palette, seed, reduced }
  opacity?(frame) { … },                 // fundido (sobre todo con movimiento reducido)
}
```

- `draw` pinta con `sink.set(x, y, color)` en coordenadas nativas. Lo que cae fuera se ignora, así que una partícula puede salirse sin romper nada.
- `t` es el progreso de la fase; `time` sirve para lo que fluye siempre (remolinos, parpadeos). Con `reduced` ninguno de los dos debe cambiar el dibujo.
- Una fase con `ms: 0` se salta.

## EffectPlayer y la fase `hold`

```ts
const player = new EffectPlayer(phases, (phase) => {
  if (phase === 'hold') /* mueve a la mascota y, al acabar: */ player.release(performance.now());
  if (phase === 'done') /* quita el efecto y avisa al estado */;
});
player.start(performance.now());
```

- `onPhase` llega una vez por fase y en orden, aunque un frame se salte varias. Al final llega `'done'`.
- `release()` antes de llegar al `hold` hace que se pase de largo.
- Quien llama a `tick()` es `EffectLayer`, en cada frame. Si el componente no está montado, el efecto no avanza: móntalo siempre que exista el reproductor.

## Montarlo junto a la mascota (PetView)

```svelte
{#if portal}
  {#key portal.id}
    <EffectLayer def={portalNexo} player={portal.player} x={portal.x} y={portal.y}
                 palette={portalPalette} seed={portalSeed} reduced={reducedMotion} />
  {/key}
{/if}
```

- `x, y` son los píxeles de pantalla del anclaje. Para los pies de la mascota: `posX + PET_SIZE / 2`, `posY + PET_SIZE - FEET_INSET`.
- `layer="behind"` (por defecto) queda bajo la mascota (`--z-pet - 1`); `front` queda encima.
- La paleta sale de `flowPalette(pet.species.element)`, y la semilla, de un hash del id del Pockai.

## Sincronía con la mascota (patrón del portal)

PetView tiene, para el viaje:
- `travelBusy` (clase `traveling`): no pasea, no habla sola, no se arrastra, no se invoca, y el paso hasta el portal usa `transition: left 0.76s linear`.
- `petAway` (clase `away`): `visibility: hidden`. El click-through (`lib/clickthrough.ts`) ignora lo oculto. Además, `setPetOnScreen(false)` hace que los avisos salgan como notificación nativa.
- `portalAnim` (`entering`/`exiting`): keyframe `enterPortal` sobre `.pet-body`, que encoge hacia la boca, se ilumina y se funde. La salida es el mismo keyframe al revés.

Antes de mover a la mascota, déjala quieta y horizontal (`settleForTravel`): sin trepar, sin física en el aire, sin choca-esos-cinco. Para andar, pon `walkUntil = now + ms` (el controlador pinta `walk`) y cambia `posX`.

## Plataformas

Los efectos viven en `shared/scene/src/effects` (export `@pockai/scene/effects`) y son TypeScript puro:

| Plataforma | Cómo los pinta |
|---|---|
| Escritorio | `desktop/src/components/EffectLayer.svelte` (canvas DOM) desde `PetView`. |
| Escena incrustada (Android hoy, iOS cuando exista) | `effects/pixiLayer.ts`, colgados del Pockai. Llegan por el protocolo v3: `playEffect` o `petAction` (la escena aplica `effectForPetAction`). |
| Web | Solo importable por ahora (`web/src/app/shared/effects/effects.spec.ts`). |

Reglas para que un efecto funcione en todas:
- Sin DOM ni Pixi en el efecto. Solo `PixelSink`.
- Accede a `params` con corchetes (`f.params['tier']`): la web compila con `noPropertyAccessFromIndexSignature`. Lo comprueba `tsc -p tsconfig.effects.json` (`pnpm --filter @pockai/scene typecheck`).
- La fase de espera se llama `hold`: el escritorio y la escena la sueltan por su nombre (`check_effects` lo exige).
- Si el efecto acompaña a un aviso `pet:action`, va en `effects/reactions.ts` y no en el `eventMap` del escritorio, para que también salga en Android.

## Canales (PetView)

| Canal | Para qué | Cómo |
|---|---|---|
| `moment` (por defecto) | Momentos grandes: uno a la vez, el de más `priority` gana (`momentQueue.ts`). | `startMoment` / `playMoment` |
| `minor` | Pequeños y frecuentes: conviven (máx. 3), no bloquean ni tapan a la mascota. | `playMinor(id, params, at?)` (exportada: App la usa para el agente) |
| `ambient` | Bucles con `hold` que duran mientras su condición (clima). Uno por clave. | `setAmbient(key, id | null, params)`; al cambiar, el anterior cierra sus fases |

Pon `channel` en el `EffectDef`. `playMoment` desvía solo a `minor` si el efecto lo es, así que `eventMap` no necesita saber el canal.

## Efectos de momento (lo que llega con una reacción)

Para un evento que ya pasa por `eventMap` (`pet:action` del backend o acción local), no hace falta tocar App:
1. Añade `effect: { id, params }` a su reacción en `desktop/src/lib/animation/eventMap.ts`, con test en `eventMap.spec.ts`.
2. `PetView.react` llama a `playMoment`, que usa `startMoment(id, params, { at?, onHold?, onDone? })`:
   - Sin `at`, el efecto sigue los pies de la mascota (`posX/posY`); con `at`, se queda en ese punto de pantalla.
   - Sin `onHold`, la espera se suelta sola.
   - **Solo un efecto grande a la vez** (`effects/momentQueue.ts`): gana el de más `priority`. El capullo (3) corta a la resonancia (2), que llega en el mismo tick.
3. Si el efecto tapa a la mascota, usa `fxHidden` (oculta y sin clics). Si la tiene que dejar quieta, usa `fxLock`, que impide que pasee, se arrastre o se invoque. Suelta los dos en `onDone`.
4. Datos para el dibujo: `frame.params`, con lo que llegue en `params`, como `stage` o `level`.
5. `layer` y `priority` van en el propio `EffectDef`. Si las fases dependen de los datos (saltar la Promesa sin garantía), define `phasesFor(params, reduced)` y usa `phasesOf(def, params, reduced)` al crear el `EffectPlayer`. Para teñir con otro Flujo (la recién nacida), pasa `palette` a `startMoment`. `EffectLayer` acepta `scale` para pintarlo a ×1 junto a mascotas pequeñas (`VisitorPet`).

Para efectos de **otra** mascota, como los visitantes, el elemento sale de `speciesElement(speciesId)`. Lo que sale de pantalla con efecto debe seguir pintado hasta que acabe: mira `visitorsShown.ts`, que mantiene a los que se van con `leaving` hasta su `gone`.

## Estado de juego (visitTravel)

Si el efecto acompaña a un cambio de estado, ese estado vive en `lib/` y no en el componente:
- Es un store con estados de transición (`departing`, `returning`) que solo existen si hay un **presentador** (`registerTravelPresenter()` en `onMount`). Sin presentador se salta al estado final, por ejemplo cuando la mascota está en su hábitat.
- El presentador avisa con `travelArrived()` al acabar. Si se desmonta a mitad, la baja lo resuelve sola.
- Las salidas del estado (temporizador, restaurar al arrancar) se prueban con `vi.useFakeTimers()` en su spec.
