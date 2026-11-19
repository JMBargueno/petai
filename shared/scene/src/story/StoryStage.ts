/**
 * Escena de la aventura diaria: un escenario por capas en vista lateral por el que el Pockai entra
 * andando de izquierda a derecha. Al llegar al centro ocurre el evento y la escena avisa al anfitrión
 * (`storyBeat: arrived`), que muestra las respuestas; tras responder, el Pockai reacciona y sale por
 * la derecha hacia la localización siguiente.
 *
 * Es el tercer modo de `PockaiScene` (solo Pockai / sala isométrica / historia). El estado llega
 * entero en cada `setStory` (declarativo): repetir el último mensaje tras una recarga deja la escena
 * exactamente donde estaba, sin volver a andar ni repetir avisos.
 */
import { Container, Graphics } from 'pixi.js';
import type { SkyState } from '../ambience/sunClock';
import { LOCATION_IDS, locationComposition, type Composition } from '../backdrop/model';
import { FRAME, type PetSprite } from '../pet/PetSprite';
import type { SceneEvent, StoryState } from '../protocol';
import { PixiLayeredBackdrop } from './PixiLayeredBackdrop';
import { cameraOf, setPhase, startWalk, stepWalk, type WalkState } from './walk';

interface StoryStageOptions {
  pet: PetSprite;
  emit: (event: SceneEvent) => void;
  reducedMotion: boolean;
  /** Pinta un efecto de @pockai/scene/effects junto al Pockai. */
  playFx: (id: string) => void;
}

/** Alto del Pockai respecto al del lienzo. */
const PET_HEIGHT = 0.36;
/** Dónde pisa dentro de la franja de suelo (0 = arriba, 1 = abajo). */
const FOOT_IN_BAND = 0.55;
const FADE_MS = 380;

export class StoryStage extends Container {
  private readonly backdrop: PixiLayeredBackdrop;
  private readonly flashG = new Graphics();
  private story: StoryState | null = null;
  private comp: Composition | null = null;
  private walk: WalkState = startWalk('await');
  private clock = 0;
  private w = 0;
  private h = 0;
  private fadeMs = FADE_MS;
  private flashMs = 0;
  private moving: boolean | null = null;

  constructor(private readonly opts: StoryStageOptions) {
    super();
    this.backdrop = new PixiLayeredBackdrop(opts.reducedMotion);
    this.flashG.eventMode = 'none';
    this.addChild(this.backdrop.back, opts.pet, this.backdrop.front, this.flashG);
    opts.pet.visible = true;
    opts.pet.setFacing(1);
  }

  set(story: StoryState): void {
    const fresh = story.key !== this.story?.key;
    this.story = story;
    if (fresh) {
      let comp = locationComposition(story.locationId);
      if (!comp) {
        this.opts.emit({ type: 'error', message: `Localización desconocida: ${story.locationId}` });
        comp = locationComposition(LOCATION_IDS[0]);
      }
      if (!comp) return;
      // Fundido solo al cambiar de sitio; con movimiento reducido el cambio es directo
      if (comp.id !== this.comp?.id && !this.opts.reducedMotion) this.fadeMs = 0;
      this.comp = comp;
      this.backdrop.set(comp);
      this.walk = startWalk(story.phase);
      this.clock = 0;
      this.moving = null;
    } else {
      const before = this.walk.phase;
      this.walk = setPhase(this.walk, story.phase);
      // Al empezar a reaccionar: el clip que pide el anfitrión (alegría, susto…), una sola vez
      if (this.walk.phase === 'react' && before !== 'react' && story.clip) this.opts.pet.play(story.clip, true);
    }
    this.place();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.backdrop.resize(w, h);
    this.place();
  }

  setSky(sky: SkyState): void {
    this.backdrop.setSky(sky);
  }

  /** Un rayo de la tormenta: destello breve sobre el escenario. */
  flash(): void {
    if (!this.opts.reducedMotion) this.flashMs = 220;
  }

  update(dtMs: number): void {
    if (!this.story) return;
    this.clock += dtMs;
    const step = stepWalk(this.walk, dtMs, this.opts.reducedMotion);
    this.walk = step.state;
    if (step.beat) {
      // El evento ocurre justo al llegar al centro
      if (step.beat === 'arrived' && this.story.fx) this.opts.playFx(this.story.fx);
      this.opts.emit({ type: 'storyBeat', key: this.story.key, beat: step.beat });
    }
    if (this.walk.moving !== this.moving) {
      this.moving = this.walk.moving;
      this.opts.pet.setBaseClip(this.moving ? 'walk' : 'idle');
    }
    this.backdrop.update(this.clock / 1000, cameraOf(this.walk));
    this.place();

    if (this.fadeMs < FADE_MS) {
      this.fadeMs = Math.min(FADE_MS, this.fadeMs + dtMs);
      this.alpha = this.fadeMs / FADE_MS;
    } else if (this.alpha !== 1) this.alpha = 1;

    if (this.flashMs > 0 || this.flashG.visible) {
      this.flashMs = Math.max(0, this.flashMs - dtMs);
      this.flashG.clear();
      this.flashG.visible = this.flashMs > 0;
      if (this.flashMs > 0) this.flashG.rect(0, 0, this.w, this.h).fill({ color: 0xffffff, alpha: (this.flashMs / 220) * 0.35 });
    }
  }

  private place(): void {
    const { w, h, comp } = this;
    if (!comp || !w || !h) return;
    const pet = this.opts.pet;
    pet.scale.set((h * PET_HEIGHT) / FRAME);
    const [top, bottom] = comp.ground;
    pet.position.set(w * this.walk.x, h * (top + (bottom - top) * FOOT_IN_BAND));
  }

  /** Devuelve el Pockai (no se destruye con la escena) y libera el resto. */
  release(): void {
    this.removeChild(this.opts.pet);
    this.backdrop.destroy();
    this.destroy({ children: true });
  }
}
