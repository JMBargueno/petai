<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    bakePetSpriteSheet,
    getPetSvg,
    getPatternSvg,
    type BakedPetSheet
  } from '../lib/sprites';
  import EnvironmentalOverlay from './EnvironmentalOverlay.svelte';
  import type { EnvironmentalStatus } from '../lib/environmental';
  import { skillAuthorizations, isSkillActive } from '../lib/stores/desktopSkillsStore';
  import {
    calculateThrowVelocity,
    stepPhysics,
    type PhysicsState,
    type PointerSample,
  } from '../lib/physics/petPhysics';
  import { fetchActiveWindow, calculatePerchTarget } from '../lib/windowPerching';
  import { categorizeWindowTitle, type AppCategory } from '../lib/contextAwareness';
  import { analyzeDroppedFile, type AnalyzedFile } from '../lib/fileAnalyzer';

  export let pet: any;
  export let onPetClick: () => void = () => {};
  /** Texto de la burbuja de chat sobre la mascota (vacío = oculta) */
  export let bubble: string = '';
  /** Estado ambiental (feature 005): hora del día, clima, actividad y festividad. */
  export let environmental: EnvironmentalStatus | null = null;

  let currentAnim = 'idle';
  let posX = 150;
  let posY = 50;
  let direction = 1; // 1: derecha, -1: izquierda
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  let animTimer: any = null;
  let moveInterval: any = null;
  let animRafId: number | null = null;

  // Canvas y baking
  let petCanvas: HTMLCanvasElement | null = null;
  let bakedSheet: BakedPetSheet | null = null;
  let isBaking = false;
  let currentFrameIndex = 0;
  let lastFrameTime = 0;

  // Transformaciones procedurales
  let squashScaleX = 1;
  let squashScaleY = 1;
  let recoilOffsetX = 0;
  let isWhiteFlash = false;

  // Fase 2: Estados de Trepar (Climb) y Posarse en Ventanas (Perch)
  let isClimbing = false;
  let climbWall: 'left' | 'right' | 'ceiling' | null = null;
  let climbRotation = 0;
  let isPerched = false;

  // Fase 3: Drag & Drop de archivos y Conciencia de contexto
  let isDragOverPet = false;
  let currentAppCategory: AppCategory = 'generic';
  let lastContextCheckTime = 0;

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: patternKey = pet?.pattern?.id || 'plain';
  $: isSleeping = pet?.sleeping || false;
  $: isShiny = pet?.shiny || false;
  $: visualSeed = pet?.visualSeed ?? 1337;
  $: palette = pet?.palette || { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' };

  $: if (isSleeping) {
    currentAnim = 'sleep';
  } else if (currentAnim === 'sleep' && !isSleeping) {
    currentAnim = 'idle';
  }

  // Hornear sprite sheet en memoria al cambiar de mascota, paleta o patrón
  $: if (pet && (speciesKey || patternKey || palette || visualSeed)) {
    triggerBake();
  }

  async function triggerBake() {
    if (isBaking) return;
    isBaking = true;
    try {
      bakedSheet = await bakePetSpriteSheet(
        speciesKey,
        patternKey,
        palette,
        visualSeed,
        isShiny
      );
    } catch (err) {
      console.warn('Fallback a SVG: error horneando sprite sheet:', err);
      bakedSheet = null;
    } finally {
      isBaking = false;
    }
  }

  // Fallback SVG legacy
  $: baseSvg = getPetSvg(speciesKey, currentAnim);
  $: patternSvg = getPatternSvg(patternKey);
  $: accentColor = palette.secondary || palette.accent || '#FFFFFF';

  // Variantes ambientales (feature 005): un tinte por tramo del día y clima sobre la mascota.
  $: envVariant = environmental
    ? `env--${environmental.timeOfDay} env--weather-${environmental.weather?.condition ?? 'unknown'}`
    : '';

  export function triggerAnim(anim: string) {
    if (isSleeping) return;
    currentAnim = anim;
    currentFrameIndex = 0;
    clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      currentAnim = 'idle';
      currentFrameIndex = 0;
    }, 2500);
  }

  export function triggerHurt() {
    recoilOffsetX = -12;
    isWhiteFlash = true;
    setTimeout(() => {
      recoilOffsetX = 0;
      isWhiteFlash = false;
    }, 80);
  }

  $: petBonding = pet?.bonding?.level ?? pet?.bondingLevel ?? 0;
  $: petIntelligence = pet?.intelligence ?? 1;

  let dragMoved = false;
  const PET_SIZE = 128;

  // Variables para físicas de arrastre, lanzamiento e inercia
  let pointerSamples: PointerSample[] = [];
  let physicsState: PhysicsState = {
    x: posX,
    y: posY,
    vx: 0,
    vy: 0,
    isAirborne: false,
    bounceCount: 0,
  };
  let lastPhysicsTime = 0;

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX - posX;
    dragStartY = e.clientY - posY;
    physicsState.isAirborne = false;
    isClimbing = false;
    climbWall = null;
    climbRotation = 0;
    isPerched = false;
    pointerSamples = [{ x: e.clientX, y: e.clientY, time: performance.now() }];
    document.body.dataset.dragging = '1';
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const nx = e.clientX - dragStartX;
    const ny = e.clientY - dragStartY;
    if (Math.abs(nx - posX) + Math.abs(ny - posY) > 0) dragMoved = true;
    posX = Math.min(Math.max(0, nx), window.innerWidth - PET_SIZE);
    posY = Math.min(Math.max(0, ny), window.innerHeight - PET_SIZE);

    const now = performance.now();
    pointerSamples.push({ x: e.clientX, y: e.clientY, time: now });
    if (pointerSamples.length > 20) pointerSamples.shift();
  }

  function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    delete document.body.dataset.dragging;

    const dragThrowActive = isSkillActive(
      'drag_throw',
      $skillAuthorizations,
      petBonding,
      petIntelligence
    );

    if (dragThrowActive && !isSleeping) {
      const { vx, vy } = calculateThrowVelocity(pointerSamples);
      const maxY = (window.innerHeight || 600) - PET_SIZE;

      // Si se soltó con impulso o en el aire
      if (Math.hypot(vx, vy) > 120 || posY < maxY - 15) {
        physicsState = {
          x: posX,
          y: posY,
          vx,
          vy,
          isAirborne: true,
          bounceCount: 0,
        };
        lastPhysicsTime = performance.now();
        if (Math.abs(vx) > 40) {
          direction = vx > 0 ? 1 : -1;
        }
      }
    }
  }

  function handleClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    // Procedural Squash & Stretch al interactuar
    squashScaleX = 1.15;
    squashScaleY = 0.85;
    setTimeout(() => {
      squashScaleX = 0.95;
      squashScaleY = 1.05;
      setTimeout(() => {
        squashScaleX = 1;
        squashScaleY = 1;
      }, 70);
    }, 60);

    onPetClick();
  }

  // Loop de renderizado del Canvas a 60 FPS
  function renderLoop(time: number) {
    if (petCanvas && bakedSheet) {
      const ctx = petCanvas.getContext('2d');
      if (ctx) {
        // Avance de frame cada 150 ms
        if (time - lastFrameTime > 150) {
          currentFrameIndex++;
          lastFrameTime = time;
        }

        ctx.clearRect(0, 0, 128, 128);

        // Recortar frame del sprite sheet horneado
        const frame = bakedSheet.getFrame(currentAnim, currentFrameIndex);
        ctx.drawImage(
          bakedSheet.canvas,
          frame.sx, frame.sy, frame.sw, frame.sh,
          0, 0, 128, 128
        );

        // Efecto Flash blanco en daño
        if (isWhiteFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillRect(0, 0, 128, 128);
          ctx.restore();
        }

        // Efecto Shiny: Franja especular animada cada 4s
        if (isShiny) {
          const shinyPeriod = (time % 4000) / 4000; // 0.0 a 1.0 cada 4s
          if (shinyPeriod < 0.35) { // La franja cruza en 1.4s
            const progress = shinyPeriod / 0.35;
            const bandX = progress * 240 - 60;

            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            const grad = ctx.createLinearGradient(bandX, 0, bandX + 40, 128);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);
            ctx.restore();
          }
        }
      }
    }
    // Paso de simulación física si la mascota está en el aire o lanzada
    if (physicsState.isAirborne) {
      const dt = lastPhysicsTime ? (time - lastPhysicsTime) / 1000 : 0.016;
      lastPhysicsTime = time;

      const prevBounces = physicsState.bounceCount;
      const bounds = {
        minX: 10,
        maxX: (window.innerWidth || 800) - PET_SIZE - 10,
        minY: 10,
        maxY: (window.innerHeight || 600) - PET_SIZE,
      };

      physicsState = stepPhysics(physicsState, dt, bounds);
      posX = physicsState.x;
      posY = physicsState.y;

      // Rebote procedural con squash & stretch
      if (physicsState.bounceCount > prevBounces) {
        squashScaleX = 1.25;
        squashScaleY = 0.75;
        setTimeout(() => {
          squashScaleX = 1;
          squashScaleY = 1;
        }, 75);
      }

      // Al posarse definitivamente en el suelo
      if (!physicsState.isAirborne) {
        currentAnim = 'idle';
        squashScaleX = 1.15;
        squashScaleY = 0.85;
        setTimeout(() => {
          squashScaleX = 1;
          squashScaleY = 1;
        }, 90);
      }
    } else {
      lastPhysicsTime = time;
    }

    animRafId = requestAnimationFrame(renderLoop);
  }

  function handleQuickSummon(e: Event) {
    const customEvent = e as CustomEvent<{ x?: number; y?: number }>;
    const skillActive = isSkillActive(
      'quick_summon',
      $skillAuthorizations,
      petBonding,
      petIntelligence
    );
    if (!skillActive) return;

    physicsState.isAirborne = false;
    isClimbing = false;
    climbWall = null;
    climbRotation = 0;
    isPerched = false;
    const clientX = customEvent.detail?.x ?? (window.innerWidth || 800) / 2;
    const clientY = customEvent.detail?.y ?? (window.innerHeight || 600) - PET_SIZE;

    posX = Math.min(Math.max(20, clientX - PET_SIZE / 2), (window.innerWidth || 800) - PET_SIZE - 20);
    posY = Math.min(Math.max(20, clientY - PET_SIZE / 2), (window.innerHeight || 600) - PET_SIZE);

    triggerAnim('happy');
  }

  onMount(() => {
    // Inicializar loop de animación
    animRafId = requestAnimationFrame(renderLoop);

    window.addEventListener('petai:summon', handleQuickSummon);

    function handlePomodoroEvent(e: Event) {
      const customEvent = e as CustomEvent<{ eventType: string }>;
      const eventType = customEvent.detail?.eventType;
      if (!isSkillActive('pomodoro_companion', $skillAuthorizations, petBonding, petIntelligence)) {
        return;
      }

      if (eventType === 'work_start') {
        currentAnim = 'idle';
        bubble = '💼 ¡A trabajar! Estaré a tu lado en silencio.';
      } else if (eventType === 'work_finish') {
        triggerAnim('happy');
        bubble = '🎉 ¡Buen trabajo! Tómate una pausa y bebe agua 💧';
      } else if (eventType === 'break_finish') {
        triggerAnim('happy');
        bubble = '⚡ ¡Descanso listo! ¿Volvemos al foco?';
      }

      setTimeout(() => {
        if (bubble.startsWith('💼') || bubble.startsWith('🎉') || bubble.startsWith('⚡')) {
          bubble = '';
        }
      }, 6000);
    }

    window.addEventListener('petai:pomodoro_event', handlePomodoroEvent);

    // Ciclo de comportamiento de la mascota en pantalla
    moveInterval = setInterval(async () => {
      if (isSleeping || isDragging || physicsState.isAirborne || currentAnim === 'eat') return;

      const windowWidth = window.innerWidth || 800;
      const windowHeight = window.innerHeight || 600;

      // 1. Si está trepando por los bordes (climb_walls)
      if (isClimbing) {
        currentAnim = 'walk';
        if (climbWall === 'right' || climbWall === 'left') {
          posY -= 30;
          if (posY <= 30) {
            // Alcanzó el techo
            climbWall = 'ceiling';
            climbRotation = 180;
          }
        } else if (climbWall === 'ceiling') {
          posX += 30 * direction;
          // Si llega a la otra pared o decide soltarse
          if (posX < 30 || posX > windowWidth - 140 || Math.random() < 0.35) {
            isClimbing = false;
            climbWall = null;
            climbRotation = 0;
            // Se deja caer con gravedad
            physicsState = {
              x: posX,
              y: posY,
              vx: 40 * direction,
              vy: 60,
              isAirborne: true,
              bounceCount: 0,
            };
          }
        }
        return;
      }

      // 2. Si está posada en la barra de una ventana activa (window_perching)
      if (isPerched) {
        if (Math.random() < 0.35) {
          // Bajar de la ventana hacia el suelo con un salto
          isPerched = false;
          physicsState = {
            x: posX,
            y: posY,
            vx: 30 * direction,
            vy: 40,
            isAirborne: true,
            bounceCount: 0,
          };
        }
        return;
      }

      // 3. Posibilidad de posarse en la ventana activa si la habilidad está autorizada
      const canPerch = isSkillActive('window_perching', $skillAuthorizations, petBonding, petIntelligence);
      if (canPerch && Math.random() < 0.2) {
        const win = await fetchActiveWindow();
        if (win && win.is_valid) {
          const target = calculatePerchTarget(win, PET_SIZE);
          posX = target.x;
          posY = target.y;
          isPerched = true;
          triggerAnim('happy');
          return;
        }
      }

      // 3.5. Conciencia de la App en Foco (context_awareness)
      const canContext = isSkillActive('context_awareness', $skillAuthorizations, petBonding, petIntelligence);
      const now = Date.now();
      if (canContext && now - lastContextCheckTime > 6000) {
        lastContextCheckTime = now;
        const win = await fetchActiveWindow();
        if (win && win.title) {
          const ctx = categorizeWindowTitle(win.title);
          if (ctx.category !== currentAppCategory) {
            currentAppCategory = ctx.category;
            if (ctx.category !== 'generic') {
              bubble = `${ctx.accessoryIcon} ${ctx.reactionComment}`;
              setTimeout(() => {
                if (bubble.startsWith(ctx.accessoryIcon)) bubble = '';
              }, 4500);
            }
          }
        }
      }

      // 4. Movimiento normal y posibilidad de iniciar trepado
      const actionRoll = Math.random();
      if (actionRoll < 0.5) {
        currentAnim = 'walk';
        const step = 25 * direction;
        const reachedRight = posX + step > windowWidth - 140;
        const reachedLeft = posX + step < 20;

        const canClimb = isSkillActive('climb_walls', $skillAuthorizations, petBonding, petIntelligence);

        if ((reachedRight || reachedLeft) && canClimb && Math.random() < 0.5) {
          // Iniciar trepado vertical por la pared
          isClimbing = true;
          if (reachedRight) {
            climbWall = 'right';
            climbRotation = -90;
            posX = windowWidth - PET_SIZE - 5;
          } else {
            climbWall = 'left';
            climbRotation = 90;
            posX = 5;
          }
          return;
        }

        if (reachedRight) {
          direction = -1;
        } else if (reachedLeft) {
          direction = 1;
        }
        posX += 25 * direction;

        setTimeout(() => {
          if (!isSleeping && currentAnim === 'walk' && !isClimbing) {
            currentAnim = 'idle';
          }
        }, 800);
      } else if (actionRoll < 0.75) {
        currentAnim = 'idle';
      }
    }, 3000);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });

  onDestroy(() => {
    if (animRafId !== null) cancelAnimationFrame(animRafId);
    clearInterval(moveInterval);
    clearTimeout(animTimer);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('petai:summon', handleQuickSummon);
    window.removeEventListener('petai:pomodoro_event', handlePomodoroEvent);
  });
</script>

<!-- Contenedor del Sprite con física, arrastre y Squash & Stretch procedural -->
<div
  class="pet-container"
  role="button"
  tabindex="0"
  class:dragging={isDragging}
  class:drag-over={isDragOverPet}
  style="
    left: {posX + recoilOffsetX}px;
    top: {posY}px;
    transform: scaleX({direction}) rotate({climbRotation}deg) scale({squashScaleX}, {squashScaleY});
  "
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && onPetClick()}
  on:dragover={(e) => {
    e.preventDefault();
    isDragOverPet = true;
  }}
  on:dragleave={() => {
    isDragOverPet = false;
  }}
  on:drop={async (e) => {
    e.preventDefault();
    isDragOverPet = false;
    const canAnalyze = isSkillActive('file_analyzer', $skillAuthorizations, petBonding, petIntelligence);
    if (!canAnalyze) {
      bubble = '📄 Activa la habilidad "Analizador de Archivos" para que pueda leerlo.';
      setTimeout(() => (bubble = ''), 5000);
      return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const rawFile = e.dataTransfer.files[0];
      const analyzed = await analyzeDroppedFile(rawFile);
      triggerAnim('happy');
      bubble = `¡Atrapé ${analyzed.name}! 📄 ¿Qué quieres saber?`;
      window.dispatchEvent(new CustomEvent('petai:file_dropped', { detail: analyzed }));
    }
  }}
>
  <div class="sprite-wrapper" class:env={!!envVariant}>
    <!-- Tinte ambiental (feature 005): tramo del día + clima -->
    {#if envVariant}
      <div class="env-tint {envVariant}" aria-hidden="true"></div>
    {/if}

    <!-- Renderizado por Canvas horneado en memoria (In-Memory Baking) -->
    {#if bakedSheet}
      <canvas
        bind:this={petCanvas}
        width="128"
        height="128"
        class="pet-canvas"
      ></canvas>
    {:else}
      <!-- Fallback provisional a SVG mientras se hornea -->
      <div class="svg-base">
        {@html baseSvg}
      </div>
      {#if patternSvg}
        <div class="svg-pattern" style="color: {accentColor};">
          {@html patternSvg}
        </div>
      {/if}
    {/if}

    <!-- Overlay ambiental: accesorios (paraguas, gorro, sombrerito) y micro-momentos -->
    <EnvironmentalOverlay environmental={environmental} />

    <!-- Burbuja de chat o estado -->
    {#if bubble}
      <div class="speech" class:below={posY < 110} style="transform: scaleX({direction});">{bubble}</div>
    {/if}

    <div class="pet-badge" style="transform: scaleX({direction});">
      <span class="pet-name">{pet.nickname || pet.species?.name}</span>
      <span class="pet-lvl">Nv. {pet.level || 1}</span>
    </div>

    <!-- Indicador de partículas flotantes -->
    {#if isSleeping}
      <div class="floating-bubble zzz" style="transform: scaleX({direction});">
        💤
      </div>
    {:else if currentAnim === 'happy'}
      <div class="floating-bubble heart" style="transform: scaleX({direction});">
        ✨
      </div>
    {:else if currentAnim === 'eat'}
      <div class="floating-bubble food" style="transform: scaleX({direction});">
        🍎
      </div>
    {/if}
  </div>
</div>

<style>
  .pet-container {
    position: absolute;
    width: 128px;
    height: 128px;
    cursor: grab;
    transition: left 0.4s ease-out, top 0.4s ease-out, transform 0.08s ease-out;
    z-index: 50;
    pointer-events: auto;
    transform-origin: bottom center;
  }

  .pet-container:active {
    cursor: grabbing;
  }

  .pet-container.dragging {
    transition: none;
  }

  .pet-container.drag-over {
    filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.9));
  }

  .sprite-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .pet-canvas {
    width: 128px;
    height: 128px;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
    pointer-events: none;
  }

  .svg-base {
    position: absolute;
    top: 0;
    left: 0;
    width: 128px;
    height: 128px;
  }

  .svg-pattern {
    position: absolute;
    top: 0;
    left: 0;
    width: 128px;
    height: 128px;
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  .speech {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    margin-left: -110px;
    width: 220px;
    padding: 8px 12px;
    border-radius: var(--radius-2xl);
    background: var(--surface);
    color: var(--ink);
    border: var(--outline);
    font-size: 13px;
    line-height: 1.35;
    text-align: center;
    box-shadow: var(--shadow-3);
    pointer-events: none;
    z-index: 60;
  }

  .speech.below {
    bottom: auto;
    top: calc(100% + 30px);
  }

  .speech.below::after {
    top: auto;
    bottom: 100%;
    border-top-color: transparent;
    border-bottom-color: var(--line-soft);
  }

  .speech::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -6px;
    border: 6px solid transparent;
    border-top-color: var(--line);
  }

  .pet-badge {
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface-2);
    backdrop-filter: blur(8px);
    color: var(--ink);
    padding: 2px 8px;
    border-radius: var(--radius-2xl);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    display: flex;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--line-soft);
    pointer-events: none;
  }

  .pet-lvl {
    color: var(--warning-ink);
  }

  .floating-bubble {
    position: absolute;
    top: -15px;
    right: 10px;
    font-size: 20px;
    animation: floatUp 1.8s infinite ease-in-out;
    pointer-events: none;
  }

  @keyframes floatUp {
    0%, 100% {
      transform: translateY(0);
      opacity: 0.9;
    }
    50% {
      transform: translateY(-8px);
      opacity: 1;
    }
  }

  /* ---------- Tinte ambiental (feature 005) ---------- */
  .env-tint {
    position: absolute;
    inset: -20px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    opacity: 0.35;
    transition: background 1.2s ease;
  }

  /* Tramo del día */
  .env-tint.env--late_night {
    background: radial-gradient(circle, var(--surface-2) 0%, transparent 70%);
  }
  .env-tint.env--night {
    background: radial-gradient(circle, var(--surface-2) 0%, transparent 70%);
  }
  .env-tint.env--morning {
    background: radial-gradient(circle, color-mix(in srgb, var(--color-sunburst) 70%, var(--surface)) 0%, transparent 70%);
  }
  .env-tint.env--afternoon {
    background: radial-gradient(circle, color-mix(in srgb, var(--color-sunburst) 60%, var(--surface)) 0%, transparent 70%);
  }
  .env-tint.env--evening {
    background: radial-gradient(circle, rgba(244, 114, 182, 0.5) 0%, transparent 70%);
  }

  /* Clima (refuerza el tinte del tramo) */
  .env-tint.env--weather-rain,
  .env-tint.env--weather-cloud {
    background: radial-gradient(circle, var(--surface-2) 0%, transparent 70%);
    opacity: 0.5;
  }
  .env-tint.env--weather-snow,
  .env-tint.env--weather-cold {
    background: radial-gradient(circle, rgba(147, 197, 253, 0.85) 0%, transparent 70%);
    opacity: 0.55;
  }
  .env-tint.env--weather-hot {
    background: radial-gradient(circle, color-mix(in srgb, var(--color-sunburst) 70%, var(--surface)) 0%, transparent 70%);
    opacity: 0.5;
  }
</style>
