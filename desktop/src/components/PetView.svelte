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
  import { dropGoneVisitor, syncShownVisitors, type ShownVisitor } from '../lib/visitorsShown';
  import type { EnvironmentalStatus } from '../lib/environmental';
  import type { HabitatVisitor } from '../lib/api';
  import { skillAuthorizations, isSkillActive, getPetBonding, getPetIntelligenceLevel } from '../lib/stores/desktopSkillsStore';
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
  import { currentSpeech, parseBold, speak, speechBusy } from '../lib/speech-queue';
  import { setPetOnScreen } from '../lib/window-visibility';
  import Ico from './Ico.svelte';
  import EffectLayer from './EffectLayer.svelte';
  import { EFFECTS, EffectPlayer, admitMoment, flowPalette, phasesOf, portalNexo, type EffectDef, type FxPalette } from '@pockai/scene/effects';
  import { registerTravelPresenter, travel, travelArrived, type TravelState } from '../lib/visitTravel';

  export let pet: any;
  export let onPetClick: () => void = () => {};
  /** Estado ambiental (feature 005): hora del día, clima, actividad y festividad. */
  export let environmental: EnvironmentalStatus | null = null;
  /** Amigos de visita en el hábitat (feature 021): su mascota se dibuja junto a la mía. */
  export let visitors: HabitatVisitor[] = [];
  /**
   * Visitantes pintados: los que se van siguen aquí (con `leaving`) hasta cruzar su portal; el
   * store ya los ha quitado. Lógica pura en lib/visitorsShown.
   */
  let shownVisitors: ShownVisitor[] = [];
  $: syncVisitors(visitors);
  function syncVisitors(list: HabitatVisitor[]) {
    shownVisitors = syncShownVisitors(shownVisitors, list);
  }
  function visitorGone(id: string) {
    shownVisitors = dropGoneVisitor(shownVisitors, id);
  }
  /** Pelota de juguete opcional en el escritorio */
  export let ball: BallState | null = null;
  /** Callback cuando la mascota patea o cabecea la pelota */
  export let onBallKick: ((vx: number, vy: number) => void) | null = null;

  /** Animaciones que se permiten mientras duerme (el resto esperan a que despierte). */
  const ALLOWED_WHILE_SLEEPING = new Set(['wake', 'hit']);
  /** Una acción con esta prioridad o más "ocupa" a la mascota: no pasea mientras tanto. */
  const BUSY_PRIORITY = 40;
  const PET_SIZE = 128;
  const SPEECH_HALF = 110 + 8; // media burbuja + margen con el borde
  /** Con movimiento reducido las prendas animadas se quedan en su primer frame. */
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Punto (cursor) donde aparece al montarse, p. ej. al soltarlo fuera del Hábitat. */
  export let spawnAt: { x: number; y: number } | null = null;
  /** Cómo entra en escena al montarse: 'altar' = sale de su casa por el Altar del Santuario. */
  export let entrance: 'altar' | null = null;

  /** Desplazamiento horizontal de la burbuja para que no se salga por un borde de la pantalla. */
  $: speechShift = (() => {
    const cx = posX + PET_SIZE / 2;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    return Math.max(0, SPEECH_HALF - cx) - Math.max(0, cx + SPEECH_HALF - vw);
  })();

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
  /**
   * Etapa congelada mientras el capullo del Telar aún no tapa a la mascota: el backend avisa de
   * `evolved` antes de mandar el `pet:update` con la etapa nueva, y el re-horneado (sprite y
   * prendas) debe ocurrir dentro del capullo, no a la vista. Flag aparte porque `null` es etapa válida.
   */
  let stageFrozen = false;
  let frozenStage: string | null = null;
  $: stage = stageFrozen ? frozenStage : (pet?.stage ?? null);
  // Si la etapa nueva llega antes que el aviso `evolved` (o sin él), el capullo sale igual;
  // el `evolved` que llegue después se descarta (mismo peso en admitMoment).
  /**
   * Niveles del Despertar (LORE §5): Susurro < 200 ≤ Hilo de Ariadna < 500 ≤ Simbiosis. Mismo mapeo
   * que las habilidades (acepta también el nivel directo 2/3 de datos antiguos).
   */
  const awakeningLevel = (n: number) => getPetIntelligenceLevel(n);
  let lastAwakening: { id: string; level: number } | undefined = undefined;
  $: watchAwakening(pet?.id ?? '', awakeningLevel(petIntelligence));
  function watchAwakening(id: string, level: number) {
    const prev = lastAwakening;
    lastAwakening = { id, level };
    // Cambiar de mascota activa no es despertar
    if (prev && prev.id === id && level > prev.level) playMoment('chispa-despertar', { level });
  }

  let lastSeenStage: { id: string; stage: string | null } | undefined = undefined;
  $: watchStage(pet?.id ?? '', pet?.stage ?? null);
  function watchStage(id: string, next: string | null) {
    const prevSeen = lastSeenStage;
    lastSeenStage = { id, stage: next };
    // Primera vez o cambio de mascota activa: no es una evolución
    if (!prevSeen || prevSeen.id !== id) return;
    const prev = prevSeen.stage;
    if (prev === next || stageFrozen) return;
    if (STAGE_RANK.indexOf(next ?? '') > STAGE_RANK.indexOf(prev ?? '')) {
      playMoment('capullo-telar', next ? { stage: next } : {}, prev);
    }
  }
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
    if (reaction.effect) playMoment(reaction.effect.id, reaction.effect.params ?? {});
    reaction.anims.forEach((anim, i) => {
      // Un golpe (arena) se nota: destello blanco y retroceso, no solo el clip
      if (i === 0 && anim === 'hit') triggerHurt();
      else play(anim);
    });
    if (reaction.particle) showParticle(reaction.particle);
    if (reaction.emphasis) squash(1.28, 0.74, 220);
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
    if (e.button !== 0 || petAway || travelBusy || fxLock) return;
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

  // ---------- Viaje de visita por las hebras del Nexo (lib/visitTravel, skill pockai-effect-architect) ----------
  /** Píxeles desde el borde inferior del frame hasta los pies del sprite. */
  const FEET_INSET = 4;
  /** Distancia entre el centro de la mascota y el del portal al abrirse. */
  const PORTAL_GAP = 104;
  const WALK_TO_PORTAL_MS = reducedMotion ? 0 : 760;
  const THROUGH_PORTAL_MS = reducedMotion ? 220 : 440;
  /** Fuera de casa: invisible y sin zona de clic (el click-through ignora lo oculto). */
  let petAway = false;
  /** Entrando o saliendo por el portal: no pasea, no habla sola y no se puede arrastrar. */
  let travelBusy = false;
  let portalAnim: '' | 'entering' | 'exiting' | 'sprouting' = '';
  let portal: { x: number; y: number; player: EffectPlayer; id: number } | null = null;
  let portalSeq = 0;
  let travelHandled: TravelState = 'home';
  let unregisterTravel: () => void = () => {};
  $: portalPalette = flowPalette(pet?.species?.element);
  $: portalSeed = [...String(pet?.id ?? 'pockai')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  $: onTravel($travel.state);
  $: setPetOnScreen(!petAway);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const friendLabel = () => $travel.friendName || 'tu amigo';

  function onTravel(state: TravelState) {
    if (state === travelHandled) return;
    travelHandled = state;
    if (state === 'departing') void departThroughPortal();
    else if (state === 'returning') void returnThroughPortal();
    else if (!portal) {
      // Sin animación (visita restaurada, o vuelta mientras estaba en su hábitat)
      petAway = state === 'away';
      travelBusy = false;
    }
  }

  /** Deja a la mascota quieta y en horizontal antes de viajar. */
  function settleForTravel() {
    isClimbing = false;
    climbWall = null;
    climbRotation = 0;
    physicsState.isAirborne = false;
    isHighFiveWaiting = false;
    walkUntil = 0;
  }

  /** Pies del portal: a un lado de la mascota (hacia donde mira, si cabe) y a la altura de sus pies. */
  function portalSpot(): { x: number; y: number } {
    const w = window.innerWidth || 800;
    const half = (portalNexo.width * portalNexo.scale) / 2 + 8;
    const center = posX + PET_SIZE / 2;
    // Ni fuera de la pantalla ni tapado por el panel de control abierto
    const panel = document.querySelector('.panel-card')?.getBoundingClientRect();
    const feetY = posY + PET_SIZE - FEET_INSET;
    const blocked = (cx: number) =>
      cx < half || cx > w - half || (!!panel && cx + half > panel.left && cx - half < panel.right && feetY > panel.top);
    let x = center + direction * PORTAL_GAP;
    if (blocked(x)) x = center - direction * PORTAL_GAP;
    x = Math.min(Math.max(half, x), w - half);
    return { x, y: feetY };
  }

  function launchPortal(spot: { x: number; y: number }, onHold: (p: EffectPlayer) => Promise<void>): void {
    const player = new EffectPlayer(reducedMotion ? portalNexo.reducedPhases : portalNexo.phases, (phase) => {
      if (phase === 'hold') void onHold(player);
      if (phase === 'done') {
        portal = null;
        travelBusy = false;
        travelArrived();
      }
    });
    player.start(performance.now());
    portal = { ...spot, player, id: ++portalSeq };
  }

  async function departThroughPortal() {
    travelBusy = true;
    settleForTravel();
    const spot = portalSpot();
    direction = spot.x > posX + PET_SIZE / 2 ? 1 : -1;
    // Dormida, al menos se despereza antes de cruzar (el resto de clips esperan a que despierte)
    play(isSleeping ? 'wake' : 'surprised');
    speak(`¡Me voy al Santuario de ${friendLabel()}! 🧵`, { key: 'travel', durationMs: 2400, maxWaitMs: 400 });
    launchPortal(spot, async (player) => {
      // Camina hasta la boca del portal…
      if (WALK_TO_PORTAL_MS > 0) {
        walkUntil = performance.now() + WALK_TO_PORTAL_MS;
        posX = spot.x - PET_SIZE / 2;
        await wait(WALK_TO_PORTAL_MS);
      } else {
        posX = spot.x - PET_SIZE / 2;
      }
      // …y se lo traga el Éter.
      portalAnim = 'entering';
      await wait(THROUGH_PORTAL_MS);
      petAway = true;
      portalAnim = '';
      player.release(performance.now());
    });
  }

  async function returnThroughPortal() {
    travelBusy = true;
    settleForTravel();
    const w = window.innerWidth || 800;
    posX = Math.min(Math.max(0, posX), w - PET_SIZE);
    // Vuelve al suelo aunque se fuera desde el techo, una pared o una ventana: mientras estaba
    // fuera no se veía, así que elegir dónde reaparece no es un teletransporte.
    posY = (window.innerHeight || 600) - PET_SIZE;
    isPerched = false;
    const spot = { x: posX + PET_SIZE / 2, y: posY + PET_SIZE - FEET_INSET };
    launchPortal(spot, async (player) => {
      // Sale del Éter…
      petAway = false;
      portalAnim = 'exiting';
      await wait(THROUGH_PORTAL_MS);
      portalAnim = '';
      // …da unos pasos hacia el centro de la pantalla y cuenta de dónde viene.
      direction = posX + PET_SIZE / 2 < w / 2 ? 1 : -1;
      if (WALK_TO_PORTAL_MS > 0) {
        walkUntil = performance.now() + WALK_TO_PORTAL_MS;
        posX = Math.min(Math.max(0, posX + direction * PORTAL_GAP * 0.8), w - PET_SIZE);
        await wait(WALK_TO_PORTAL_MS);
      }
      play('happy');
      speak(`¡Ya volví del Santuario de ${friendLabel()}! ✨`, { key: 'travel', durationMs: 3200, maxWaitMs: 1500 });
      player.release(performance.now());
    });
  }

  // ---------- Efectos de momento (evolución, nivel, invocación…; skill pockai-effect-architect) ----------
  type MomentFx = {
    id: number;
    def: EffectDef;
    player: EffectPlayer;
    params: Record<string, string | number>;
    /** Sigue a la mascota (pies) o se queda en un punto fijo de la pantalla. */
    at: { x: number; y: number } | null;
    /** Rampa del efecto: la del Pockai, o la de otro (la recién nacida, en la revelación). */
    palette: FxPalette;
  };
  let moments: MomentFx[] = [];
  let momentSeq = 0;
  /** La mascota está tapada por un efecto (dentro del capullo, aún sin brotar de la hebra…). */
  let fxHidden = false;
  /** Un efecto la tiene quieta: no pasea ni se puede arrastrar. */
  let fxLock = false;
  /** Tope de la espera del capullo si el re-horneado no llega (p. ej. sin cambio de etapa). */
  const COCOON_MAX_HOLD_MS = 2600;
  const COCOON_MIN_HOLD_MS = 700;
  const STAGE_RANK = ['baby', 'juvenile', 'adult', 'final'];

  /**
   * Lanza un efecto de momento junto a la mascota. Solo cabe uno grande a la vez (`admitMoment`).
   * `onHold` se llama al llegar a la fase de espera y debe soltarla (`player.release`).
   */
  function startMoment(
    effectId: string,
    params: Record<string, string | number>,
    opts: {
      at?: { x: number; y: number };
      palette?: FxPalette;
      onHold?: (p: EffectPlayer) => void;
      onDone?: () => void;
    } = {},
  ): boolean {
    const def = EFFECTS[effectId];
    if (!def || petAway || travelBusy) return false;
    const verdict = admitMoment(moments, def);
    if (!verdict.play) return false;
    if (verdict.replace.length) moments = moments.filter((_, i) => !verdict.replace.includes(i));
    const id = ++momentSeq;
    const player = new EffectPlayer(phasesOf(def, params, reducedMotion), (phase) => {
      if (phase === 'hold') opts.onHold ? opts.onHold(player) : player.release(performance.now());
      if (phase === 'done') {
        moments = moments.filter((m) => m.id !== id);
        opts.onDone?.();
      }
    });
    player.start(performance.now());
    moments = [...moments, { id, def, player, params, at: opts.at ?? null, palette: opts.palette ?? portalPalette }];
    return true;
  }

  // ---------- Canal menor: efectos pequeños y frecuentes, concurrentes, sin bloquear a la mascota ----------
  let minors: MomentFx[] = [];
  const MAX_MINORS = 3;
  /** Lanza un efecto menor junto a la mascota (sigue sus pies si no lleva `at`). Si hay muchos, se omite. */
  export function playMinor(effectId: string, params: Record<string, string | number> = {}, at: { x: number; y: number } | null = null) {
    const def = EFFECTS[effectId];
    if (!def || petAway || fxHidden || minors.length >= MAX_MINORS) return;
    const id = ++momentSeq;
    const player = new EffectPlayer(phasesOf(def, params, reducedMotion), (phase) => {
      if (phase === 'hold') player.release(performance.now());
      if (phase === 'done') minors = minors.filter((m) => m.id !== id);
    });
    player.start(performance.now());
    minors = [...minors, { id, def, player, params, at, palette: portalPalette }];
  }

  /** Lluvia o nieve en pixel art (sustituye al emoji del paraguas o el copo). */
  $: climaKind = (() => {
    const cond = (environmental?.weather as { condition?: string } | undefined)?.condition;
    return cond === 'rain' || cond === 'snow' ? cond : null;
  })();
  $: setAmbient('clima', climaKind && !petAway ? 'clima' : null, climaKind ? { kind: climaKind } : {});

  // ---------- Canal ambiente: bucles que duran mientras su condición (clima, destello shiny) ----------
  let ambients: Array<MomentFx & { key: string; sig: string }> = [];
  /**
   * Pone (o quita, con `effectId = null`) el efecto de ambiente de una clave. Si ya está el mismo con
   * los mismos datos, no hace nada; si cambia, el anterior cierra sus fases y entra el nuevo.
   */
  function setAmbient(key: string, effectId: string | null, params: Record<string, string | number> = {}) {
    const sig = effectId ? effectId + JSON.stringify(params) : '';
    const current = ambients.find((a) => a.key === key && !a.player.done);
    if (current?.sig === sig) return;
    // El anterior se suelta y termina su salida; deja de contar para esta clave
    if (current) {
      current.player.release(performance.now());
      current.key = key + ':saliendo';
    }
    if (!effectId) return;
    const def = EFFECTS[effectId];
    if (!def) return;
    const id = ++momentSeq;
    const player = new EffectPlayer(phasesOf(def, params, reducedMotion), (phase) => {
      if (phase === 'done') ambients = ambients.filter((m) => m.id !== id);
    });
    player.start(performance.now());
    ambients = [...ambients, { id, def, player, params, at: null, palette: portalPalette, key, sig }];
  }

  /** Efecto que llega con una reacción (`eventMap`): capullo o resonancia. */
  function playMoment(effectId: string, params: Record<string, string | number>, fromStage?: string | null) {
    if (EFFECTS[effectId]?.channel === 'minor') {
      playMinor(effectId, params);
      return;
    }
    if (effectId === 'capullo-telar') {
      // Se sigue dibujando la etapa de antes hasta que el capullo la tape
      const stageAtStart = fromStage !== undefined ? fromStage : stage;
      const started = startMoment(effectId, params, {
        onHold: (player) => {
          // Dentro del capullo se re-hornea la nueva etapa: el cambio ya no es un corte en seco.
          fxHidden = true;
          stageFrozen = false;
          const holdAt = performance.now();
          const tick = setInterval(() => {
            const held = performance.now() - holdAt;
            const rebaked = stage !== stageAtStart && !isBaking && !!bakedSheet;
            if ((held >= COCOON_MIN_HOLD_MS && rebaked) || held >= COCOON_MAX_HOLD_MS) {
              clearInterval(tick);
              fxHidden = false;
              play('celebrate');
              player.release(performance.now());
            }
          }, 100);
        },
        onDone: () => {
          fxLock = false;
          fxHidden = false;
          stageFrozen = false;
        },
      });
      if (started) {
        frozenStage = stageAtStart;
        stageFrozen = true;
        fxLock = true;
        settleForTravel();
      }
      return;
    }
    if (effectId === 'revelacion-densidad' && params.beside) {
      // Nace otra de la colección: la columna se alza junto a la mascota, en el Flujo de la recién nacida
      startMoment(effectId, params, { at: portalSpot(), palette: flowPalette(String(params.element ?? '')) });
      return;
    }
    startMoment(effectId, params);
  }

  // ---------- Huevo con grietas de luz: la eclosión vista en el escritorio ----------
  let eggMoment: { id: number; player: EffectPlayer | null } | null = null;
  /**
   * La eclosión del panel también se ve junto a la mascota. `shake`: aparece el huevo y tiembla
   * (espera); `crack`: ya se sabe quién nace, sus grietas toman el Flujo de la recién nacida y el
   * huevo estalla (antes de que llegue la revelación); `abort`: la eclosión falló, el huevo se va.
   */
  export function hatchEgg(stage: 'shake' | 'crack' | 'abort', newborn?: { species?: { element?: string } }) {
    if (stage === 'shake') {
      const started = startMoment('huevo-grietas', {}, {
        at: portalSpot(),
        onHold: (player) => {
          if (eggMoment) eggMoment.player = player;
        },
        onDone: () => (eggMoment = null),
      });
      eggMoment = started ? { id: momentSeq, player: null } : null;
      return;
    }
    if (!eggMoment) return;
    const egg = eggMoment;
    if (stage === 'abort') {
      moments = moments.filter((m) => m.id !== egg.id);
      eggMoment = null;
      return;
    }
    // Las grietas brillan con el Flujo de quien nace
    const element = newborn?.species?.element;
    if (element) moments = moments.map((m) => (m.id === egg.id ? { ...m, palette: flowPalette(element) } : m));
    const release = () => egg.player?.release(performance.now());
    if (egg.player) release();
    else {
      // Aún no había llegado a la espera (respuesta muy rápida): suéltala en cuanto llegue
      const tick = setInterval(() => {
        if (egg.player || !eggMoment) {
          clearInterval(tick);
          release();
        }
      }, 50);
    }
  }

  // ---------- Altar del Santuario: entrar en casa y salir de ella ----------
  /**
   * Va a casa por el altar: se alza a su lado, anda hasta él, entra y el altar se hunde. Lo llama App
   * cuando el Pockai pasa a su hábitat desde el panel (botón «A casa»); al resolverse, App la desmonta.
   */
  export function enterAltar(): Promise<void> {
    return new Promise((resolve) => {
      if (petAway || travelBusy) return resolve();
      const spot = portalSpot();
      settleForTravel();
      fxLock = true;
      direction = spot.x > posX + PET_SIZE / 2 ? 1 : -1;
      const started = startMoment('altar-santuario', {}, {
        at: spot,
        onHold: async (player) => {
          if (WALK_TO_PORTAL_MS > 0) {
            walkUntil = performance.now() + WALK_TO_PORTAL_MS;
            travelBusy = true; // paso constante hasta la puerta
            posX = spot.x - PET_SIZE / 2;
            await wait(WALK_TO_PORTAL_MS);
            travelBusy = false;
          } else {
            posX = spot.x - PET_SIZE / 2;
          }
          portalAnim = 'entering';
          await wait(THROUGH_PORTAL_MS);
          fxHidden = true;
          portalAnim = '';
          player.release(performance.now());
        },
        onDone: () => {
          fxLock = false;
          resolve();
        },
      });
      if (!started) {
        fxLock = false;
        resolve();
      }
    });
  }

  /** Sale de casa por el altar, donde aparece (al montarse con entrance = 'altar'). */
  export function emergeFromAltar() {
    const spot = { x: posX + PET_SIZE / 2, y: posY + PET_SIZE - FEET_INSET };
    const started = startMoment('altar-santuario', {}, {
      at: spot,
      onHold: async (player) => {
        fxHidden = false;
        portalAnim = 'exiting';
        await wait(THROUGH_PORTAL_MS);
        portalAnim = '';
        play('happy');
        player.release(performance.now());
      },
      onDone: () => {
        fxLock = false;
      },
    });
    if (started) {
      fxLock = true;
      fxHidden = true;
    }
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

  const SHINY_PERIOD_MS = 6000;
  let lastShinyCycle = -1;

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
        // Efectos del patrón (Textura del Éter) y de la variante shiny, sobre el cuerpo y bajo las prendas.
        const fxLayer = reducedMotion ? null : bakedSheet.fxFrame(frame, time);
        if (fxLayer) ctx.drawImage(fxLayer, 0, 0, PET_SIZE, PET_SIZE);
        drawWorn(ctx, wornSet, 'front', frameState.name, frameState.frame, wornTime);

        // Efecto Flash blanco en daño
        if (isWhiteFlash) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillRect(0, 0, PET_SIZE, PET_SIZE);
          ctx.restore();
        }

        // Shiny (LORE §3, Bendición del Prisma): el brillo sobre el cuerpo ya lo pinta la hoja horneada
        // (fxFrame, arriba); cada 6 s, además, chispean estrellitas de paleta invertida alrededor.
        if (isShiny && !reducedMotion) {
          const cycle = Math.floor(time / SHINY_PERIOD_MS);
          if (cycle !== lastShinyCycle) {
            lastShinyCycle = cycle;
            playMinor('destello-prisma');
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
        playMinor('polvo-impacto', {}, { x: posX + PET_SIZE / 2, y: posY + PET_SIZE - FEET_INSET });
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
    if (!skillActive || petAway || travelBusy || fxLock) return;

    physicsState.isAirborne = false;
    isClimbing = false;
    climbWall = null;
    climbRotation = 0;
    isPerched = false;
    const clientX = customEvent.detail?.x ?? (window.innerWidth || 800) / 2;
    const clientY = customEvent.detail?.y ?? (window.innerHeight || 600) - PET_SIZE;

    const nextX = Math.min(Math.max(20, clientX - PET_SIZE / 2), (window.innerWidth || 800) - PET_SIZE - 20);
    const nextY = Math.min(Math.max(20, clientY - PET_SIZE / 2), (window.innerHeight || 600) - PET_SIZE);
    const feet = { x: nextX + PET_SIZE / 2, y: nextY + PET_SIZE - FEET_INSET };

    // Su hebra baja del Nexo hasta el cursor y de su ovillo brota: nunca aparece de golpe.
    // Mientras la hebra cae, la mascota ya está oculta en su sitio nuevo.
    const started = startMoment('hebra-invocacion', {}, {
      at: feet,
      onHold: async (player) => {
        fxHidden = false;
        portalAnim = 'sprouting';
        play('summon');
        await wait(THROUGH_PORTAL_MS);
        portalAnim = '';
        player.release(performance.now());
      },
      onDone: () => {
        fxLock = false;
      },
    });
    if (started) {
      fxLock = true;
      fxHidden = true;
    }
    posX = nextX;
    posY = nextY;
    if (!started) play('summon');
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
    setPetOnScreen(!petAway);
    unregisterTravel = registerTravelPresenter();
    if (entrance === 'altar' && !petAway) emergeFromAltar();
    // Inicializar loop de animación
    animRafId = requestAnimationFrame(renderLoop);

    window.addEventListener('petai:summon', handleQuickSummon);
    window.addEventListener('petai:pomodoro_event', handlePomodoroEvent);

    // Ciclo de comportamiento de la mascota en pantalla
    moveInterval = setInterval(async () => {
      if (petAway || travelBusy || fxLock) return;
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
        // Estela del Flujo donde estaba (se queda atrás mientras corre)
        playMinor('estela-flujo', { dir: direction }, { x: posX + PET_SIZE / 2, y: posY + PET_SIZE - FEET_INSET });
        posX += Math.min(Math.abs(diff), 60) * direction;
        walkUntil = performance.now() + 900;
        play('run');
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
      if (petAway || travelBusy || isSleeping || isDragging || isHighFiveWaiting || speechBusy()) return;
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
    unregisterTravel();
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
<!-- Portal de hebras del Nexo: por él se va de visita y vuelve (detrás de la mascota) -->
{#if portal}
  {#key portal.id}
    <EffectLayer
      def={portalNexo}
      player={portal.player}
      x={portal.x}
      y={portal.y}
      palette={portalPalette}
      seed={portalSeed}
      reduced={reducedMotion}
    />
  {/key}
{/if}

<!-- Efectos de momento, menores y de ambiente: siguen los pies de la mascota salvo que tengan un punto fijo -->
{#each [...ambients, ...moments, ...minors] as m (m.id)}
  <EffectLayer
    def={m.def}
    player={m.player}
    x={m.at ? m.at.x : posX + recoilOffsetX + PET_SIZE / 2}
    y={m.at ? m.at.y : posY + PET_SIZE - FEET_INSET}
    palette={m.palette}
    seed={portalSeed}
    params={m.params}
    reduced={reducedMotion}
  />
{/each}

<div
  class="pet-container"
  role="button"
  tabindex={petAway ? -1 : 0}
  class:fx-hidden={fxHidden}
  class:fx-lock={fxLock}
  aria-hidden={petAway}
  class:away={petAway}
  class:traveling={travelBusy}
  class:entering-portal={portalAnim === 'entering'}
  class:exiting-portal={portalAnim === 'exiting'}
  class:sprouting={portalAnim === 'sprouting'}
  aria-label="{pet.nickname || pet.species?.name || 'Tu Pockai'}, nivel {pet.level}. {isHighFiveWaiting ? 'Pulsa Enter para chocar los cinco' : 'Pulsa Enter para abrir su panel'}"
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
  on:keydown={(e) => e.key === 'Enter' && (isHighFiveWaiting ? handleClick() : onPetClick())}
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
    style="--dir: {direction}; transform: scaleX({direction}) rotate({climbRotation}deg) scale({squashScaleX}, {squashScaleY});"
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
    <EnvironmentalOverlay environmental={environmental} part="accessory" weatherFx={!!climaKind} />
  </div>

  <!-- Mascotas de los amigos de visita (feature 021): junto a la mía, sin su transformación -->
  {#each shownVisitors as s (s.v.visitorId)}
    <VisitorPet visitor={s.v} leaving={s.leaving} on:gone={(e) => visitorGone(e.detail)} />
  {/each}

  <!-- Texto ambiental, bocadillo, nombre y partículas: sin girar ni rotar -->
  <EnvironmentalOverlay environmental={environmental} part="caption" />

  {#if $currentSpeech}
    {#key $currentSpeech.id}
      <div class="speech" class:below={posY < 110} style="--speech-shift: {speechShift}px" aria-hidden="true">{#each parseBold($currentSpeech.text) as part}{#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</div>
    {/key}
  {/if}
  <!-- Región viva estable: si se recreara con cada mensaje, los lectores de pantalla no lo anunciarían -->
  <div class="sr-only" role="status" aria-live="polite">{($currentSpeech?.text ?? '').split('**').join('')}</div>

  {#if isHighFiveWaiting}
    <div class="high-five-badge" title="¡Haz clic para chocar los cinco!">
      <Ico n="hand" size={13} /> <span>¡Choca!</span>
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
    transition: left var(--dur-2) ease-out, top var(--dur-2) ease-out;
    z-index: var(--z-pet);
    pointer-events: auto;
  }

  .pet-container:active {
    cursor: grabbing;
  }

  .pet-container.dragging {
    transition: none;
    /* Por encima del panel de control (z-index 100) para "meterla" en casa arrastrando */
    z-index: var(--z-popover);
  }

  .pet-container.over-home .pet-body {
    filter: drop-shadow(0 0 14px rgba(52, 211, 153, 0.95));
  }

  .pet-container.entering-home {
    z-index: var(--z-popover);
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

  /* Brota del ovillo de la hebra de invocación: crece desde los pies */
  .pet-container.sprouting .pet-body {
    transform-origin: 50% 96%;
    animation: sprout 0.44s ease-out both;
  }
  .pet-container.sprouting .pet-badge {
    opacity: 0;
  }
  @keyframes sprout {
    from {
      transform: scaleX(calc(var(--dir, 1) * 0.3)) scaleY(0.05);
      filter: brightness(2.4);
      opacity: 0;
    }
    55% {
      transform: scaleX(calc(var(--dir, 1) * 0.9)) scaleY(1.15);
      filter: brightness(1.5);
      opacity: 1;
    }
    to {
      transform: scaleX(var(--dir, 1)) scaleY(1);
      filter: brightness(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pet-container.sprouting .pet-body {
      animation: none;
    }
  }

  /* De visita por las hebras del Nexo: fuera de pantalla, sin zona de clic. */
  .pet-container.away {
    visibility: hidden;
    pointer-events: none;
  }
  /* Los amigos de visita siguen viéndose aunque tu Pockai esté fuera o tapado: un hijo puede volver a
     ser visible con el padre oculto (sus reglas propias lo ocultan mientras cruza su portal) */
  .pet-container.away :global(.visitor),
  .pet-container.fx-hidden :global(.visitor) {
    visibility: visible;
  }
  /* Tapada por un efecto (capullo, hebra que aún cae): ni se ve ni recibe clics */
  .pet-container.fx-hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .pet-container.fx-lock {
    pointer-events: none;
  }
  .pet-container.traveling {
    pointer-events: none;
    /* El paseo hasta el portal: paso constante, no el deslizamiento corto de siempre */
    transition: left 0.76s linear, top 0.76s linear;
  }
  /* Encoge hacia la boca del portal (unos 40 px por encima de los pies) y se funde con el Éter */
  .pet-container.entering-portal .pet-body {
    transform-origin: 50% 70%;
    animation: enterPortal 0.44s ease-in forwards;
  }
  .pet-container.exiting-portal .pet-body {
    transform-origin: 50% 70%;
    animation: enterPortal 0.44s ease-out reverse both;
  }
  .pet-container.entering-portal .pet-badge,
  .pet-container.exiting-portal .pet-badge {
    opacity: 0;
  }
  /* La animación pisa el transform en línea: se repite el giro (--dir) para que no mire al revés */
  @keyframes enterPortal {
    from {
      transform: scaleX(var(--dir, 1)) translateY(0) scale(1);
      filter: brightness(1);
      opacity: 1;
    }
    60% {
      filter: brightness(1.6);
      opacity: 1;
    }
    to {
      transform: scaleX(var(--dir, 1)) translateY(-30px) scale(0.12);
      filter: brightness(2.4);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pet-container.entering-portal .pet-body,
    .pet-container.exiting-portal .pet-body {
      animation: fadePortal 0.22s linear forwards;
    }
    .pet-container.exiting-portal .pet-body {
      animation-direction: reverse;
    }
    @keyframes fadePortal {
      to {
        opacity: 0;
      }
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
    padding: 3px var(--space-2);
    border-radius: var(--radius-pills);
    border: 1.5px solid var(--on-color);
    font-size: var(--text-caption);
    font-weight: 800;
    box-shadow: 2px 2px 0 var(--on-color);
    animation: highFiveBounce 0.5s infinite alternate ease-in-out;
    cursor: pointer;
    white-space: nowrap;
    z-index: calc(var(--z-pet) + 10);
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
    transition: transform var(--dur-1) ease-out;
  }

  .pet-container.dragging .pet-body {
    transition: none;
  }

  .pet-canvas {
    position: relative;
    z-index: var(--z-raised);
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
    /* Cerca de un borde de la pantalla se desplaza para no salirse */
    translate: var(--speech-shift, 0px) 0;
    overflow-wrap: anywhere;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    color: var(--ink);
    border: var(--outline);
    font-size: var(--text-label);
    line-height: 1.35;
    text-align: center;
    box-shadow: var(--shadow-3);
    pointer-events: none;
    z-index: calc(var(--z-pet) + 10);
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
    left: calc(50% - var(--speech-shift, 0px));
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
    padding: 2px var(--space-2);
    border-radius: var(--radius-2xl);
    font-size: var(--text-caption);
    font-weight: 600;
    white-space: nowrap;
    display: flex;
    gap: var(--space-1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--line-soft);
    pointer-events: none;
    z-index: calc(var(--z-pet) + 5);
  }

  .pet-lvl {
    color: var(--warning-ink);
  }

  .floating-bubble {
    position: absolute;
    top: -15px;
    right: 6px;
    font-size: var(--text-subheading);
    animation: floatUp 1.8s ease-out forwards;
    pointer-events: none;
    z-index: calc(var(--z-pet) + 8);
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
    z-index: var(--z-base);
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
