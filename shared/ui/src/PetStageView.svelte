<script lang="ts">
  /**
   * El escenario del Pockai: la mascota grande y animada, para la pantalla de inicio de Mascota.
   *
   * Comparte motor con `PetMiniAvatar` (`@pockai/scene/sprites`: hoja horneada +
   * `AnimationController`), pero no implementación: este además pinta las prendas equipadas y la
   * capa de efectos del patrón y el shiny, se para cuando no se ve y respeta el movimiento
   * reducido. El orden de composición es el mismo que el de la mascota del escritorio
   * (`desktop/src/components/PetView.svelte`), que es la referencia: prendas de espalda, cuerpo,
   * efectos, prendas de delante.
   *
   * Solo pinta y avisa: la caricia sale como evento y la atiende el contenedor de cada app.
   */
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import {
    AnimationController,
    bakePetSpriteSheet,
    drawWorn,
    getAnimLibrary,
    getPetSvg,
    loadWornSet,
    resolveBaseState,
    type BakedPetSheet,
    type WornSet,
  } from '@pockai/scene/sprites';
  import { parseEquipped } from '@pockai/scene/bake';
  import { DEFAULT_PET_PALETTE, elementMeta } from './maps';

  export let pet: any = null;
  /**
   * Lado del escenario en px, cuando cabe. **Múltiplo entero del frame de la hoja, que mide 128 px**
   * (64 px nativos horneados a ×2): 128 o 256, y nada entre medias. Con 192, por ejemplo, la hoja se
   * reescala a ×1,5 y el pixel art sale con filas de distinto grosor.
   *
   * Si no cabe a lo ancho, el componente baja al escalón de abajo en lugar de encoger el dibujo.
   */
  export let size = 256;
  /** El escalón que de verdad cabe, medido sobre el ancho del panel. */
  let fits = size;
  /**
   * El lado con el que se pinta: siempre uno de los dos escalones, pase lo que pase en `size`. Sin
   * este ajuste, un 192 cualquiera volvería a reescalar la hoja a ×1,5.
   */
  $: drawn = Math.min(size, fits) >= 256 ? 256 : 128;
  /** El halo del color del Flujo detrás de la mascota. */
  export let halo = true;
  /** Si responde al toque. Sin esto es una lámina y no un botón. */
  export let interactive = true;
  /** Acción en curso en el panel. Con `caress` el escenario se marca ocupado. */
  export let busy: string | null = null;

  const dispatch = createEventDispatcher<{ caress: void }>();

  /** Con movimiento reducido los bucles se congelan; las reacciones pedidas sí se reproducen. */
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Píxeles de lienzo por píxel de CSS. Más de 2 no se nota y cuesta memoria en el móvil. */
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  let canvasEl: HTMLCanvasElement | null = null;
  let hostEl: HTMLElement | null = null;
  let bakedSheet: BakedPetSheet | null = null;
  let wornSet: WornSet | null = null;
  let rafId: number | null = null;
  let lastTime = 0;
  /** Si el escenario está en pantalla y la pestaña visible. Sin esto el bucle corre de fondo. */
  let onScreen = true;
  let tabVisible = true;

  // El controlador necesita la biblioteca de clips de la especie: sin ella el constructor lanza al
  // resolver 'idle' y el componente no llega a montarse.
  const initialLib = getAnimLibrary(pet?.species?.id || pet?.species?.spriteKey || 'ignisaur');
  const controller = new AnimationController(initialLib.library, initialLib.aliases);

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: stage = pet?.stage ?? null;
  $: patternKey = pet?.pattern?.id || 'plain';
  $: palette = pet?.palette || DEFAULT_PET_PALETTE;
  $: visualSeed = pet?.visualSeed ?? 1337;
  $: isShiny = !!pet?.shiny;
  $: isSleeping = !!pet?.sleeping;
  /** El huevo no es una mascota que se pueda enseñar aquí: lo cubre la vista de eclosión. */
  $: showable = !!pet && stage !== 'egg';
  $: flow = elementMeta(pet?.species?.element).color;
  /** El perfil en SVG de la especie, para el hueco mientras se hornea la hoja. */
  $: baseSvg = showable ? getPetSvg(speciesKey, 'idle') : '';
  $: name = pet?.nickname || pet?.species?.name || 'Tu Pockai';

  $: {
    const lib = getAnimLibrary(speciesKey);
    controller.setLibrary(lib.library, lib.aliases);
  }
  $: controller.setBase(resolveBaseState(pet));

  /** Lo que se lee en voz alta: quién es y cómo está. */
  $: moodLabel = (() => {
    const state = resolveBaseState(pet);
    return (
      {
        sleep: 'durmiendo',
        sick: 'enferma',
        hungry: 'con hambre',
        tired: 'cansada',
        sad: 'triste',
        idle: 'tranquila',
      } as Record<string, string>
    )[state] ?? 'tranquila';
  })();

  // ── Horneado de la hoja ──────────────────────────────────────────────────────────────────────

  let baking = false;
  let pendingBake = false;

  $: if (showable && (speciesKey || stage || patternKey || palette || visualSeed || isShiny)) void triggerBake();

  async function triggerBake() {
    if (baking) {
      pendingBake = true; // los datos cambiaron mientras se horneaba: repetir al terminar
      return;
    }
    baking = true;
    pendingBake = false;
    try {
      bakedSheet = await bakePetSpriteSheet(speciesKey, patternKey, palette, visualSeed, isShiny, stage);
    } catch (err) {
      console.warn('[PetStageView] No se pudo hornear la hoja:', err);
      bakedSheet = null;
    } finally {
      baking = false;
      if (pendingBake) void triggerBake();
    }
  }

  // ── Prendas equipadas ────────────────────────────────────────────────────────────────────────

  /** Serializado para que el bloque reactivo no se dispare con cada objeto nuevo e igual. */
  $: equippedKey = JSON.stringify(parseEquipped(pet?.accessories));
  let wornSeq = 0;
  $: if (showable) void refreshWorn(speciesKey, stage, equippedKey);

  async function refreshWorn(species: string, petStage: string | null, key: string) {
    const seq = ++wornSeq;
    const next = await loadWornSet(species, petStage, JSON.parse(key));
    if (seq === wornSeq) wornSet = next; // si cambió de mascota mientras cargaba, esto ya no vale
  }

  // ── Bucle de pintado ─────────────────────────────────────────────────────────────────────────

  /** Tamaño en pantalla de un píxel nativo del sprite (el frame nativo mide 64 px). */
  $: pixelScale = drawn / 64;
  // Al cambiar de escalón el lienzo es otro: hay que repintar aunque nada se mueva.
  $: if (drawn) lastKey = '';

  /** Lo último pintado, para no repetir el mismo cuadro cuando nada se mueve. */
  let lastKey = '';

  function draw(time: number) {
    if (!canvasEl || !bakedSheet) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dt = lastTime ? Math.min(time - lastTime, 250) : 16;
    lastTime = time;

    // Con movimiento reducido el bucle de reposo se queda quieto en su primer frame, pero una
    // reacción pedida (la caricia) sí se reproduce: es un gesto que el jugador acaba de provocar,
    // no una animación de fondo. La misma regla que `PetSprite` en la escena.
    const quieto = reducedMotion && controller.actionName === null;
    const frameState = quieto ? { name: controller.baseName, frame: 0 } : controller.update(dt);

    // Quieto, el cuadro no cambia y las prendas y los efectos están congelados: no hay nada que
    // repintar, así que el bucle pasa de largo en lugar de redibujar lo mismo 60 veces por segundo.
    const key = `${frameState.name}:${frameState.frame}`;
    if (quieto && key === lastKey) return;
    lastKey = quieto ? key : '';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawn, drawn);
    // Pixel art: ni un píxel interpolado, ni en el cuerpo ni en las prendas.
    ctx.imageSmoothingEnabled = false;

    const wornTime = reducedMotion ? 0 : time;
    drawWorn(ctx, wornSet, 'behind', frameState.name, frameState.frame, wornTime, pixelScale);

    const frame = bakedSheet.getFrame(frameState.name, frameState.frame);
    ctx.drawImage(bakedSheet.canvas, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, drawn, drawn);

    // Patrón de la Textura del Éter y variante shiny: sobre el cuerpo y bajo las prendas.
    const fxLayer = reducedMotion ? null : bakedSheet.fxFrame(frame, time);
    if (fxLayer) ctx.drawImage(fxLayer, 0, 0, drawn, drawn);

    drawWorn(ctx, wornSet, 'front', frameState.name, frameState.frame, wornTime, pixelScale);
  }

  function loop(time: number) {
    draw(time);
    rafId = requestAnimationFrame(loop);
  }

  /** El bucle solo corre con el escenario a la vista y la pestaña delante. */
  $: if (typeof window !== 'undefined') {
    const shouldRun = showable && onScreen && tabVisible;
    if (shouldRun && rafId === null) {
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    } else if (!shouldRun && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onVisibility() {
    tabVisible = document.visibilityState === 'visible';
  }

  let observer: IntersectionObserver | null = null;
  let sizer: ResizeObserver | null = null;

  /**
   * El escalón más grande que cabe a lo ancho. Se baja de golpe a la mitad en lugar de encoger el
   * dibujo: media escala deja el pixel art con filas de distinto grosor, y eso se ve.
   */
  function measure(width: number) {
    if (width <= 0) return;
    fits = width >= 256 ? 256 : 128;
  }

  onMount(() => {
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    if (hostEl && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
      });
      observer.observe(hostEl);
    }
    if (hostEl && typeof ResizeObserver !== 'undefined') {
      // El ancho útil, ya sin el relleno del panel.
      sizer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
      sizer.observe(hostEl);
    }
  });

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    observer?.disconnect();
    sizer?.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  });

  // ── La caricia ───────────────────────────────────────────────────────────────────────────────

  /**
   * Acariciar. Dormida no se la toca: el servidor lo rechaza y despertarla por un toque suelto
   * sería peor que no hacer nada.
   */
  function caress() {
    if (!interactive || !showable || isSleeping || busy) return;
    controller.play('love'); // sin clip propio, `ANIM_FALLBACKS` lo lleva a 'happy'
    dispatch('caress');
  }
</script>

{#if showable}
  <div class="stage" class:halo bind:this={hostEl} style="--flow: {flow}; --stage-size: {drawn}px">
    <svelte:element
      this={interactive ? 'button' : 'div'}
      type={interactive ? 'button' : undefined}
      class="stage__pet"
      class:interactive
      role={interactive ? undefined : 'img'}
      aria-label={interactive ? `Acariciar a ${name}. Ahora está ${moodLabel}` : `${name}, ${moodLabel}`}
      aria-busy={busy === 'caress' || undefined}
      disabled={interactive ? isSleeping || !!busy : undefined}
      on:click={caress}
    >
      <!-- Hornear la hoja tarda un momento la primera vez; mientras, el perfil en SVG de la
           especie, para que el escenario no salga vacío. Es el mismo respaldo que `PetMiniAvatar`. -->
      {#if !bakedSheet}
        <div class="stage__svg" style="width: {drawn}px; height: {drawn}px">{@html baseSvg}</div>
      {/if}
      <canvas
        bind:this={canvasEl}
        class:hidden={!bakedSheet}
        width={drawn * dpr}
        height={drawn * dpr}
        style="width: {drawn}px; height: {drawn}px"
      ></canvas>
    </svelte:element>
    {#if interactive}
      <p class="stage__hint">{isSleeping ? `${name} está durmiendo` : `Toca a ${name} para acariciarlo`}</p>
    {/if}
  </div>
{/if}

<style>
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background:
      radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, var(--flow) 22%, transparent), transparent 70%),
      color-mix(in srgb, var(--flow) 8%, var(--surface));
    overflow: hidden;
  }
  .stage__pet {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--stage-size);
    height: var(--stage-size);
  }
  .stage.halo .stage__pet::before {
    content: '';
    position: absolute;
    inset: 12%;
    border-radius: 50%;
    background: color-mix(in srgb, var(--flow) 28%, transparent);
    filter: blur(6px);
  }
  /* Sin reset, el WebView pinta el fondo y el borde nativos del <button> (el "cuadrado gris"). */
  .stage__pet.interactive {
    appearance: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .stage__pet.interactive:disabled {
    cursor: default;
  }
  .stage__pet.interactive:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 4px;
    border-radius: var(--radius-2xl);
  }
  .stage__pet.interactive:active:not(:disabled) canvas {
    scale: 0.97;
  }
  .stage__svg {
    position: absolute;
    display: grid;
    place-items: center;
    opacity: 0.55;
  }
  .stage__svg :global(svg) {
    width: 70%;
    height: 70%;
  }
  canvas.hidden {
    visibility: hidden;
  }
  canvas {
    position: relative;
    image-rendering: pixelated;
    pointer-events: none;
    transition: scale var(--dur-1);
  }
  .stage__hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-caption);
    font-weight: 700;
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    canvas {
      transition: none;
    }
  }
</style>
