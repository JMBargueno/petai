/**
 * Escena de Pockai: envuelve la `Application` de PixiJS y aplica los mensajes del anfitrión.
 *
 * Tres modos (excluyentes):
 *  - Solo Pockai (sin sala): el Pockai sobre fondo transparente, del tamaño que quepa.
 *  - Sala (`setRoom`): la sala isométrica (`IsoRoom`) encajada en el lienzo, con el Pockai dentro.
 *  - Historia (`setStory`): escenario por capas de la aventura diaria (`StoryStage`), con el Pockai
 *    entrando por la izquierda y saliendo por la derecha.
 */
import { Application, Container, Rectangle } from 'pixi.js';
import { resolveAccessory, resolveSheet, PATTERNS } from './assets';
import { bakeSheet, loadImage } from './bake/bakeTexture';
import { PATTERN_FX } from './bake/patternFx';
import { isLightPrimary } from './bake/bakePixels';
import { ACCESSORY_SLOTS } from './bake/accessories';
import type { AccessoryLayer } from './pet/PetSprite';
import { PetSprite, FRAME } from './pet/PetSprite';
import { IsoRoom } from './room/IsoRoom';
import type { RoomMind } from './room/petWander';
import { styleFor } from './room/roomStyles';
import { Ambience, NO_AMBIENCE, type AmbienceState } from './ambience/Ambience';
import { loadBackdrop } from './ambience/backdrops';
import { PixiEffects } from './effects/pixiLayer';
import { PixiScreenFx } from './effects/screenLayer';
import { effectForPetAction } from './effects/reactions';
import { clipsForPetAction } from './effects/clips';
import { flowPalette } from './effects/palettes';
import { speciesElement } from './effects/speciesElement';
import { StoryStage } from './story/StoryStage';
import {
  PROTOCOL_VERSION,
  type Activity,
  type BackdropMode,
  type HostMessage,
  type PetState,
  type RoomState,
  type SceneEvent,
  type StoryState,
  type ThemeMode,
  type ThemePalette,
} from './protocol';

/** Hora (minuto del día) y clima (código WMO) de una escena de historia con ambiente propio. */
const STORY_CLOCK = { dawn: 7 * 60 + 40, day: 13 * 60, dusk: 20 * 60 + 10, night: 23 * 60 } as const;
const STORY_WMO = { clear: 0, rain: 63, snow: 73, fog: 45, storm: 95 } as const;

export interface SceneOptions {
  /** Elemento donde se inserta el canvas (o canvas existente). */
  host: HTMLElement | HTMLCanvasElement;
  onEvent?: (event: SceneEvent) => void;
  /**
   * Sonidos de los efectos (spec 40): candidatos en orden; el anfitrión reproduce el primero que
   * tenga. La escena no suena por sí misma: el escritorio y el embed traen su motor @pockai/audio.
   */
  onSound?: (ids: string[]) => void;
  /** Tamaño en px CSS del Pockai en pantalla (alto del frame), en modo solo Pockai. */
  petSize?: number;
  reducedMotion?: boolean;
  /** Pausar el ticker cuando la página no se ve (por defecto, sí). */
  pauseWhenHidden?: boolean;
  /**
   * Reajustar el lienzo cuando cambie el tamaño del contenedor (no solo el de la ventana). Solo
   * para contenedores de tamaño fijo, como una ventanita redimensionable: con alto automático
   * podría crecer sin fin.
   */
  observeResize?: boolean;
  /**
   * Solo la sala: sin cielo, paisaje pintado ni clima por delante (el lienzo es transparente
   * alrededor). La luz del día y de la noche sigue aplicándose a la sala.
   */
  bare?: boolean;
  /** Texto accesible del lienzo. */
  label?: string;
}

const ROOM_PADDING = 8;
/** Lo más que el capullo espera a la nueva etapa antes de abrirse igualmente. */
const EVOLVE_WAIT_MS = 5000;
/** Si la etapa cambió hace menos de esto, `evolved` llega tarde: el capullo no espera. */
const STAGE_RECENT_MS = 3000;

export class PockaiScene {
  readonly app = new Application();
  private pet!: PetSprite;
  private room: IsoRoom | null = null;
  private story: StoryStage | null = null;
  private petState: PetState | null = null;
  private loadSeq = 0;
  private paused = false;
  private theme: ThemeMode = 'light';
  /** Tema de la app anfitriona y su paleta de canvas: quedan listos para teñir efectos. */
  private themeId = 'classic';
  private themePalette: ThemePalette | null = null;
  private reducedMotion = false;
  // Estado de sala que puede llegar antes que la propia sala
  private activity: Activity = 'idle';
  private rest = 'idle';
  private mind: RoomMind | null = null;
  /** Pockai de visita: solo se dibuja dentro de una sala. */
  private guest: PetSprite | null = null;
  private guestState: PetState | null = null;
  private guestSeq = 0;
  /** Escena pedida antes de que el visitante estuviera horneado: se lanza en cuanto esté. */
  private pendingScene: string | null = null;
  private night = false;
  private edit = false;
  /** Cielo y clima de la sala; solo existe mientras hay sala (el Pockai suelto va sin fondo). */
  private ambience: Ambience | null = null;
  private ambienceState: AmbienceState = NO_AMBIENCE;
  /** Modo híbrido: paisaje pintado detrás de la sala (si la sala lo tiene). */
  private backdropMode: BackdropMode = 'painted';
  private backdropRoom: string | null = null;
  private backdropSeq = 0;
  /** Ambiente propio de la escena de historia en curso (si lo trae). */
  private storyMood: StoryState['mood'] | null = null;
  private disposers: (() => void)[] = [];
  /** Efectos compartidos (@pockai/scene/effects) colgados del Pockai. */
  private effects!: PixiEffects;
  /** Transiciones que tapan todo el lienzo (velo de Éter), siempre por encima de lo demás. */
  private screenFx!: PixiScreenFx;
  private readonly screenLayer = new Container();
  /** Clips que faltan de la reacción en curso a un `petAction` (se encadenan al acabar cada uno). */
  private clipQueue: string[] = [];
  /** Hay un capullo de evolución esperando a que llegue y se hornee la nueva etapa. */
  private awaitingRebake = false;
  /** Cuándo cambió por última vez la etapa del Pockai (por si `setPet` llega antes que `evolved`). */
  private stageChangedAt = -Infinity;

  private constructor(private readonly opts: SceneOptions) {}

  static async create(opts: SceneOptions): Promise<PockaiScene> {
    const scene = new PockaiScene(opts);
    await scene.init();
    return scene;
  }

  private async init(): Promise<void> {
    const { host } = this.opts;
    const isCanvas = host instanceof HTMLCanvasElement;
    const sizeEl = isCanvas ? (host.parentElement ?? host) : host;
    await this.app.init({
      canvas: isCanvas ? host : undefined,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: sizeEl,
      preference: 'webgl',
    });
    if (!isCanvas) host.appendChild(this.app.canvas);
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    if (this.opts.label) canvas.setAttribute('aria-label', this.opts.label);

    this.reducedMotion =
      this.opts.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.pet = new PetSprite({
      reducedMotion: this.reducedMotion,
      onClipEnded: (clip) => {
        this.emit({ type: 'clipEnded', clip });
        this.playNextClip();
      },
    });
    this.pet.eventMode = 'static';
    this.pet.cursor = 'pointer';
    this.pet.on('pointertap', () => this.emit({ type: 'petTapped' }));
    this.app.stage.addChild(this.pet);
    this.effects = new PixiEffects(this.pet, {
      reducedMotion: this.reducedMotion,
      palette: () => flowPalette(speciesElement(this.petState?.species)),
      seed: () => this.petState?.visualSeed ?? 1,
      onEnded: (id) => this.emit({ type: 'effectEnded', id }),
      onSound: (ids) => this.opts.onSound?.(ids),
    });
    this.app.stage.addChild(this.screenLayer);
    this.screenFx = new PixiScreenFx(this.screenLayer, {
      reducedMotion: this.reducedMotion,
      palette: () => flowPalette(speciesElement(this.petState?.species)),
      seed: () => this.petState?.visualSeed ?? 1,
      viewport: () => this.app.screen,
      onCovered: () => this.emit({ type: 'screenCovered' }),
      onSound: (ids) => this.opts.onSound?.(ids),
      onUncovered: () => this.emit({ type: 'screenUncovered' }),
    });
    // Escenario interactivo en toda su área: arrastres de muebles y clics en vacío.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, 1e6, 1e6);
    this.app.stage.on('pointerdown', (e) => {
      if (e.target === this.app.stage && this.room?.editing) this.room.select(null);
    });
    this.app.ticker.add((t) => {
      this.pet.update(t);
      this.guest?.update(t);
      this.effects.update(t.deltaMS);
      this.screenFx.update(t.deltaMS);
      this.ambience?.update(t.deltaMS);
      this.room?.update(t);
      this.story?.update(t.deltaMS);
    });
    this.app.renderer.on('resize', () => this.layout());
    this.layout();
    // `resizeTo` solo atiende al resize de la ventana: si el contenedor cambia de tamaño por su
    // cuenta (p. ej. la ventanita redimensionable del modo hábitat), se reajusta igualmente.
    if (this.opts.observeResize && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.app.queueResize());
      ro.observe(sizeEl);
      this.disposers.push(() => ro.disconnect());
    }

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    canvas.addEventListener('keydown', onKey);
    this.disposers.push(() => canvas.removeEventListener('keydown', onKey));
    if (this.opts.pauseWhenHidden !== false) {
      const onVis = () => this.applyPaused();
      document.addEventListener('visibilitychange', onVis);
      this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));
    }
    this.emit({ type: 'ready', protocol: PROTOCOL_VERSION });
  }

  /** Aplica un mensaje del anfitrión (ya validado con `parseHostMessage`). */
  receive(msg: HostMessage): void {
    switch (msg.type) {
      case 'setPet':
        void this.setPet(msg.pet);
        break;
      case 'playClip':
        this.clipQueue = []; // una orden explícita del anfitrión manda sobre la reacción en curso
        if (msg.once) this.pet.play(msg.clip, true);
        else this.pet.setBaseClip(msg.clip);
        break;
      case 'setTheme':
        this.theme = msg.mode;
        this.themeId = msg.themeId ?? this.themeId;
        this.themePalette = msg.palette ?? this.themePalette;
        break;
      case 'setPaused':
        this.paused = msg.paused;
        this.applyPaused();
        break;
      case 'setFacing':
        this.pet.setFacing(msg.facing);
        break;
      case 'setRoom':
        // Sala e historia son excluyentes: pedir una sala sale del modo historia
        if (msg.room && this.story) this.setStory(null);
        this.setRoom(msg.room);
        break;
      case 'setStory':
        this.setStory(msg.story);
        break;
      case 'setActivity':
        this.activity = msg.activity;
        this.rest = msg.rest ?? 'idle';
        // Un mensaje sin `mind` no borra el anterior: el anfitrión puede mandarlo solo cuando cambia
        if (msg.mind) this.mind = msg.mind;
        this.room?.setMind(this.mind);
        this.room?.setActivity(msg.activity, this.rest);
        if (!this.room && !this.story) this.pet.visible = msg.activity !== 'away';
        break;
      case 'setGuest':
        void this.setGuest(msg.pet);
        break;
      case 'playScene':
        if (this.room?.hasGuest) this.room.playScene(msg.scene);
        else if (this.guestState) this.pendingScene = msg.scene;
        break;
      case 'setNight':
        this.night = msg.night;
        this.room?.setNight(msg.night);
        break;
      case 'setAmbience':
        this.ambienceState = {
          weather: msg.weather === undefined ? this.ambienceState.weather : msg.weather,
          sun: msg.sun === undefined ? this.ambienceState.sun : msg.sun,
          clock: msg.clock === undefined ? this.ambienceState.clock : msg.clock,
        };
        if (this.story) this.syncStoryAmbience();
        else this.ambience?.set(this.ambienceState);
        if (msg.backdrop && msg.backdrop !== this.backdropMode) {
          this.backdropMode = msg.backdrop;
          void this.syncBackdrop();
        }
        break;
      case 'setEditMode':
        this.edit = msg.edit;
        this.room?.setEditMode(msg.edit);
        this.ambience?.setEdit(msg.edit);
        break;
      case 'selectItem':
        this.room?.select(msg.itemId);
        break;
      case 'rotateSelected':
        this.room?.rotateSelected();
        break;
      case 'coverScreen':
        this.cover(msg.effect);
        break;
      case 'uncoverScreen':
        this.uncover();
        break;
      case 'setAudio':
        // Lo atiende el motor de sonido del anfitrión (embed/audio.ts), no la escena.
        break;
      case 'playEffect':
        this.effects.play(msg.id, msg.params ?? {});
        break;
      case 'petAction': {
        // La misma tabla que el escritorio decide el efecto de cada aviso del backend
        const req = effectForPetAction(msg.action, msg.context);
        if (req) {
          // El capullo tapa a la mascota mientras se hornea su nueva etapa: espera a `setPet`
          // (como mucho EVOLVE_WAIT_MS), salvo que la etapa ya haya cambiado justo antes.
          const evolving = req.id === 'capullo-telar' && performance.now() - this.stageChangedAt > STAGE_RECENT_MS;
          const played = this.effects.play(req.id, req.params, evolving ? { holdMs: EVOLVE_WAIT_MS } : {});
          this.awaitingRebake = evolving && played;
        }
        // Y las mismas animaciones que el escritorio, en cola
        const clips = clipsForPetAction(msg.action, msg.context);
        if (clips?.length) {
          this.clipQueue = [...clips];
          this.playNextClip();
        }
        break;
      }
    }
  }

  /** Pone el siguiente clip de la cola (saltando los que esta hoja no tenga). */
  private playNextClip(): void {
    while (this.clipQueue.length) {
      if (this.pet.play(this.clipQueue.shift()!, true)) return;
    }
  }

  get themeMode(): ThemeMode {
    return this.theme;
  }

  /** Tema de la app (`classic`, `cozy`…) y su paleta, tal como los mandó el anfitrión. */
  get appTheme(): { id: string; palette: ThemePalette | null } {
    return { id: this.themeId, palette: this.themePalette };
  }

  private setRoom(state: RoomState | null): void {
    if (!state) {
      if (this.room) {
        // El visitante es de la sala: sin sala no se dibuja (su aspecto se conserva por si vuelve)
        this.room.setGuest(null);
        this.room.removeChild(this.pet);
        this.app.stage.removeChild(this.room);
        this.room.destroy({ children: true });
        this.room = null;
        this.ambience?.destroy();
        this.ambience = null;
        this.backdropRoom = null;
        this.app.stage.addChild(this.pet);
        this.raiseScreen();
        this.pet.zIndex = 0;
        this.pet.visible = this.activity !== 'away';
      }
      this.layout();
      return;
    }
    if (!this.room) {
      this.app.stage.removeChild(this.pet);
      this.room = new IsoRoom({ pet: this.pet, emit: (e) => this.emit(e), reducedMotion: this.reducedMotion });
      this.app.stage.addChildAt(this.room, 0);
      this.room.setRoom(state);
      if (this.guest) this.room.setGuest(this.guest);
      this.room.setMind(this.mind);
      this.room.setActivity(this.activity, this.rest);
      this.room.setNight(this.night);
      this.room.setEditMode(this.edit);
      // Cielo detrás de la sala y clima por delante.
      const room = this.room;
      this.ambience = new Ambience({
        reducedMotion: this.reducedMotion,
        onSky: (sky, look) => room.setSky(sky, look),
        onLightning: () => room.lightning(),
      });
      this.app.stage.addChildAt(this.ambience.back, 0);
      this.app.stage.addChild(this.ambience.front);
      if (this.opts.bare) {
        this.ambience.back.visible = false;
        this.ambience.front.visible = false;
      }
      this.raiseScreen();
      this.ambience.setEdit(this.edit);
      this.ambience.set(this.ambienceState);
    } else {
      this.room.setRoom(state);
    }
    this.ambience?.setExterior(!!styleFor(state.id).exterior);
    if (state.id !== this.backdropRoom) {
      this.backdropRoom = state.id;
      void this.syncBackdrop();
    }
    this.layout();
  }

  /** Entra en el modo historia, actualiza la escena en curso o sale de él (`null`). */
  private setStory(state: StoryState | null): void {
    if (!state) {
      if (this.story) {
        this.story.release();
        this.app.stage.removeChild(this.story);
        this.story = null;
        this.ambience?.destroy();
        this.ambience = null;
        this.app.stage.addChild(this.pet);
        this.pet.setBaseClip(this.rest || 'idle');
        this.pet.visible = this.activity !== 'away';
      }
      this.layout();
      return;
    }
    if (this.room) this.setRoom(null);
    if (!this.story) {
      this.app.stage.removeChild(this.pet);
      const story = new StoryStage({
        pet: this.pet,
        emit: (e) => this.emit(e),
        reducedMotion: this.reducedMotion,
        playFx: (id) => this.effects.play(id, {}),
      });
      this.story = story;
      this.app.stage.addChildAt(story, 0);
      // Cielo vivo detrás del escenario y lluvia o nieve por delante, como en las salas exteriores
      this.ambience = new Ambience({
        reducedMotion: this.reducedMotion,
        onSky: (sky) => story.setSky(sky),
        onLightning: () => story.flash(),
      });
      this.ambience.setExterior(true);
      this.app.stage.addChildAt(this.ambience.back, 0);
      this.app.stage.addChild(this.ambience.front);
    }
    this.layout();
    this.story.set(state);
    this.storyMood = state.mood ?? null;
    this.syncStoryAmbience();
  }

  /** Hora y clima del modo historia: los de la escena si los trae; si no, los reales del anfitrión. */
  private syncStoryAmbience(): void {
    const mood = this.storyMood;
    this.ambience?.set({
      sun: this.ambienceState.sun,
      clock: mood?.timeOfDay ? STORY_CLOCK[mood.timeOfDay] : this.ambienceState.clock,
      weather: mood?.weather ? { code: STORY_WMO[mood.weather], temperature: mood.weather === 'snow' ? -2 : 16 } : this.ambienceState.weather,
    });
  }

  /** Pone (o quita) el fondo pintado de la sala actual según el modo elegido por el anfitrión. */
  private async syncBackdrop(): Promise<void> {
    const seq = ++this.backdropSeq;
    const roomId = this.backdropRoom;
    // Sin fondo (solo la sala) no se carga el paisaje ni se proyecta sombra sobre él
    const texture = this.backdropMode === 'painted' && !this.opts.bare ? await loadBackdrop(roomId) : null;
    if (seq !== this.backdropSeq || !this.ambience || !this.room) return; // cambió la sala mientras cargaba
    this.ambience.setBackdrop(texture);
    this.room.setGrounded(!!texture);
  }

  /** Llega (o se va) el Pockai de un amigo que está de visita. */
  private async setGuest(state: PetState | null): Promise<void> {
    const seq = ++this.guestSeq;
    this.guestState = state;
    if (!state) {
      this.pendingScene = null;
      this.room?.setGuest(null);
      this.guest?.destroy({ children: true });
      this.guest = null;
      return;
    }
    try {
      const sprite = this.guest ?? new PetSprite({ reducedMotion: this.reducedMotion });
      const key = await this.bakeInto(sprite, state, () => seq === this.guestSeq);
      if (key === null) {
        // Llegó otro visitante (o se fue) mientras se horneaba
        if (!this.guest) sprite.destroy({ children: true });
        return;
      }
      sprite.eventMode = 'none';
      this.guest = sprite;
      this.room?.setGuest(sprite);
      if (this.pendingScene && this.room?.hasGuest) this.room.playScene(this.pendingScene);
      this.pendingScene = null;
    } catch (e) {
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * Hornea la hoja de un Pockai (paleta, patrón, prendas) y la pone en `sprite`. Devuelve la
   * clave de la hoja, o `null` si mientras tanto llegó otra petición (`isCurrent`).
   */
  private async bakeInto(sprite: PetSprite, state: PetState, isCurrent: () => boolean): Promise<string | null> {
    const { key, sheet } = resolveSheet(state.species, state.stage);
    const { canvas, fxMap, width } = await bakeSheet({
      key,
      base: sheet.base,
      mask: sheet.mask,
      pattern: state.pattern ? (PATTERNS[state.pattern] ?? null) : null,
      palette: state.palette,
      visualSeed: state.visualSeed,
    });
    // Prendas equipadas, en la talla de la etapa. Una prenda sin arte en este cliente se omite.
    const layers: AccessoryLayer[] = [];
    if (sheet.anchors) {
      for (const slot of ACCESSORY_SLOTS) {
        const id = state.accessories?.[slot];
        const acc = id ? resolveAccessory(id, sheet.anchors.size) : null;
        if (!acc || acc.meta.slot !== slot) continue;
        const img = await loadImage(acc.url).catch(() => null);
        if (img) layers.push({ slot, canvas: img, meta: acc.meta });
      }
    }
    if (!isCurrent()) return null;
    sprite.setSheet(canvas, sheet.anim);
    // El huevo no lleva efectos: ni patrón ni brillo de shiny.
    const egg = state.stage === 'egg';
    sprite.setFx(egg ? null : fxMap, width, (state.pattern && PATTERN_FX[state.pattern]) || null, !egg && state.shiny === true, isLightPrimary(state.palette.primary));
    sprite.setAccessories(layers, sheet.anchors);
    return key;
  }

  private async setPet(state: PetState): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.petState && this.petState.stage !== state.stage) this.stageChangedAt = performance.now();
    this.petState = state;
    try {
      const key = await this.bakeInto(this.pet, state, () => seq === this.loadSeq);
      if (key === null) return; // llegó otro setPet mientras horneábamos
      this.layout();
      // La nueva etapa ya está horneada: el capullo puede abrirse
      if (this.awaitingRebake) {
        this.awaitingRebake = false;
        this.effects.release('capullo-telar');
      }
      this.emit({ type: 'petLoaded', species: key.split('/')[0], stage: state.stage });
    } catch (e) {
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    this.ambience?.resize(width, height);
    if (this.story) {
      this.story.resize(width, height);
      return;
    }
    if (this.room) {
      const b = this.room.bounds();
      const bw = b.maxX - b.minX;
      const bh = b.maxY - b.minY;
      const s = Math.min((width - ROOM_PADDING * 2) / bw, (height - ROOM_PADDING * 2) / bh);
      this.room.scale.set(s);
      this.room.position.set(width / 2 - (b.minX + bw / 2) * s, height / 2 - (b.minY + bh / 2) * s);
      return;
    }
    const size = this.opts.petSize ?? Math.min(width, height);
    const s = size / FRAME;
    this.pet.scale.set(s);
    this.pet.position.set(width / 2, height - (FRAME - 120 - 4) * s);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.room?.editing) return;
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    if (moves[e.key]) {
      this.room.nudgeSelected(...moves[e.key]);
      e.preventDefault();
    } else if (e.key === 'r' || e.key === 'R') {
      this.room.rotateSelected();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.room.select(null);
    }
  }

  /** La capa de pantalla siempre encima (la sala y el clima se añaden después). */
  private raiseScreen(): void {
    this.app.stage.addChild(this.screenLayer);
  }

  /**
   * Tapa el lienzo con un efecto de pantalla (por defecto el velo de Éter) y avisa con
   * `screenCovered` cuando ya no se ve lo de detrás. Si el efecto no existe, avisa igualmente
   * para que el anfitrión no se quede esperando.
   */
  cover(effect = 'velo-eter'): void {
    if (!this.screenFx.cover(effect)) this.emit({ type: 'screenCovered' });
  }

  /** Abre el velo; avisa con `screenUncovered` al terminar. */
  uncover(): void {
    this.screenFx.uncover();
  }

  private applyPaused(): void {
    const stop = this.paused || document.visibilityState === 'hidden';
    if (stop) this.app.ticker.stop();
    else this.app.ticker.start();
  }

  private emit(event: SceneEvent): void {
    this.opts.onEvent?.(event);
  }

  get currentPet(): PetState | null {
    return this.petState;
  }

  /** Rectángulo del Pockai en coordenadas de la ventana (`null` si no se ve). */
  petClientRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.pet.visible || !this.pet.texture) return null;
    const r = this.app.canvas.getBoundingClientRect();
    const b = this.pet.getBounds();
    return { left: r.left + b.x, top: r.top + b.y, width: b.width, height: b.height };
  }

  /** ¿Hay un Pockai visible bajo este punto de la ventana? (para arrastrarlo fuera de la sala). */
  isPetAt(clientX: number, clientY: number): boolean {
    const b = this.petClientRect();
    return !!b && clientX >= b.left && clientX <= b.left + b.width && clientY >= b.top && clientY <= b.top + b.height;
  }

  /** ¿Este punto de la ventana cae sobre el lienzo de la escena? */
  containsClientPoint(clientX: number, clientY: number): boolean {
    const r = this.app.canvas.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  /** Punto de la ventana → coordenadas de la sala. */
  private roomPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.room) return null;
    const r = this.app.canvas.getBoundingClientRect();
    const p = this.room.toLocal({ x: clientX - r.left, y: clientY - r.top });
    return { x: p.x, y: p.y };
  }

  /**
   * Agarra al Pockai de la sala con el cursor en ese punto (se levanta con el clip `drag`).
   * Devuelve `false` si no hay sala, se está decorando o no está en ella.
   */
  grabPet(clientX: number, clientY: number): boolean {
    const p = this.roomPoint(clientX, clientY);
    return !!p && !!this.room?.grabPet(p.x, p.y);
  }

  /** El Pockai agarrado sigue al cursor. */
  dragPetTo(clientX: number, clientY: number): void {
    const p = this.roomPoint(clientX, clientY);
    if (p) this.room?.holdPetAt(p.x, p.y);
  }

  /** Lo suelta en ese punto: aterriza en la celda libre más cercana. */
  releasePet(clientX: number, clientY: number): void {
    const p = this.roomPoint(clientX, clientY);
    if (p) this.room?.releasePet(p.x, p.y);
    else this.room?.cancelHold();
  }

  /** Lo devuelve a su sitio sin soltarlo en la sala (p. ej. salió al escritorio). */
  cancelPetDrag(): void {
    this.room?.cancelHold();
  }

  /** Oculta al Pockai de la sala mientras el anfitrión lo dibuja fuera (arrastrándolo). */
  setPetHidden(hidden: boolean): void {
    this.room?.setPetHidden(hidden);
  }

  /** Imagen del Pockai tal como se ve ahora (para el «fantasma» al arrastrarlo). */
  petSnapshot(): HTMLCanvasElement | null {
    if (!this.pet.texture) return null;
    // Se renderiza el contenedor entero (cuerpo, prendas y orientación): extraer solo la textura
    // del frame devolvía un lienzo vacío y el Pockai no se veía al arrastrarlo fuera de la sala.
    return this.app.renderer.extract.canvas({ target: this.pet, resolution: 2 }) as HTMLCanvasElement;
  }

  destroy(): void {
    this.effects?.destroy();
    this.screenFx?.destroy();
    this.disposers.forEach((d) => d());
    this.app.destroy(true, { children: true });
  }
}
