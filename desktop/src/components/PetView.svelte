<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    bakePetSpriteSheet,
    getAnimLibrary,
    getPetSvg,
    type BakedPetSheet
  } from '../lib/sprites';
  import { AnimationController, resolveBaseState } from '../lib/animation/AnimationController';
  import { parseEquipped } from '@pockai/scene/bake';
  import { drawWorn, loadWornSet, type WornSet } from '../lib/accessories';
  import type { Reaction } from '../lib/animation/eventMap';
  import EnvironmentalOverlay from './EnvironmentalOverlay.svelte';
  import VisitorPet from './VisitorPet.svelte';
  import type { EnvironmentalStatus } from '../lib/environmental';
  import type { HabitatVisitor } from '../lib/api';
  import { skillAuthorizations, isSkillActive, getPetBonding } from '../lib/stores/desktopSkillsStore';
  import {
    calculateThrowVelocity,
    advancePhysics,
    DEFAULT_PHYSICS_CONFIG,
    type PhysicsState,
    type PointerSample,
  } from '../lib/physics/petPhysics';
  import { fetchActiveWindow, calculatePerchTarget } from '../lib/windowPerching';
  import { categorizeWindowTitle, type AppCategory } from '../lib/contextAwareness';
  import { deskState } from '../lib/deskContext';
  import { analyzeDroppedFile } from '../lib/fileAnalyzer';
  import { BarksEngine } from '../lib/barks';
  import { BehaviorEngine, type BehaviorState } from '../lib/behaviorEngine';
  import { checkPetBallCollision, type BallState } from '../lib/toys/toyPhysics';
  import { currentSpeech, speak, speechBusy } from '../lib/speech-queue';
  import { setPetOnScreen } from '../lib/window-visibility';

  export let pet: any;
  export let onPetClick: () => void = () => {};
  /** Estado ambiental (feature 005): hora del día, clima, actividad y festividad. */
  export let environmental: EnvironmentalStatus | null = null;
  /** Amigos de visita en el hábitat (feature 021): su mascota se dibuja junto a la mía. */
  export let visitors: HabitatVisitor[] = [];
  /** Pelota de juguete opcional en el escritorio */
  export let ball: BallState | null = null;
  /** Callback cuando la mascota patea o cabecea la pelota */
  export let onBallKick: ((vx: number, vy: number) => void) | null = null;

  /** Animaciones que se permiten mientras duerme (el resto esperan a que despierte). */
  const ALLOWED_WHILE_SLEEPING = new Set(['wake', 'hit']);
  /** Una acción con esta prioridad o más "ocupa" a la mascota: no pasea mientras tanto. */
  const BUSY_PRIORITY = 40;
  const PET_SIZE = 128;
  /** Con movimiento reducido las prendas animadas se quedan en su primer frame. */
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Punto (cursor) donde aparece al montarse, p. ej. al soltarlo fuera del Hábitat. */
  export let spawnAt: { x: number; y: number } | null = null;

  let posX = spawnAt ? clampSpawn(spawnAt.x, window.innerWidth) : 150;
  let posY = spawnAt ? clampSpawn(spawnAt.y, window.innerHeight) : 50;
  function clampSpawn(cursor: number, max: number): number {
    return Math.min(Math.max(0, cursor - PET_SIZE / 2), Math.max(0, max - PET_SIZE));
  }
  let direction = 1; // 1: derecha, -1: izquierda
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  let moveInterval: any = null;
  let animRafId: number | null = null;

  // Canvas y baking
  let petCanvas: HTMLCanvasElement | null = null;
  let bakedSheet: BakedPetSheet | null = null;
  let isBaking = false;
  let bakeAgain = false;
  let lastRenderTime = 0;

  // Motor de animación: capas base / movimiento / acción
  const initialLib = getAnimLibrary(pet?.species?.id || 'ignisaur');
  const controller = new AnimationController(initialLib.library, initialLib.aliases);
  /** Clip visible ahora mismo (solo para la vista: el canvas lo lee del controller). */
  let currentAnim = 'idle';
  /** Hasta cuándo dura el paseo actual (ms de performance.now). */
  let walkUntil = 0;

  // Partícula flotante opcional (🎁, 🏆…) que acompaña a una reacción
  let particle = '';
  let particleTimer: ReturnType<typeof setTimeout> | null = null;

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

  // Motores de interactividad avanzada (Barks & Comportamientos dinámicos)
  const barksEngine = new BarksEngine();
  const behaviorEngine = new BehaviorEngine();
  let barkInterval: any = null;

  // Detección del cursor del ratón
  let cursorX = 0;
  let cursorY = 0;
  let cursorLastMove = performance.now();
  let isCursorMoving = false;
  let cursorStopTimer: any = null;

  // Caricias (hover petting) y Chocar patita
  let lastHoverX = 0;
  let lastHoverY = 0;
  let isPetting = false;
  let isHighFiveWaiting = false;

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: patternKey = pet?.pattern?.id || 'plain';
  $: isSleeping = pet?.sleeping || false;

  // Contexto en vivo para el chat (solo categoría y postura; el servidor filtra según las habilidades)
  $: deskState.set({
    appCategory: currentAppCategory,
    pose: isSleeping ? 'sleeping' : isPerched ? 'perched' : isClimbing ? 'climbing' : 'walking',
  });
  $: isShiny = pet?.shiny || false;
  $: visualSeed = pet?.visualSeed ?? 1337;
  $: palette = pet?.palette || { primary: '#E25822', secondary: '#F3C544', accent: '#6D1600' };

  // Biblioteca de clips de la especie y estado base derivado de la mascota
  $: {
    const lib = getAnimLibrary(speciesKey);
    controller.setLibrary(lib.library, lib.aliases);
  }
  $: controller.setBase(resolveBaseState(pet));
  $: if (isSleeping) controller.stop();

  // Hornear sprite sheet en memoria al cambiar de mascota, paleta o patrón
  $: stage = pet?.stage ?? null;
  $: if (pet && (speciesKey || patternKey || palette || visualSeed || stage)) {
    triggerBake();
  }

  // Prendas equipadas (spec 38): se recargan al cambiar de especie, de etapa o de prendas.
  let wornSet: WornSet | null = null;
  let wornSeq = 0;
  $: equippedKey = JSON.stringify(parseEquipped(pet?.accessories));
  $: void refreshWorn(speciesKey, stage, equippedKey);
  async function refreshWorn(species: string, petStage: string | null, key: string) {
    const seq = ++wornSeq;
    const next = await loadWornSet(species, petStage, JSON.parse(key));
    if (seq === wornSeq) wornSet = next;
  }

  async function triggerBake() {
    if (isBaking) {
      // Hay un horneado en curso: se repite al terminar con los datos nuevos
      bakeAgain = true;
      return;
    }
    isBaking = true;
    try {
      do {
        bakeAgain = false;
        bakedSheet = await bakePetSpriteSheet(speciesKey, patternKey, palette, visualSeed, isShiny, stage);
      } while (bakeAgain);
    } catch (err) {
      console.warn('Fallback a SVG: error horneando sprite sheet:', err);
      bakedSheet = null;
    } finally {
      isBaking = false;
    }
  }

  // Vista previa SVG de la especie mientras se hornea
  $: baseSvg = getPetSvg(speciesKey);

  // Variantes ambientales (feature 005): un tinte por tramo del día y clima sobre la mascota.
  $: envVariant = environmental
    ? `env--${environmental.timeOfDay} env--weather-${environmental.weather?.condition ?? 'unknown'}`
    : '';

  /** Reproduce una animación de acción. Devuelve `false` si no se pudo (no existe o duerme). */
  export function play(anim: string): boolean {
    if (isSleeping && !ALLOWED_WHILE_SLEEPING.has(anim)) return false;
    return controller.play(anim);
  }

  /** Compatibilidad: API anterior de PetView. */
  export function triggerAnim(anim: string) {
    play(anim);
  }

  /** Reacción completa: animaciones en orden y partícula opcional (el bocadillo lo gestiona App). */
  export function react(reaction: Reaction) {
    for (const anim of reaction.anims) play(anim);
    if (reaction.particle) showParticle(reaction.particle);
  }

  export function showParticle(emoji: string, ms = 1800) {
    particle = emoji;
    if (particleTimer) clearTimeout(particleTimer);
    particleTimer = setTimeout(() => (particle = ''), ms);
  }

  export function triggerHurt() {
    play('hit');
    recoilOffsetX = -12;
    isWhiteFlash = true;
    setTimeout(() => {
      recoilOffsetX = 0;
      isWhiteFlash = false;
    }, 80);
  }

  $: petBonding = getPetBonding(pet);
  $: petIntelligence = typeof pet?.intelligence === 'number' ? pet.intelligence : 0;

  let dragMoved = false;

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
  let physicsAccumulator = 0;
  // Enfriamiento entre golpes a la pelota para no repetir sonido/partículas cada frame
  const BALL_KICK_COOLDOWN_MS = 250;
  let lastBallKickTime = 0;

  // Un solo temporizador: un squash nuevo no deja que el anterior lo corte a medias
  let squashTimer: ReturnType<typeof setTimeout> | undefined;
  function squash(sx: number, sy: number, ms: number) {
    squashScaleX = sx;
    squashScaleY = sy;
    clearTimeout(squashTimer);
    squashTimer = setTimeout(() => {
      squashScaleX = 1;
      squashScaleY = 1;
    }, ms);
  }

  /** Squash & stretch proporcional a la fuerza del impacto (px/s). */
  function impactSquash(speed: number) {
    const k = Math.min(1, speed / 1600);
    if (k < 0.04) return;
    squash(1 + 0.3 * k, 1 - 0.3 * k, 60 + 50 * k);
  }

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
    cursorX = e.clientX;
    cursorY = e.clientY;
    isCursorMoving = true;
    cursorLastMove = performance.now();
    clearTimeout(cursorStopTimer);
    cursorStopTimer = setTimeout(() => {
      isCursorMoving = false;
    }, 250);

    if (!isDragging) return;
    const nx = e.clientX - dragStartX;
    const ny = e.clientY - dragStartY;
    if (Math.abs(nx - posX) + Math.abs(ny - posY) > 0) dragMoved = true;
    posX = Math.min(Math.max(0, nx), window.innerWidth - PET_SIZE);
    posY = Math.min(Math.max(0, ny), window.innerHeight - PET_SIZE);

    const now = performance.now();
    pointerSamples.push({ x: e.clientX, y: e.clientY, time: now });
    if (pointerSamples.length > 20) pointerSamples.shift();

    // ¿Está encima del panel (la casa)? Resalta el panel y la mascota como destino
    setOverHome(isOverPanel(e.clientX, e.clientY));
  }

  // Arrastre hacia casa: la mascota va por encima del panel mientras se arrastra, así que
  // elementFromPoint devolvería a la propia mascota; se miran todas las capas bajo el cursor.
  let isOverHome = false;
  let isEnteringHome = false;
  function isOverPanel(x: number, y: number): boolean {
    if (typeof document === 'undefined' || !document.elementsFromPoint) return false;
    return document.elementsFromPoint(x, y).some((el) => !!el.closest('.panel-card'));
  }
  function setOverHome(over: boolean) {
    if (over === isOverHome) return;
    isOverHome = over;
    if (over) document.body.dataset.petOverPanel = '1';
    else delete document.body.dataset.petOverPanel;
  }

  function handlePetHoverMove(e: MouseEvent) {
    if (isDragging || isSleeping) return;
    const dx = Math.abs(e.clientX - lastHoverX);
    const dy = Math.abs(e.clientY - lastHoverY);
    lastHoverX = e.clientX;
    lastHoverY = e.clientY;
    const delta = Math.hypot(dx, dy);

    // Caricias sobre la criatura (frotar con el cursor)
    if (delta > 2 && delta < 65) {
      const entered = behaviorEngine.recordStroke(delta);
      if (entered) {
        isPetting = true;
        play('happy');
        showParticle('❤️', 2500);
        squash(1.15, 0.85, 200);
        speak('¡Mmmm, qué rico! 🥰❤️', { durationMs: 2800, key: 'petting', maxWaitMs: 3000 });
        setTimeout(() => {
          isPetting = false;
        }, 2800);
      }
    }
  }

  function handleMouseUp(e?: MouseEvent) {
    if (!isDragging) return;
    isDragging = false;
    delete document.body.dataset.dragging;

    // Si se suelta sobre el panel de control (.panel-card), entra en casa con una
    // pequeña animación (encoge y se desvanece) y después se envía al hábitat
    const droppedOnHome = !!e && isOverPanel(e.clientX, e.clientY);
    setOverHome(false);
    if (droppedOnHome) {
      isEnteringHome = true;
      const petId = pet.id;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('petai:move_to_habitat', { detail: { petId } }));
        // Si la petición falla, la mascota sigue montada: que vuelva a verse
        setTimeout(() => (isEnteringHome = false), 1500);
      }, 260);
      return;
    }

    const dragThrowActive = isSkillActive(
      'drag_throw',
      $skillAuthorizations,
      petBonding,
      petIntelligence
    );

    const maxY = (window.innerHeight || 600) - PET_SIZE;
    if (dragThrowActive && !isSleeping) {
      const { vx, vy } = calculateThrowVelocity(pointerSamples, {
        releaseTime: performance.now(),
        maxSpeed: DEFAULT_PHYSICS_CONFIG.maxThrowSpeed,
      });

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
        physicsAccumulator = 0;
        if (Math.abs(vx) > 40) {
          direction = vx > 0 ? 1 : -1;
        }
        return;
      }
    }
    if (dragMoved) play('land');
  }

  function handleClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    // Si estaba ofreciendo la patita para chocar los cinco
    if (isHighFiveWaiting) {
      isHighFiveWaiting = false;
      behaviorEngine.completeHighFive();
      play('celebrate');
      showParticle('🎉✨', 2500);
      squash(1.2, 0.8, 150);
      speak('¡Eso es! ¡Choca esos cinco! 🐾💥', { durationMs: 3500, key: 'high-five-done', maxWaitMs: 3000 });
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

  /** Movimiento visible según lo que esté haciendo la mascota por el escritorio. */
  function resolveMotion(now: number): string | null {
    if (isDragging && dragMoved) return 'drag';
    if (physicsState.isAirborne) return 'fall';
    if (isClimbing) return 'climb';
    if (isPerched) return 'perch';
    if (now < walkUntil) return 'walk';
    return null;
  }

  // Loop de renderizado del Canvas a 60 FPS
  function renderLoop(time: number) {
    const dt = lastRenderTime ? Math.min(time - lastRenderTime, 250) : 16;
    lastRenderTime = time;

    controller.setMotion(resolveMotion(time));
    const frameState = controller.update(dt);
    if (frameState.name !== currentAnim) currentAnim = frameState.name;

    if (petCanvas && bakedSheet) {
      const ctx = petCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, PET_SIZE, PET_SIZE);

        // Pixel art: sin suavizado. Las prendas de espalda van antes que el cuerpo; el resto, después.
        ctx.imageSmoothingEnabled = false;
        const wornTime = reducedMotion ? 0 : time;
        drawWorn(ctx, wornSet, 'behind', frameState.name, frameState.frame, wornTime);

        // Recortar frame del sprite sheet horneado
        const frame = bakedSheet.getFrame(frameState.name, frameState.frame);
        ctx.drawImage(
          bakedSheet.canvas,
          frame.sx, frame.sy, frame.sw, frame.sh,
          0, 0, PET_SIZE, PET_SIZE
        );
        drawWorn(ctx, wornSet, 'front', frameState.name, frameState.frame, wornTime);

        // Efecto Flash blanco en daño
        if (isWhiteFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillRect(0, 0, PET_SIZE, PET_SIZE);
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
            const grad = ctx.createLinearGradient(bandX, 0, bandX + 40, PET_SIZE);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, PET_SIZE, PET_SIZE);
            ctx.restore();
          }
        }
      }
    }
    // Colisión e interacción con la pelota de juego en el escritorio
    if (ball && onBallKick && !isSleeping && !isDragging && time - lastBallKickTime > BALL_KICK_COOLDOWN_MS) {
      const col = checkPetBallCollision(
        { x: posX, y: posY, width: PET_SIZE, height: PET_SIZE },
        ball
      );
      if (col.collides) {
        lastBallKickTime = time;
        onBallKick(col.kickX, col.kickY);
        play('happy');
        squash(1.18, 0.82, 120);
        showParticle('⚽', 1200);
      }
    }

    // Paso de simulación física si la mascota está en el aire o lanzada
    if (physicsState.isAirborne) {
      const pdt = lastPhysicsTime ? (time - lastPhysicsTime) / 1000 : 1 / 60;
      lastPhysicsTime = time;

      const bounds = {
        minX: 10,
        maxX: (window.innerWidth || 800) - PET_SIZE - 10,
        minY: 10,
        maxY: (window.innerHeight || 600) - PET_SIZE,
      };

      const step = advancePhysics(physicsState, pdt, bounds, DEFAULT_PHYSICS_CONFIG, physicsAccumulator);
      physicsState = step.state;
      physicsAccumulator = step.accumulator;
      posX = physicsState.x;
      posY = physicsState.y;

      // Rebote procedural con squash & stretch según la fuerza del golpe
      if (step.impactSpeed > 0) impactSquash(step.impactSpeed);

      // Al posarse definitivamente en el suelo
      if (!physicsState.isAirborne) {
        play('land');
        squash(1.12, 0.88, 90);
      }
    } else {
      lastPhysicsTime = time;
      physicsAccumulator = 0;
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

    play('summon');
  }

  // Declarado a nivel de componente para poder quitar el listener en onDestroy
  function handlePomodoroEvent(e: Event) {
    const customEvent = e as CustomEvent<{ eventType: string }>;
    const eventType = customEvent.detail?.eventType;
    if (!isSkillActive('pomodoro_companion', $skillAuthorizations, petBonding, petIntelligence)) {
      return;
    }

    if (eventType === 'work_start') {
      controller.stop();
      speak('💼 ¡A trabajar! Estaré a tu lado en silencio.', { durationMs: 6000, maxWaitMs: 20_000 });
    } else if (eventType === 'work_finish') {
      play('celebrate');
      speak('🎉 ¡Buen trabajo! Tómate una pausa y bebe agua 💧', { durationMs: 6000, maxWaitMs: 20_000 });
    } else if (eventType === 'break_finish') {
      play('wake');
      speak('⚡ ¡Descanso listo! ¿Volvemos al foco?', { durationMs: 6000, maxWaitMs: 20_000 });
    }
  }

  onMount(() => {
    setPetOnScreen(true);
    // Inicializar loop de animación
    animRafId = requestAnimationFrame(renderLoop);

    window.addEventListener('petai:summon', handleQuickSummon);
    window.addEventListener('petai:pomodoro_event', handlePomodoroEvent);

    // Ciclo de comportamiento de la mascota en pantalla
    moveInterval = setInterval(async () => {
      if (isSleeping || isDragging || physicsState.isAirborne || controller.actionPriority >= BUSY_PRIORITY) return;

      const windowWidth = window.innerWidth || 800;

      // 1. Si está trepando por los bordes (climb_walls)
      if (isClimbing) {
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
          play('happy');
          return;
        }
      }

      // 3.5. Conciencia de la App en Foco (context_awareness)
      const canContext = isSkillActive('context_awareness', $skillAuthorizations, petBonding, petIntelligence);
      const now = Date.now();
      // Sin la habilidad no se conserva la última categoría (no debe llegar al chat ni a los hábitos)
      if (!canContext && currentAppCategory !== 'generic') currentAppCategory = 'generic';
      if (canContext && now - lastContextCheckTime > 6000) {
        lastContextCheckTime = now;
        const win = await fetchActiveWindow();
        if (win && win.title) {
          const ctx = categorizeWindowTitle(win.title);
          if (ctx.category !== currentAppCategory) {
            currentAppCategory = ctx.category;
            if (ctx.category !== 'generic') {
              speak(`${ctx.accessoryIcon} ${ctx.reactionComment}`, {
                priority: 'low',
                durationMs: 4500,
                key: 'app-context',
                onShow: () => play('talk'),
              });
            }
          }
        }
      }

      // 4. Movimiento normal y posibilidad de iniciar trepado
      const actionRoll = Math.random();

      // 4.1. Evento espontáneo "Choca esos cinco" (High Five)
      if (actionRoll < 0.08 && !isHighFiveWaiting && !isPerched && !isClimbing) {
        isHighFiveWaiting = true;
        behaviorEngine.startHighFive();
        play('happy');
        squash(1.15, 0.85, 180);
        speak('¡Choca esos cinco! Haz clic en mi patita 🐾✋', { priority: 'low', durationMs: 6000, key: 'high-five-offer' });
        setTimeout(() => {
          if (isHighFiveWaiting) isHighFiveWaiting = false;
        }, 6000);
        return;
      }

      // 4.2. Evaluación del motor de comportamientos (Stalking, Zoomies, Peeking, Orientación)
      const nowMs = performance.now();
      const cursorIdleDuration = nowMs - cursorLastMove;
      const beh = behaviorEngine.update(
        3.0,
        {
          x: cursorX,
          y: cursorY,
          isMoving: isCursorMoving,
          idleDurationMs: cursorIdleDuration,
        },
        {
          x: posX,
          y: posY,
          size: PET_SIZE,
          direction,
        },
        windowWidth
      );

      if (beh.shouldTurnToCursor && !isClimbing && !isPerched) {
        direction = cursorX > posX + PET_SIZE / 2 ? 1 : -1;
      }

      // Si hay una pelota rodando en el suelo, curiosear e intentar interceptarla
      if (ball && ball.isRolling && Math.abs(ball.vx) > 10 && !isClimbing && !isPerched) {
        const distToBall = ball.x - posX;
        direction = distToBall > 0 ? 1 : -1;
        posX += Math.min(Math.abs(distToBall), 40) * direction;
        walkUntil = performance.now() + 800;
        return;
      }

      if (beh.state === 'stalking' && beh.targetX !== undefined) {
        const diff = beh.targetX - posX;
        if (Math.abs(diff) > 15) {
          direction = diff > 0 ? 1 : -1;
          posX += Math.min(Math.abs(diff), 22) * direction;
          walkUntil = performance.now() + 800;
        }
        return;
      }

      if (beh.state === 'zoomies' && beh.targetX !== undefined) {
        const diff = beh.targetX - posX;
        direction = diff > 0 ? 1 : -1;
        posX += Math.min(Math.abs(diff), 60) * direction;
        walkUntil = performance.now() + 900;
        play('run');
        showParticle('💨✨', 1200);
        return;
      }

      if (beh.state === 'peeking' && beh.targetX !== undefined) {
        const diff = beh.targetX - posX;
        direction = diff > 0 ? 1 : -1;
        posX += Math.min(Math.abs(diff), 28) * direction;
        walkUntil = performance.now() + 800;
        return;
      }
      if (actionRoll < 0.5) {
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
        walkUntil = performance.now() + 900;
      } else if (actionRoll < 0.65 && controller.baseName === 'idle') {
        // De vez en cuando mira alrededor
        play('idle_alt');
      }
    }, 3000);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Motor de pensamientos frecuentes (Barks contextuales) cada ~65s
    barkInterval = setInterval(() => {
      if (isSleeping || isDragging || isHighFiveWaiting || speechBusy()) return;
      const now = performance.now();
      const ctx = {
        appCategory: currentAppCategory,
        hunger: pet?.hunger,
        energy: pet?.energy,
        hygiene: pet?.hygiene,
        happiness: pet?.happiness,
        timeOfDay: environmental?.timeOfDay,
        weatherCondition: environmental?.weather?.condition,
        isUserIdle: now - cursorLastMove > 35000,
        petName: pet?.nickname || pet?.species?.name,
      };
      const text = barksEngine.generateBark(ctx);
      if (text) speak(text, { priority: 'low', durationMs: 6500, onShow: () => play('talk') });
    }, 65000);
  });

  onDestroy(() => {
    // Fuera del escritorio (p. ej. en su casita) no hay app en foco ni postura que contar
    deskState.set({ appCategory: null, pose: 'walking' });
    setPetOnScreen(false);
    if (typeof document !== 'undefined') delete document.body.dataset.petOverPanel;
    if (animRafId !== null) cancelAnimationFrame(animRafId);
    clearInterval(moveInterval);
    clearInterval(barkInterval);
    clearTimeout(cursorStopTimer);
    if (particleTimer) clearTimeout(particleTimer);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('petai:summon', handleQuickSummon);
    window.removeEventListener('petai:pomodoro_event', handlePomodoroEvent);
  });
</script>

<!--
  El contenedor solo posiciona. Giro (scaleX), rotación al trepar y squash & stretch se aplican
  únicamente a `.pet-body`; el nombre, el bocadillo, las partículas y el texto ambiental quedan
  fuera de esa transformación para que siempre se lean en horizontal.
-->
<div
  class="pet-container"
  role="button"
  tabindex="0"
  data-anim={currentAnim}
  class:dragging={isDragging}
  class:over-home={isOverHome}
  class:entering-home={isEnteringHome}
  class:drag-over={isDragOverPet}
  class:high-five-ready={isHighFiveWaiting}
  class:petting={isPetting}
  style="left: {posX + recoilOffsetX}px; top: {posY}px;"
  on:mousedown={handleMouseDown}
  on:mousemove={handlePetHoverMove}
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
      speak('📄 Activa la habilidad "Analizador de Archivos" para que pueda leerlo.', { key: 'file-analyzer-off', maxWaitMs: 5000 });
      return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const rawFile = e.dataTransfer.files[0];
      const analyzed = await analyzeDroppedFile(rawFile);
      play('surprised');
      play('happy');
      speak(`¡Atrapé ${analyzed.name}! 📄 ¿Qué quieres saber?`, { maxWaitMs: 5000 });
      window.dispatchEvent(new CustomEvent('petai:file_dropped', { detail: analyzed }));
    }
  }}
>
  <div
    class="pet-body"
    style="transform: scaleX({direction}) rotate({climbRotation}deg) scale({squashScaleX}, {squashScaleY});"
  >
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
      <!-- Vista previa SVG de la especie mientras se hornea -->
      <div class="svg-base">
        {@html baseSvg}
      </div>
    {/if}

    <!-- Accesorio ambiental (paraguas, gorro, sombrerito…): se mueve con el cuerpo -->
    <EnvironmentalOverlay environmental={environmental} part="accessory" />
  </div>

  <!-- Mascotas de los amigos de visita (feature 021): junto a la mía, sin su transformación -->
  {#each visitors as v (v.visitorId)}
    <VisitorPet visitor={v} />
  {/each}

  <!-- Texto ambiental, bocadillo, nombre y partículas: sin girar ni rotar -->
  <EnvironmentalOverlay environmental={environmental} part="caption" />

  {#if $currentSpeech}
    {#key $currentSpeech.id}
      <div class="speech" class:below={posY < 110} role="status" aria-live="polite">{$currentSpeech.text}</div>
    {/key}
  {/if}

  {#if isHighFiveWaiting}
    <div class="high-five-badge" title="¡Haz clic para chocar los cinco!">
      <span>🐾✋ ¡Choca!</span>
    </div>
  {/if}

  <div class="pet-badge">
    <span class="pet-name">{pet.nickname || pet.species?.name}</span>
    <span class="pet-lvl">Nv. {pet.level || 1}</span>
  </div>

  {#if particle}
    {#key particle}
      <div class="floating-bubble" aria-hidden="true">{particle}</div>
    {/key}
  {/if}
</div>

<style>
  .pet-container {
    position: absolute;
    width: 128px;
    height: 128px;
    cursor: grab;
    transition: left 0.4s ease-out, top 0.4s ease-out;
    z-index: 50;
    pointer-events: auto;
  }

  .pet-container:active {
    cursor: grabbing;
  }

  .pet-container.dragging {
    transition: none;
    /* Por encima del panel de control (z-index 100) para "meterla" en casa arrastrando */
    z-index: 200;
  }

  .pet-container.over-home .pet-body {
    filter: drop-shadow(0 0 14px rgba(52, 211, 153, 0.95));
  }

  .pet-container.entering-home {
    z-index: 200;
    pointer-events: none;
    transition: none;
    animation: enterHome 0.26s ease-in forwards;
  }

  @keyframes enterHome {
    to {
      transform: scale(0.25) translateY(30px);
      opacity: 0;
    }
  }

  .pet-container.drag-over .pet-body {
    filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.9));
  }

  .high-five-badge {
    position: absolute;
    top: -24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-sunburst);
    color: var(--on-color);
    padding: 3px 10px;
    border-radius: var(--radius-pills);
    border: 1.5px solid var(--color-carbon);
    font-size: 11px;
    font-weight: 800;
    box-shadow: 2px 2px 0 var(--color-carbon);
    animation: highFiveBounce 0.5s infinite alternate ease-in-out;
    cursor: pointer;
    white-space: nowrap;
    z-index: 60;
  }

  @keyframes highFiveBounce {
    from {
      transform: translateX(-50%) translateY(0);
    }
    to {
      transform: translateX(-50%) translateY(-6px);
    }
  }

  .pet-container.petting .pet-body {
    animation: pettingPurr 0.14s infinite alternate ease-in-out;
  }

  @keyframes pettingPurr {
    from {
      transform: scaleX(var(--pet-dir, 1)) rotate(0deg);
    }
    to {
      transform: scaleX(var(--pet-dir, 1)) rotate(1.2deg);
    }
  }

  .pet-body {
    position: relative;
    width: 100%;
    height: 100%;
    transform-origin: bottom center;
    transition: transform 0.14s ease-out;
  }

  .pet-container.dragging .pet-body {
    transition: none;
  }

  .pet-canvas {
    position: relative;
    z-index: 1;
    width: 128px;
    height: 128px;
    /* Pixel art (GUIA_ARTISTICA §7.5): escala entera y sin suavizado. */
    image-rendering: pixelated;
    pointer-events: none;
  }

  .svg-base {
    position: absolute;
    top: 0;
    left: 0;
    width: 128px;
    height: 128px;
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
    animation: speechIn 180ms ease-out;
  }

  @keyframes speechIn {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .speech {
      animation: none;
    }
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
    z-index: 55;
  }

  .pet-lvl {
    color: var(--warning-ink);
  }

  .floating-bubble {
    position: absolute;
    top: -15px;
    right: 6px;
    font-size: 22px;
    animation: floatUp 1.8s ease-out forwards;
    pointer-events: none;
    z-index: 58;
  }

  @keyframes floatUp {
    0% {
      transform: translateY(6px) scale(0.6);
      opacity: 0;
    }
    20% {
      transform: translateY(0) scale(1.1);
      opacity: 1;
    }
    100% {
      transform: translateY(-26px) scale(1);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pet-body {
      transition: none;
    }
    .floating-bubble {
      animation: none;
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
