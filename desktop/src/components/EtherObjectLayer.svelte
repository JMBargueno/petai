<script lang="ts">
  /**
   * Capa de los objetos del Éter (el reloj del pomodoro y los que vengan): los pinta donde estén,
   * deja arrastrarlos por la pantalla y dibuja sus efectos (grieta, hebra del Pockai, parpadeo).
   *
   * El objeto recibe clics (`.ether-object` está en el click-through); los efectos no.
   */
  import { onDestroy, onMount } from 'svelte';
  import EffectLayer from './EffectLayer.svelte';
  import {
    etherFx,
    etherObjects,
    etherPalette,
    etherReduced,
    etherSeed,
    registerEtherObject,
    setEtherPosition,
    EMERGE_MS,
    VANISH_MS,
    type EtherFx,
    type EtherObjectView,
  } from '../lib/etherObjects/store';
  import { ETHER_KINDS } from '../lib/etherObjects/kinds';
  import { POMODORO_CLOCK_ID, pomodoroClockWant } from '../lib/etherObjects/pomodoroClock';
  import { MP3_PLAYER_ID, mp3PlayerWant } from '../lib/etherObjects/mp3Player';

  const DRAG_THRESHOLD = 4;
  let drag: { id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null = null;
  /** Objetos con destello en curso (cambian al tocarlos). */
  let flashing: Record<string, boolean> = {};
  let lastFlash: Record<string, number> = {};

  $: objects = Object.values($etherObjects).filter((o) => o.look !== 'hidden');
  $: behind = $etherFx.filter((f) => (f.def.layer ?? 'behind') === 'behind');
  $: front = $etherFx.filter((f) => (f.def.layer ?? 'behind') === 'front');
  $: for (const o of Object.values($etherObjects)) watchFlash(o);

  function watchFlash(o: EtherObjectView) {
    if ((lastFlash[o.id] ?? 0) === o.flash) return;
    const first = lastFlash[o.id] === undefined;
    lastFlash[o.id] = o.flash;
    if (first && o.flash === 0) return;
    flashing = { ...flashing, [o.id]: true };
    setTimeout(() => (flashing = { ...flashing, [o.id]: false }), 340);
  }

  /** Dónde se pinta un efecto: anclado al objeto, o la hebra de la patita del Pockai al objeto. */
  function fxPos(f: EtherFx, all: Record<string, EtherObjectView>) {
    const o = all[f.objectId];
    const x = o?.x ?? 0;
    const y = o?.y ?? 0;
    if (f.def.space === 'screen' && f.from) {
      const s = f.def.scale;
      // La punta toca el borde del reloj que mira al Pockai, no su centro
      const dx = f.from.x - x;
      const dy = f.from.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const r = o ? Math.min(o.w, o.h) * 0.38 : 0;
      return {
        x: 0,
        y: 0,
        params: {
          x0: Math.round(f.from.x / s),
          y0: Math.round(f.from.y / s),
          x1: Math.round((x + (dx / d) * r) / s),
          y1: Math.round((y + (dy / d) * r) / s),
        },
      };
    }
    return { x, y, params: f.params };
  }

  function onDown(e: MouseEvent, o: EtherObjectView) {
    if (e.button !== 0) return;
    // Los controles del objeto son botones: no empiezan arrastre
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    drag = { id: o.id, dx: e.clientX - o.x, dy: e.clientY - o.y, sx: e.clientX, sy: e.clientY, moved: false };
  }

  function onMove(e: MouseEvent) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      document.body.dataset.dragging = '1';
    }
    setEtherPosition(drag.id, e.clientX - drag.dx, e.clientY - drag.dy);
  }

  function onUp(e: MouseEvent) {
    if (!drag) return;
    if (drag.moved) {
      setEtherPosition(drag.id, e.clientX - drag.dx, e.clientY - drag.dy, true);
      delete document.body.dataset.dragging;
    }
    drag = null;
  }

  /** Si cambia el tamaño de la pantalla, que ningún objeto se quede fuera. */
  function onResize() {
    for (const o of Object.values($etherObjects)) if (o.placed) setEtherPosition(o.id, o.x, o.y);
  }

  let unregister: Array<() => void> = [];
  onMount(() => {
    const k = ETHER_KINDS['pomodoro-clock'];
    unregister.push(registerEtherObject(POMODORO_CLOCK_ID, 'pomodoro-clock', { w: k.w, h: k.h }, pomodoroClockWant));
    const m = ETHER_KINDS['mp3-player'];
    unregister.push(registerEtherObject(MP3_PLAYER_ID, 'mp3-player', { w: m.w, h: m.h }, mp3PlayerWant));
  });
  onDestroy(() => {
    unregister.forEach((u) => u());
    if (drag?.moved) delete document.body.dataset.dragging;
  });
</script>

<svelte:window on:mousemove={onMove} on:mouseup={onUp} on:resize={onResize} />

<div class="ether-layer" style="--emerge-ms: {EMERGE_MS}ms; --vanish-ms: {VANISH_MS}ms">
  {#each behind as f (f.key)}
    {@const at = fxPos(f, $etherObjects)}
    <EffectLayer def={f.def} player={f.player} x={at.x} y={at.y} params={at.params} palette={$etherPalette} seed={$etherSeed} reduced={etherReduced} />
  {/each}

  {#each objects as o (o.id)}
    {@const kind = ETHER_KINDS[o.kind]}
    {#if kind}
      <!-- Se arrastra con el ratón; sus controles son botones accesibles con teclado -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y-no-noninteractive-element-interactions -->
      <div
        class="ether-object look-{o.look}"
        class:dragging={drag?.id === o.id && drag.moved}
        class:flash={flashing[o.id]}
        class:reduced={etherReduced}
        style="left: {o.x - o.w / 2}px; top: {o.y - o.h / 2}px; width: {o.w}px; height: {o.h}px;"
        data-ether-object={o.id}
        role="group"
        aria-label="Objeto del Éter"
        on:mousedown={(e) => onDown(e, o)}
      >
        <svelte:component this={kind.component} object={o} />
      </div>
    {/if}
  {/each}

  {#each front as f (f.key)}
    {@const at = fxPos(f, $etherObjects)}
    <EffectLayer def={f.def} player={f.player} x={at.x} y={at.y} params={at.params} palette={$etherPalette} seed={$etherSeed} reduced={etherReduced} />
  {/each}
</div>

<style>
  /* Sin z-index propio: los efectos y el objeto se ordenan con la mascota (--z-pet). */
  .ether-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .ether-object {
    position: absolute;
    z-index: calc(var(--z-pet) - 1);
    pointer-events: auto;
    cursor: grab;
    user-select: none;
    transform-origin: 50% 55%;
  }
  .ether-object.dragging {
    cursor: grabbing;
  }
  .ether-object.flash {
    animation: ether-flash 340ms steps(4) both;
  }
  /* Sale de la grieta / se hunde en ella / parpadeo rápido. A saltos, como el pixel art. */
  .look-emerging {
    animation: ether-emerge var(--emerge-ms) steps(6) both;
  }
  .look-sinking {
    animation: ether-emerge var(--emerge-ms) steps(6) reverse both;
    pointer-events: none;
  }
  .look-vanishing {
    animation: ether-emerge var(--vanish-ms) steps(3) reverse both;
    pointer-events: none;
  }
  .reduced.look-emerging,
  .reduced.look-sinking,
  .reduced.look-vanishing {
    animation-name: ether-fade;
  }
  @keyframes ether-emerge {
    from {
      transform: scale(0.1, 0.3);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @keyframes ether-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes ether-flash {
    0%,
    100% {
      filter: none;
    }
    50% {
      filter: brightness(1.7) saturate(1.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ether-object.flash {
      animation: none;
    }
  }
</style>
