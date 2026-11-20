<script lang="ts">
  /**
   * Salita de un Pockai: pared con cartel "Casa de …", ventana, suelo de madera y alfombra.
   * La comparten Inicio (Pockai en casa) y Social › Visitas. El escenario va en el slot por defecto;
   * el slot `overlay` queda encima de todo (pistas, botones). Es una isla de tono: colores fijos.
   * Reenvía mousedown/keydown y cualquier atributo extra (role, tabindex, aria-*) al contenedor.
   *
   * La ventana enseña el cielo y el clima reales y la salita recibe la luz de la hora, con las
   * mismas funciones que las salas isométricas y el Nexo (lib/ambience-2d.ts). Con `mood="night"`
   * (el Pockai duerme) las luces ya están apagadas y no se añade el velo de la hora.
   */
  import { onDestroy, onMount } from 'svelte';
  import { localMinute } from '@pockai/scene';
  import { environmentalStatus } from '../lib/environmental';
  import { drawSky, outsideAt, veilOf, Weather2D } from '../lib/ambience-2d';

  /** Texto del cartel de la pared. */
  export let label: string;
  /** day = cálida, night = mascota dormida, live = visita en curso. */
  export let mood: 'day' | 'night' | 'live' = 'day';
  export let height = 168;
  export let showWindow = true;
  export let showRug = true;
  export let decor = true;
  let klass = '';
  export { klass as class };

  const WIN = 46;
  let tick = 0;
  const nowMinute = (_tick: number) => localMinute();
  $: outside = outsideAt($environmentalStatus?.weather, nowMinute(tick));
  $: veil = veilOf(outside);
  let skyCanvas: HTMLCanvasElement;
  const weatherFx = new Weather2D();
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf: number | null = null;
  let clock = 0;
  let last = 0;

  /** Cielo y clima dentro de la ventana (un lienzo pequeño: se pinta en cada fotograma). */
  function paint(time: number) {
    const dt = last ? Math.min(time - last, 100) : 16;
    last = time;
    if (!reducedMotion) clock += dt;
    weatherFx.step(dt, outside.look);
    const ctx = skyCanvas?.getContext('2d');
    if (ctx) {
      drawSky(ctx, WIN, WIN, outside, clock, reducedMotion);
      weatherFx.draw(ctx, WIN, WIN, outside, clock);
    }
    raf = reducedMotion ? null : requestAnimationFrame(paint);
  }
  // Con movimiento reducido se repinta solo cuando cambia la hora o el clima.
  $: if (reducedMotion && skyCanvas && outside) paint(performance.now());

  let iv: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    iv = setInterval(() => tick++, 20_000);
    if (!reducedMotion) raf = requestAnimationFrame(paint);
  });
  onDestroy(() => {
    if (iv) clearInterval(iv);
    if (raf !== null) cancelAnimationFrame(raf);
  });
</script>

<div
  class="home-scene mood-{mood} {klass}"
  style="--scene-h: {height}px"
  {...$$restProps}
  on:mousedown
  on:keydown
>
  <span class="sign">{label}</span>
  {#if showWindow}
    <span class="window" aria-hidden="true"><canvas bind:this={skyCanvas} width={WIN} height={WIN}></canvas><i></i></span>
  {/if}
  {#if decor}<span class="frame" aria-hidden="true">🌿</span>{/if}
  <span class="floor" aria-hidden="true"></span>
  {#if showRug}<span class="rug" aria-hidden="true"></span>{/if}
  <div class="stage"><slot /></div>
  {#if mood !== 'night' && veil.alpha > 0.005}
    <span class="daylight" style="background:{veil.color}; opacity:{veil.alpha}" aria-hidden="true"></span>
  {/if}
  <slot name="overlay" />
</div>

<style>
  .home-scene {
    color-scheme: light;
    position: relative;
    height: var(--scene-h);
    overflow: hidden;
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-2xl);
    background: var(--scene-room-day);
    user-select: none;
    --floor-h: min(46px, calc(var(--scene-h) * 0.3));
  }
  .mood-night {
    background: var(--scene-room-night);
  }
  .mood-live {
    background: var(--scene-room-live);
  }
  .sign {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    max-width: 62%;
    padding: 3px 10px;
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    background: var(--color-sunburst);
    box-shadow: 2px 2px 0 var(--color-carbon);
    color: var(--color-carbon);
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .window {
    position: absolute;
    top: 12px;
    right: 14px;
    width: 46px;
    height: 46px;
    overflow: hidden;
    border: 3px solid var(--scene-window-frame);
    outline: 1.5px solid var(--color-carbon);
    border-radius: 10px;
    background: var(--scene-window-day);
  }
  .window canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .daylight {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    transition: opacity 2s ease, background-color 2s ease;
  }
  .window i {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, transparent calc(50% - 1.5px), var(--scene-window-frame) calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
      linear-gradient(0deg, transparent calc(50% - 1.5px), var(--scene-window-frame) calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px));
  }
  .mood-night .window {
    background: var(--scene-window-night);
  }
  .frame {
    position: absolute;
    top: 50px;
    left: 18px;
    font-size: 20px;
    opacity: 0.85;
  }
  .floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--floor-h);
    border-top: 1.5px solid var(--color-carbon);
    background: var(--scene-floor-day);
  }
  .mood-night .floor {
    background: var(--scene-floor-night);
  }
  .rug {
    position: absolute;
    left: 50%;
    bottom: 10px;
    width: 150px;
    height: 26px;
    transform: translateX(-50%);
    border: 1.5px solid var(--scene-rug-edge);
    border-radius: 50%;
    background: var(--scene-rug);
  }
  .stage {
    position: absolute;
    left: 50%;
    bottom: 16px;
    z-index: 1;
    display: flex;
    justify-content: center;
    transform: translateX(-50%);
  }
</style>
