/**
 * Escena de Pockai: envuelve la `Application` de PixiJS y aplica los mensajes del anfitrión.
 * En esta fase muestra al Pockai sobre fondo transparente; la sala isométrica llega en la fase 5
 * (`IsoRoom`) sobre esta misma escena.
 */
import { Application } from 'pixi.js';
import { resolveSheet, PATTERNS } from './assets';
import { bakeToCanvas } from './bake/bakeTexture';
import { PetSprite, FRAME } from './pet/PetSprite';
import { PROTOCOL_VERSION, type HostMessage, type PetState, type SceneEvent, type ThemeMode } from './protocol';

export interface SceneOptions {
  /** Elemento donde se inserta el canvas (o canvas existente). */
  host: HTMLElement | HTMLCanvasElement;
  onEvent?: (event: SceneEvent) => void;
  /** Tamaño en px CSS del Pockai en pantalla (alto del frame). Por defecto, el que quepa. */
  petSize?: number;
  reducedMotion?: boolean;
  /** Pausar el ticker cuando la página no se ve (por defecto, sí). */
  pauseWhenHidden?: boolean;
}

export class PockaiScene {
  readonly app = new Application();
  private pet!: PetSprite;
  private petState: PetState | null = null;
  private loadSeq = 0;
  private paused = false;
  private theme: ThemeMode = 'light';
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
    this.app.canvas.style.display = 'block';

    const reducedMotion =
      this.opts.reducedMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.pet = new PetSprite({
      reducedMotion,
      onClipEnded: (clip) => this.emit({ type: 'clipEnded', clip }),
    });
    this.pet.eventMode = 'static';
    this.pet.cursor = 'pointer';
    this.pet.on('pointertap', () => this.emit({ type: 'petTapped' }));
    this.app.stage.addChild(this.pet);
    this.app.ticker.add((t) => this.pet.update(t));
    this.app.renderer.on('resize', () => this.layout());
    this.layout();

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
    }
  }

  get themeMode(): ThemeMode {
    return this.theme;
  }

  private async setPet(state: PetState): Promise<void> {
    const seq = ++this.loadSeq;
    this.petState = state;
    try {
      const { key, sheet } = resolveSheet(state.species, state.stage);
      const canvas = await bakeToCanvas({
        key,
        base: sheet.base,
        mask: sheet.mask,
        pattern: state.pattern ? (PATTERNS[state.pattern] ?? null) : null,
        palette: state.palette,
        visualSeed: state.visualSeed,
      });
      if (seq !== this.loadSeq) return; // llegó otro setPet mientras horneábamos
      this.pet.setSheet(canvas, sheet.anim);
      this.layout();
      this.emit({ type: 'petLoaded', species: key.split('/')[0], stage: state.stage });
    } catch (e) {
      this.emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private layout(): void {
    const { width, height } = this.app.screen;
    const size = this.opts.petSize ?? Math.min(width, height);
    const s = size / FRAME;
    this.pet.scale.set(s);
    this.pet.position.set(width / 2, height - (FRAME - 120 - 4) * s);
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

  destroy(): void {
    this.disposers.forEach((d) => d());
    this.app.destroy(true, { children: true });
  }
}
