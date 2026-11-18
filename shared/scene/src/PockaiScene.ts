/**
 * Escena de Pockai: envuelve la `Application` de PixiJS y aplica los mensajes del anfitrión.
 *
 * Dos modos:
 *  - Solo Pockai (sin sala): el Pockai sobre fondo transparente, del tamaño que quepa.
 *  - Sala (`setRoom`): la sala isométrica (`IsoRoom`) encajada en el lienzo, con el Pockai dentro.
 */
import { Application, Rectangle } from 'pixi.js';
import { resolveAccessory, resolveSheet, PATTERNS } from './assets';
import { bakeSheet, loadImage } from './bake/bakeTexture';
import { PATTERN_FX } from './bake/patternFx';
import { isLightPrimary } from './bake/bakePixels';
import { ACCESSORY_SLOTS } from './bake/accessories';
import type { AccessoryLayer } from './pet/PetSprite';
import { PetSprite, FRAME } from './pet/PetSprite';
import { IsoRoom } from './room/IsoRoom';
import { styleFor } from './room/roomStyles';
import { Ambience, NO_AMBIENCE, type AmbienceState } from './ambience/Ambience';
import {
  PROTOCOL_VERSION,
  type Activity,
  type HostMessage,
  type PetState,
  type RoomState,
  type SceneEvent,
  type ThemeMode,
} from './protocol';

export interface SceneOptions {
  /** Elemento donde se inserta el canvas (o canvas existente). */
  host: HTMLElement | HTMLCanvasElement;
  onEvent?: (event: SceneEvent) => void;
  /** Tamaño en px CSS del Pockai en pantalla (alto del frame), en modo solo Pockai. */
  petSize?: number;
  reducedMotion?: boolean;
  /** Pausar el ticker cuando la página no se ve (por defecto, sí). */
  pauseWhenHidden?: boolean;
  /** Texto accesible del lienzo. */
  label?: string;
}

const ROOM_PADDING = 8;

export class PockaiScene {
  readonly app = new Application();
  private pet!: PetSprite;
  private room: IsoRoom | null = null;
  private petState: PetState | null = null;
  private loadSeq = 0;
  private paused = false;
  private theme: ThemeMode = 'light';
  private reducedMotion = false;
  // Estado de sala que puede llegar antes que la propia sala
  private activity: Activity = 'idle';
  private rest = 'idle';
  private night = false;
  private edit = false;
  /** Cielo y clima de la sala; solo existe mientras hay sala (el Pockai suelto va sin fondo). */
  private ambience: Ambience | null = null;
  private ambienceState: AmbienceState = NO_AMBIENCE;
  private disposers: (() => void)[] = [];

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
      onClipEnded: (clip) => this.emit({ type: 'clipEnded', clip }),
    });
    this.pet.eventMode = 'static';
    this.pet.cursor = 'pointer';
    this.pet.on('pointertap', () => this.emit({ type: 'petTapped' }));
    this.app.stage.addChild(this.pet);
    // Escenario interactivo en toda su área: arrastres de muebles y clics en vacío.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, 1e6, 1e6);
    this.app.stage.on('pointerdown', (e) => {
      if (e.target === this.app.stage && this.room?.editing) this.room.select(null);
    });
    this.app.ticker.add((t) => {
      this.pet.update(t);
      this.ambience?.update(t.deltaMS);
      this.room?.update(t);
    });
    this.app.renderer.on('resize', () => this.layout());
    this.layout();

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
        if (msg.once) this.pet.play(msg.clip, true);
        else this.pet.setBaseClip(msg.clip);
        break;
      case 'setTheme':
        this.theme = msg.mode;
        break;
      case 'setPaused':
        this.paused = msg.paused;
        this.applyPaused();
        break;
      case 'setFacing':
        this.pet.setFacing(msg.facing);
        break;
      case 'setRoom':
        this.setRoom(msg.room);
        break;
      case 'setActivity':
        this.activity = msg.activity;
        this.rest = msg.rest ?? 'idle';
        this.room?.setActivity(msg.activity, this.rest);
        if (!this.room) this.pet.visible = msg.activity !== 'away';
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
        this.ambience?.set(this.ambienceState);
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
    }
  }

  get themeMode(): ThemeMode {
    return this.theme;
  }

  private setRoom(state: RoomState | null): void {
    if (!state) {
      if (this.room) {
        this.room.removeChild(this.pet);
        this.app.stage.removeChild(this.room);
        this.room.destroy({ children: true });
        this.room = null;
        this.ambience?.destroy();
        this.ambience = null;
        this.app.stage.addChild(this.pet);
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
      this.room.setActivity(this.activity, this.rest);
      this.room.setNight(this.night);
      this.room.setEditMode(this.edit);
      // Cielo detrás de la sala y clima por delante.
      const room = this.room;
      this.ambience = new Ambience({
        reducedMotion: this.reducedMotion,
        onSky: (sky, look) => room.setSky(sky, look),
        onLightning: () => room.startle(),
      });
      this.app.stage.addChildAt(this.ambience.back, 0);
      this.app.stage.addChild(this.ambience.front);
      this.ambience.setEdit(this.edit);
      this.ambience.set(this.ambienceState);
    } else {
      this.room.setRoom(state);
    }
    this.ambience?.setExterior(!!styleFor(state.id).exterior);
    this.layout();
  }

  private async setPet(state: PetState): Promise<void> {
    const seq = ++this.loadSeq;
    this.petState = state;
    try {
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
      if (seq !== this.loadSeq) return; // llegó otro setPet mientras horneábamos
      this.pet.setSheet(canvas, sheet.anim);
      // El huevo no lleva efectos: ni patrón ni brillo de shiny.
      const egg = state.stage === 'egg';
      this.pet.setFx(egg ? null : fxMap, width, (state.pattern && PATTERN_FX[state.pattern]) || null, !egg && state.shiny === true, isLightPrimary(state.palette.primary));
      this.pet.setAccessories(layers, sheet.anchors);
      this.layout();
      this.emit({ type: 'petLoaded', species: key.split('/')[0], stage: state.stage });
    } catch (e) {
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    this.ambience?.resize(width, height);
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

  /** Imagen del Pockai tal como se ve ahora (para el «fantasma» al arrastrarlo). */
  petSnapshot(): HTMLCanvasElement | null {
    if (!this.pet.texture) return null;
    return this.app.renderer.extract.canvas(this.pet.texture) as HTMLCanvasElement;
  }

  destroy(): void {
    this.disposers.forEach((d) => d());
    this.app.destroy(true, { children: true });
  }
}
