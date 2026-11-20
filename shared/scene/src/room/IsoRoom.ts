/**
 * Sala isométrica (GUIA_ARTISTICA §7.4): corte tipo casa de muñecas con dos paredes al fondo,
 * suelo en rombos, muebles con huella y el Pockai paseando, todo en una sola lista ordenada por
 * profundidad.
 *
 * Modo edición: se selecciona un mueble con clic o toque, se arrastra (ajusta a la celda con vista
 * previa verde o roja), se gira con R o `rotateSelected` y se mueve con las flechas. Cada cambio
 * válido emite `furnitureMoved`; el servidor es la autoridad y el anfitrión reenvía la sala si lo
 * rechaza.
 */
import { Container, Graphics, Sprite, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import type { Activity, Interaction, RoomFurniture, RoomItem, RoomState, RoomTheme, SceneEvent } from '../protocol';
import { depthOf, TILE_H, TILE_W, toGrid, toScreen } from '../iso/projection';
import {
  footprintCells,
  normalizeRotation,
  roomBlockedCells,
  rotatedFootprint,
  snapToWall,
  validatePlacement,
  type PlacedShape,
} from '../iso/layout';
import { findPath, type Cell } from '../iso/pathfind';
import { PetSprite } from '../pet/PetSprite';
import { furnitureMeta, loadFurnitureTexture, type Orientation } from './furnitureAssets';
import { SLAB, sparkle, styleFor, WALL_H, type Twinkle } from './roomStyles';
import { blockedOf } from './roomShape';
import { FURNITURE_LIGHTS, RoomLife } from './roomLife';
import { toHexString, type SkyState } from '../ambience/sunClock';
import { isWet, type WeatherLook } from '../ambience/weather';
import { createRng, pushRecent, type Rng } from '@pockai/mind';
import { ROOM_CONFIG, byNearest, cellsByDistance, chooseRoomAction, type RoomMind } from './petWander';
import { entranceCell, freeNeighbor, roamCell, scriptFor, type ActorStep, type Beat } from './visitScene';
import { nearestFreeCell } from './petHold';
import { AMBIENT_ALPHA, CLASSIC_ROOM_PALETTE, type RoomPalette } from './roomPalette';

export { WALL_H } from './roomStyles';
// Pixel art (GUIA_ARTISTICA §7.5): la hoja va a ×2, así que 0,5 deja 1 px nativo = 1 px de sala.
const PET_SCALE = 64 / 128;
const WALK_SPEED = 1.7; // celdas por segundo

const DEFAULT_THEME: RoomTheme = {
  wall: '#fff3d6',
  wallShade: '#ffe0a8',
  floor: '#c98a4b',
  floorAlt: '#a26431',
  trim: '#8a5a2b',
  sky: '#8fd0ff',
  light: '#fff0be',
};

/** Con las luces apagadas (el Pockai duerme) la sala queda al menos así de oscura. */
const SLEEP_ALPHA = 0.42;
/** En modo edición la luz del día no debe estorbar al colocar muebles. */
const EDIT_TINT_MAX = 0.15;
/** Margen alrededor de la sala al encajarla (cubre el grosor de las paredes). */
const MARGIN = 10;
/** Celdas del fondo donde el Pockai se resguarda de la lluvia (bajo el árbol del jardín). */
const SHELTER = 4;
const STARTLE_EVERY_MS = 20_000;
const OK = 0x55db9c;
const BAD = 0xfb4903;

/** Clip que se reproduce al usar un mueble. */
const USE_CLIP: Record<Interaction, string> = {
  sleep: 'sleep',
  eat: 'eat',
  play: 'happy',
  bathe: 'clean',
  sit: 'perch',
  listen: 'happy',
};

interface PlacedFurniture {
  item: RoomItem;
  def: RoomFurniture;
  sprite: Sprite;
}

interface IsoRoomOptions {
  pet: PetSprite;
  emit: (e: SceneEvent) => void;
  reducedMotion: boolean;
}

export class IsoRoom extends Container {
  /** Sombra de la losa sobre el paisaje pintado (solo en modo híbrido). */
  private readonly groundShadow = new Graphics();
  private readonly shell = new Graphics();
  /** Misma geometría que la carcasa: recorta el tinte de noche a la silueta de cada sala. */
  private readonly shellMask = new Graphics(this.shell.context);
  /** Capa ambiental animada (estrellas que titilan), encima de la carcasa. */
  private readonly ambient = new Graphics();
  private readonly objects = new Container();
  private readonly overlay = new Graphics();
  private readonly night = new Graphics();
  private readonly pet: PetSprite;
  /** Luces, clima dentro y partículas (roomLife.ts). */
  private readonly life: RoomLife;

  private room: RoomState | null = null;
  /** Celdas sin suelo de la sala actual (su forma): ni muebles de suelo ni paseos. */
  private holes = new Set<string>();
  private placed = new Map<string, PlacedFurniture>();
  private restClip = 'idle';
  private twinkles: Twinkle[] = [];
  private clock = 0;

  private activity: Activity = 'idle';
  private isNight = false;
  private palette: RoomPalette = CLASSIC_ROOM_PALETTE;
  private grounded = false;
  /** Cielo y clima actuales (los pone `Ambience`); sin ellos la sala se ve como de día. */
  private sky: SkyState | null = null;
  private look: WeatherLook | null = null;
  private skyKey = '';
  private startleMs = 0;
  private edit = false;
  private selected: string | null = null;

  // Paseo del Pockai (posición en la rejilla, fraccionaria)
  private petPos = { x: 1.5, y: 1.5 };
  private path: Cell[] = [];
  private onArrive: (() => void) | null = null;
  private waitMs = 1200;
  private using = false;

  // Agarrado con el ratón (petHold): desfase entre el cursor y los pies, y última x para orientarlo.
  private held: { dx: number; dy: number; lastX: number } | null = null;

  // Decisión del paseo (petWander): personalidad y necesidades, azar sembrado y memoria corta
  private mind: RoomMind | null = null;
  private rng: Rng = createRng((Math.random() * 0xffffffff) >>> 0);
  private recent: string[] = [];
  private lastAt: Record<string, number> = {};
  /** Reloj propio de las decisiones (ms que la sala lleva viva). */
  private lifeMs = 0;

  // Visita: el Pockai de un amigo comparte la sala y los dos representan escenas (visitScene.ts)
  private guest: PetSprite | null = null;
  private guestPos = { x: 1.5, y: 1.5 };
  private guestPath: Cell[] = [];
  private guestWaitMs = 2500;
  /** Escena en curso: tiempos del guion, cuál toca y si aún están llegando a su sitio. */
  private scene: { beats: Beat[]; index: number; phase: 'moving' | 'holding'; timer: number } | null = null;

  // Arrastre en modo edición
  private drag: { id: string; grabDx: number; grabDy: number; cand: { x: number; y: number }; valid: boolean } | null = null;

  constructor(private readonly opts: IsoRoomOptions) {
    super();
    this.pet = opts.pet;
    this.objects.sortableChildren = true;
    this.groundShadow.eventMode = 'none';
    this.life = new RoomLife(opts.reducedMotion);
    this.addChild(
      this.groundShadow,
      this.shell,
      this.shellMask,
      this.ambient,
      this.life.under,
      this.objects,
      this.life.mid,
      this.overlay,
      this.night,
      this.life.over,
    );
    this.night.mask = this.shellMask;
    this.ambient.eventMode = 'none';
    this.night.eventMode = 'none';
    this.overlay.eventMode = 'none';
    this.eventMode = 'static';
    this.on('globalpointermove', (e) => this.onDragMove(e));
    this.on('pointerup', () => this.onDragEnd());
    this.on('pointerupoutside', () => this.onDragEnd());
    this.pet.scale.set(PET_SCALE);
    this.objects.addChild(this.pet);
  }

  // ───────────────────────── Estado desde el anfitrión ─────────────────────────

  setRoom(room: RoomState): void {
    const prevId = this.room?.id;
    this.room = { ...room, blocked: blockedOf(room) };
    this.holes = roomBlockedCells(this.room);
    this.life.setRoom(room.id, room.gridWidth, room.gridHeight, this.holes);
    this.drawShell();
    this.drawGroundShadow();
    this.syncFurniture();
    if (prevId !== room.id) {
      this.placePetAtStart();
      this.endScene();
      this.placeGuestAtEntrance();
    }
    this.replanIfBlocked();
    this.drawOverlay();
  }

  /**
   * Qué hace el Pockai. `rest` es el clip de reposo que decide el anfitrión según su estado
   * (idle, sick, hungry, tired, sad…): se usa en lugar de `idle` al pararse. Si está enfermo o
   * cansado no pasea.
   */
  setActivity(activity: Activity, rest = 'idle'): void {
    const restChanged = rest !== this.restClip;
    this.restClip = rest;
    if (activity === this.activity) {
      if (restChanged && activity === 'idle' && !this.path.length && !this.using) this.pet.setBaseClip(rest);
      return;
    }
    this.activity = activity;
    this.held = null;
    this.pet.visible = activity !== 'away';
    // Sin anfitrión en la sala no hay visita que ver aquí (se muestra junto a la mascota del escritorio)
    if (this.guest) this.guest.visible = activity !== 'away';
    this.endScene();
    this.path = [];
    this.onArrive = null;
    this.using = false;
    this.waitMs = 300;
    if (activity === 'idle') this.pet.setBaseClip(rest);
    // Con movimiento reducido no se va a la cama: duerme donde está, pero con los ojos cerrados.
    if (activity === 'sleep' && this.opts.reducedMotion) this.pet.setBaseClip('sleep');
    this.placePetSprite();
  }

  /**
   * Personalidad y necesidades del Pockai, para que elija qué hacer en la sala. Sin ellas se porta
   * de forma neutra. La semilla solo se aplica al cambiar: así las decisiones son reproducibles.
   */
  setMind(mind: RoomMind | null): void {
    if (mind && mind.seed !== this.mind?.seed) this.rng = createRng(mind.seed);
    this.mind = mind;
  }

  // ───────────────────────── Visita ─────────────────────────

  get hasGuest(): boolean {
    return !!this.guest;
  }

  /** Entra (o se va) el Pockai de un amigo. Aparece por la parte delantera de la sala. */
  setGuest(sprite: PetSprite | null): void {
    if (sprite === this.guest) return;
    this.endScene();
    if (this.guest) this.objects.removeChild(this.guest);
    this.guest = sprite;
    this.guestPath = [];
    if (!sprite) return;
    sprite.scale.set(PET_SCALE);
    sprite.visible = this.activity !== 'away';
    sprite.setBaseClip('idle');
    this.objects.addChild(sprite);
    this.placeGuestAtEntrance();
  }

  private placeGuestAtEntrance(): void {
    if (!this.room || !this.guest) return;
    const cell = entranceCell(this.blockedCells(), this.room);
    this.guestPos = { x: cell.x + 0.5, y: cell.y + 0.5 };
    this.guestWaitMs = 1500;
    this.placeGuestSprite();
  }

  private placeGuestSprite(): void {
    if (!this.guest) return;
    const s = toScreen(this.guestPos.x, this.guestPos.y);
    this.guest.position.set(s.x, s.y);
    // Un pelín por detrás del Pockai de la casa cuando comparten celda
    this.guest.zIndex = depthOf(this.guestPos.x, this.guestPos.y, 0.04);
  }

  private guestCell(): Cell {
    return { x: Math.floor(this.guestPos.x), y: Math.floor(this.guestPos.y) };
  }

  /**
   * Representa una escena entre el Pockai de la sala y el visitante. Se ignora si no hay
   * visitante, si el de la casa no está paseando (duerme, está fuera, enfermo) o si se está
   * decorando: una escena es un extra, nunca interrumpe otra cosa.
   */
  playScene(type: string): void {
    if (!this.room || !this.guest || this.held || this.activity !== 'idle' || this.edit || this.staysPut) return;
    const beats = scriptFor(type);
    if (!beats.length) return;
    this.endScene();
    this.path = [];
    this.onArrive = null;
    this.using = false;
    this.scene = { beats, index: 0, phase: 'moving', timer: 0 };
    this.startBeat();
  }

  private endScene(): void {
    if (!this.scene) return;
    this.scene = null;
    this.guestPath = [];
    if (this.activity === 'idle' && !this.path.length) this.pet.setBaseClip(this.restClip);
    this.guest?.setBaseClip('idle');
    this.waitMs = 1500;
    this.guestWaitMs = 2500;
  }

  /** Pone a cada uno camino de su sitio para el tiempo actual del guion. */
  private startBeat(): void {
    const scene = this.scene;
    if (!scene || !this.room || !this.guest) return;
    const beat = scene.beats[scene.index];
    scene.phase = 'moving';
    scene.timer = 0;
    const blocked = this.blockedCells();
    const hostCell = this.petCell();
    const guestCell = this.guestCell();
    // Con movimiento reducido nadie camina: la escena son solo los gestos, cada uno en su sitio
    const still = this.opts.reducedMotion;

    // Primero el que marca el destino (quien pasea o se queda); después, quien va a su lado
    const destination = (step: ActorStep, from: Cell): Cell => {
      if (still || step.move !== 'roam') return from;
      return roamCell(from, blocked, this.room!, this.rng) ?? from;
    };
    const hostDest = destination(beat.host, hostCell);
    const guestDest = destination(beat.guest, guestCell);
    const beside = (step: ActorStep, from: Cell, other: Cell, otherDest: Cell): Cell => {
      if (still) return from;
      if (step.move === 'meet') return freeNeighbor(other, blocked, this.room!, from) ?? from;
      if (step.move === 'follow') return freeNeighbor(otherDest, blocked, this.room!, from) ?? from;
      return from;
    };
    const hostTarget = beat.host.move === 'roam' ? hostDest : beside(beat.host, hostCell, guestCell, guestDest);
    const guestTarget = beat.guest.move === 'roam' ? guestDest : beside(beat.guest, guestCell, hostCell, hostDest);

    this.path = findPath(this.room, blocked, hostCell, hostTarget) ?? [];
    this.onArrive = null;
    if (this.path.length) this.pet.setBaseClip('walk');
    this.guestPath = findPath(this.room, blocked, guestCell, guestTarget) ?? [];
    if (this.guestPath.length) this.guest.setBaseClip('walk');
  }

  /** Los dos han llegado: se miran (o se dan la espalda) y hacen su gesto. */
  private performBeat(beat: Beat): void {
    if (!this.guest) return;
    // x de pantalla = x − y de la rejilla: de ahí sale quién queda a la derecha de quién
    const sdx = this.guestPos.x - this.guestPos.y - (this.petPos.x - this.petPos.y);
    const toGuest: 1 | -1 = sdx >= 0 ? 1 : -1;
    const act = (sprite: PetSprite, step: ActorStep, towardsOther: 1 | -1, rest: string) => {
      if (step.face === 'other') sprite.setFacing(towardsOther);
      else if (step.face === 'away') sprite.setFacing(towardsOther === 1 ? -1 : 1);
      sprite.setBaseClip(step.hold ?? rest);
      if (step.clip) sprite.play(step.clip, true);
    };
    act(this.pet, beat.host, toGuest, this.restClip);
    act(this.guest, beat.guest, toGuest === 1 ? -1 : 1, 'idle');
  }

  private updateScene(dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    if (!this.guest) {
      this.endScene();
      return;
    }
    scene.timer += dt;
    const beat = scene.beats[scene.index];
    if (scene.phase === 'moving') {
      // Si alguno no consigue llegar (camino tapado), a los 9 s se sigue igualmente
      const arrived = !this.path.length && !this.guestPath.length;
      if (!arrived && scene.timer < 9000) return;
      this.path = [];
      this.guestPath = [];
      this.performBeat(beat);
      scene.phase = 'holding';
      scene.timer = 0;
      return;
    }
    if (scene.timer < beat.holdMs) return;
    scene.index++;
    if (scene.index >= scene.beats.length) this.endScene();
    else this.startBeat();
  }

  /** Avanza al visitante por su camino y, fuera de las escenas, le hace pasear por la sala. */
  private updateGuest(dt: number): void {
    const guest = this.guest;
    if (!guest || !this.room) return;
    if (this.guestPath.length) {
      const next = this.guestPath[0];
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - this.guestPos.x;
      const dy = ty - this.guestPos.y;
      const dist = Math.hypot(dx, dy);
      const step = (WALK_SPEED * dt) / 1000;
      if (dist <= step) {
        this.guestPos = { x: tx, y: ty };
        this.guestPath.shift();
      } else {
        this.guestPos = { x: this.guestPos.x + (dx / dist) * step, y: this.guestPos.y + (dy / dist) * step };
      }
      const sdx = dx - dy;
      if (Math.abs(sdx) > 0.01) guest.setFacing(sdx > 0 ? 1 : -1);
      this.placeGuestSprite();
      if (!this.guestPath.length && !this.scene) {
        guest.setBaseClip('idle');
        this.guestWaitMs = 2500 + this.rng() * 4000;
      }
      return;
    }
    if (this.scene || this.opts.reducedMotion || this.edit) return;
    this.guestWaitMs -= dt;
    if (this.guestWaitMs > 0) return;
    const target = roamCell(this.guestCell(), this.blockedCells(), this.room, this.rng, 2, 4);
    const path = target ? findPath(this.room, this.blockedCells(), this.guestCell(), target) : null;
    if (path?.length) {
      this.guestPath = path;
      guest.setBaseClip('walk');
    } else {
      this.guestWaitMs = 2000;
    }
  }

  private get staysPut(): boolean {
    return this.restClip === 'sick' || this.restClip === 'tired';
  }

  /**
   * Modo híbrido: la sala se posa sobre un paisaje pintado y le proyecta una sombra suave, para
   * que no parezca flotar delante del fondo.
   */
  setGrounded(grounded: boolean): void {
    this.grounded = grounded;
    this.drawGroundShadow();
  }

  private drawGroundShadow(): void {
    const g = this.groundShadow;
    g.clear();
    if (!this.grounded || !this.room) return;
    const W = this.room.gridWidth;
    const H = this.room.gridHeight;
    const c = toScreen(W / 2, H / 2);
    const rx = (W + H) * (TILE_W / 2) * 0.56;
    for (const [k, a] of [
      [1.12, 0.1],
      [1, 0.16],
    ]) {
      g.ellipse(c.x, c.y + SLAB + (W + H) * 2.2, rx * k, rx * 0.36 * k).fill({ color: 0x0b1020, alpha: a });
    }
  }

  /** Colores del tema de la app (roomPalette.ts): partículas, destellos, penumbra y resalte. */
  setPalette(palette: RoomPalette): void {
    if (palette === this.palette) return;
    this.palette = palette;
    this.life.setPalette(palette);
    this.drawNight();
    this.drawOverlay();
  }

  setNight(night: boolean): void {
    this.isNight = night;
    this.life.set({ sleeping: night });
    this.drawNight();
  }

  /**
   * Hora y clima: ajusta la luz de la sala y el color de sus ventanas. La carcasa solo se redibuja
   * cuando el color cambia de forma apreciable (se cuantiza), no en cada aviso.
   */
  setSky(sky: SkyState, look: WeatherLook): void {
    this.sky = sky;
    this.look = look;
    this.life.set({ sky, look });
    const q = (c: number) => c & 0xf8f8f8;
    const key = `${q(sky.glass)}:${q(sky.light)}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      this.drawShell();
    } else this.drawNight();
  }

  /** Un rayo: destello en los cristales y, si toca, susto del Pockai. */
  lightning(): void {
    this.life.lightning();
    this.startle();
  }

  /** Un rayo: si el Pockai está quieto y despierto, se asusta (como mucho cada 20 s). */
  startle(): void {
    if (this.held || this.activity !== 'idle' || this.path.length || this.using || this.staysPut || this.startleMs > 0) return;
    this.startleMs = STARTLE_EVERY_MS;
    this.pet.play('sad', true);
    this.waitMs = Math.max(this.waitMs, 2200);
  }

  setEditMode(edit: boolean): void {
    this.edit = edit;
    this.life.set({ edit });
    for (const pf of this.placed.values()) {
      pf.sprite.eventMode = edit ? 'static' : 'none';
      pf.sprite.cursor = edit ? 'grab' : 'default';
    }
    if (!edit) this.select(null);
    this.drawOverlay();
    this.drawNight();
  }

  select(itemId: string | null): void {
    if (itemId && !this.placed.has(itemId)) itemId = null;
    if (this.selected === itemId) return;
    this.selected = itemId;
    this.opts.emit({ type: 'itemSelected', itemId });
    this.drawOverlay();
  }

  rotateSelected(): void {
    const pf = this.selected ? this.placed.get(this.selected) : null;
    if (!pf || !this.room) return;
    // Prueba los 3 giros siguientes; el primero válido gana (los de pared cambian de pared).
    for (let k = 1; k <= 3; k++) {
      const rotation: number = normalizeRotation(pf.item.rotation + k);
      let cand: { x: number; y: number; rotation: number } = { x: pf.item.x, y: pf.item.y, rotation };
      if (pf.def.mount === 'wall') cand = snapToWall(cand);
      if (this.isValid(pf, cand)) return this.commitMove(pf, cand);
    }
  }

  /** Mueve el seleccionado una celda (flechas del teclado). */
  nudgeSelected(dx: number, dy: number): void {
    const pf = this.selected ? this.placed.get(this.selected) : null;
    if (!pf) return;
    let cand = { x: pf.item.x + dx, y: pf.item.y + dy, rotation: pf.item.rotation };
    if (pf.def.mount === 'wall') cand = snapToWall(cand);
    if (this.isValid(pf, cand)) this.commitMove(pf, cand);
  }

  get editing(): boolean {
    return this.edit;
  }

  // ───────────────────────── Dibujo ─────────────────────────

  private theme(): RoomTheme {
    const t = { ...DEFAULT_THEME, ...(this.room?.theme ?? {}) };
    // Las ventanas enseñan el cielo de ahora y la luz que entra es la del sol o la luna.
    if (this.sky && !styleFor(this.room?.id).ownSky) {
      t.sky = toHexString(this.sky.glass);
      t.light = toHexString(this.sky.light);
    }
    return t;
  }

  /** Límites en píxeles de la sala (para encajarla en el lienzo). */
  bounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const W = this.room?.gridWidth ?? 14;
    const H = this.room?.gridHeight ?? 10;
    const style = styleFor(this.room?.id);
    return {
      minX: -H * (TILE_W / 2) - MARGIN,
      maxX: W * (TILE_W / 2) + MARGIN,
      minY: -WALL_H - style.topExtra - MARGIN,
      maxY: (W + H) * (TILE_H / 2) + SLAB + style.bottomExtra + MARGIN,
    };
  }

  /** Carcasa de la sala (paredes, suelo, losa) según su estilo (`roomStyles.ts`). */
  private drawShell(): void {
    const g = this.shell;
    g.clear();
    this.twinkles = [];
    if (this.room) {
      const style = styleFor(this.room.id);
      const W = this.room.gridWidth;
      const H = this.room.gridHeight;
      style.draw({ g, t: this.theme(), W, H, holes: this.holes });
      this.twinkles = style.twinkles?.(W, H, this.holes) ?? [];
    }
    this.ambient.clear();
    this.drawNight();
  }

  private drawNight(): void {
    const g = this.night;
    g.clear();
    if (!this.room) return;
    // Rectángulo que cubre la sala, recortado por la máscara a la silueta de la carcasa: el tinte
    // no oscurece el fondo de alrededor, tenga la sala la forma que tenga (setos, árbol, cristales).
    const b = this.bounds();
    const cover = (color: number, alpha: number) =>
      g.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY).fill({ color, alpha });
    // Luz de la hora y del clima (la Cita Final, con cielo propio, recibe la mitad).
    let lit = 0;
    if (this.sky) {
      lit = this.sky.tintAlpha * (styleFor(this.room.id).ownSky ? 0.5 : 1);
      if (this.edit) lit = Math.min(lit, EDIT_TINT_MAX);
      if (lit > 0.005) cover(this.sky.tint, lit);
    }
    // Luces apagadas porque duerme: se oscurece lo que falte hasta la penumbra de siempre.
    if (this.isNight && lit < SLEEP_ALPHA) cover(this.palette.nightTint, SLEEP_ALPHA - lit * 0.6);
    // Velo del tema de la app (cozy calienta la sala; el clásico no lleva).
    if (this.palette.ambient !== null) cover(this.palette.ambient, AMBIENT_ALPHA);
  }

  /** ¿Está el Pockai a la intemperie con lluvia o nieve? */
  private get sheltering(): boolean {
    return !!this.look && isWet(this.look) && !!styleFor(this.room?.id).exterior;
  }

  /** Cuánto se alargan las pausas entre paseos: de noche, con calor o resguardado, va con calma. */
  private get calm(): number {
    let k = 1;
    if (this.sky && this.sky.daylight < 0.25) k *= 1.8;
    if (this.look?.feel === 'hot') k *= 1.5;
    if (this.sheltering) k *= 2;
    return k;
  }

  /** Estrellas que titilan (solo en las salas que las tienen y sin movimiento reducido). */
  private drawAmbient(dt: number): void {
    if (!this.twinkles.length || this.opts.reducedMotion) return;
    this.clock += dt;
    const g = this.ambient;
    g.clear();
    for (const tw of this.twinkles) {
      const a = Math.sin(this.clock / 700 + tw.phase);
      if (a <= 0.2) continue;
      sparkle(g, tw.x, tw.y, tw.size * (0.6 + 0.4 * a), this.palette.twinkle, a);
    }
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    if (!this.room || !this.edit) return;
    const outline = (cells: string[], color: number, fillAlpha: number) => {
      for (const c of cells) {
        const [x, y] = c.split(',').map(Number);
        const pts = [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)];
        g.poly(pts.flatMap((p) => [p.x, p.y])).fill({ color, alpha: fillAlpha }).stroke({ width: 1.5, color, alpha: 0.9 });
      }
    };
    // Celdas sin suelo: rayadas, para que se vea dónde no cabe nada
    for (const k of this.holes) {
      const [x, y] = k.split(',').map(Number);
      const a = toScreen(x, y);
      const b = toScreen(x + 1, y);
      const c = toScreen(x + 1, y + 1);
      const d = toScreen(x, y + 1);
      g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color: BAD, alpha: 0.08 });
      g.moveTo(d.x, d.y).lineTo(b.x, b.y).stroke({ width: 1, color: BAD, alpha: 0.35 });
    }
    if (this.drag) {
      const pf = this.placed.get(this.drag.id);
      if (pf) outline(footprintCells(pf.def, { ...this.drag.cand, rotation: pf.item.rotation }), this.drag.valid ? OK : BAD, 0.35);
    } else if (this.selected) {
      const pf = this.placed.get(this.selected);
      if (pf) outline(footprintCells(pf.def, pf.item), this.palette.accent, 0.18);
    }
  }

  // ───────────────────────── Muebles ─────────────────────────

  private defOf(furnitureId: string): RoomFurniture {
    const d = this.room?.furniture.find((f) => f.id === furnitureId);
    const meta = furnitureMeta(furnitureId);
    return {
      id: furnitureId,
      name: d?.name,
      footprint: d?.footprint ?? meta?.footprint ?? [1, 1],
      mount: d?.mount ?? (meta?.wall ? 'wall' : 'floor'),
      interaction: d?.interaction,
    };
  }

  /**
   * Sincroniza los muebles en dos fases: primero, de forma síncrona, el mapa de muebles con su
   * forma y posición (así la selección, las colisiones y el Pockai ven la sala completa en el
   * acto); después, las texturas, que llegan asíncronas.
   */
  private syncFurniture(): void {
    const items = this.room?.items ?? [];
    const keep = new Set(items.map((i) => i.id));
    for (const [id, pf] of this.placed) {
      if (!keep.has(id)) {
        pf.sprite.destroy();
        this.placed.delete(id);
      }
    }
    const changed: PlacedFurniture[] = [];
    for (const item of items) {
      const def = this.defOf(item.furnitureId);
      let pf = this.placed.get(item.id);
      if (!pf) {
        const sprite = new Sprite();
        sprite.eventMode = this.edit ? 'static' : 'none';
        sprite.cursor = this.edit ? 'grab' : 'default';
        sprite.on('pointerdown', (e) => this.onDragStart(item.id, e));
        this.objects.addChild(sprite);
        pf = { item, def, sprite };
        this.placed.set(item.id, pf);
      }
      pf.item = { ...item };
      pf.def = def;
      this.positionSprite(pf, pf.item);
      changed.push(pf);
    }
    if (this.selected && !this.placed.has(this.selected)) this.select(null);
    void Promise.all(changed.map((pf) => this.applyTexture(pf)));
  }

  /** Orientación y espejo según el giro: 0 → a, 1 → b, 2 → espejo de b, 3 → espejo de a. */
  private orientationOf(rotation: number): { o: Orientation; mirrored: boolean } {
    const r = normalizeRotation(rotation);
    return { o: r === 0 || r === 3 ? 'a' : 'b', mirrored: r >= 2 };
  }

  /** Textura, ancla y espejo del sprite (la posición ya está puesta). */
  private async applyTexture(pf: PlacedFurniture): Promise<void> {
    const rotation = pf.item.rotation;
    const { o, mirrored } = this.orientationOf(rotation);
    const tex = await loadFurnitureTexture(pf.def.id, o);
    // El mueble se quitó o cambió de giro mientras cargaba: esta textura ya no vale.
    if (pf.sprite.destroyed || pf.item.rotation !== rotation) return;
    const meta = furnitureMeta(pf.def.id)?.[o];
    if (tex) pf.sprite.texture = tex;
    if (meta) pf.sprite.anchor.set(meta.anchorX / meta.width, meta.anchorY / meta.height);
    pf.sprite.scale.x = mirrored ? -1 : 1;
  }

  /** Luces de los muebles colocados que dan luz (lámparas, faroles). */
  private furnitureGlows() {
    const out = [];
    for (const pf of this.placed.values()) {
      const l = FURNITURE_LIGHTS[pf.def.id];
      if (!l) continue;
      const { x, y } = pf.sprite.position;
      out.push({ x, y: y + l.dy, r: l.r, color: l.color, kind: 'lamp' as const, pool: { x, y, rx: l.r * 0.8 } });
    }
    return out;
  }

  private positionSprite(pf: PlacedFurniture, at: { x: number; y: number; rotation: number }): void {
    const s = toScreen(at.x, at.y);
    pf.sprite.position.set(s.x, s.y);
    const [w, d] = rotatedFootprint(pf.def, at.rotation);
    pf.sprite.zIndex = pf.def.mount === 'wall' ? -1000 + at.x + at.y : depthOf(at.x + w / 2, at.y + d / 2);
  }

  private others(exceptId: string): PlacedShape[] {
    return [...this.placed.values()]
      .filter((p) => p.item.id !== exceptId)
      .map((p) => ({ ...p.item, footprint: p.def.footprint, mount: p.def.mount }));
  }

  private isValid(pf: PlacedFurniture, cand: { x: number; y: number; rotation: number }): boolean {
    return !!this.room && validatePlacement(this.room, pf.def, cand, this.others(pf.item.id)) === null;
  }

  private commitMove(pf: PlacedFurniture, cand: { x: number; y: number; rotation: number }): void {
    const rotated = cand.rotation !== pf.item.rotation;
    pf.item = { ...pf.item, ...cand };
    this.positionSprite(pf, pf.item);
    if (rotated) void this.applyTexture(pf);
    // Mantener el estado de la sala coherente para el próximo setRoom parcial
    if (this.room) this.room.items = this.room.items.map((i) => (i.id === pf.item.id ? { ...pf.item } : i));
    this.opts.emit({ type: 'furnitureMoved', itemId: pf.item.id, x: cand.x, y: cand.y, rotation: cand.rotation });
    this.replanIfBlocked();
    this.drawOverlay();
  }

  private pointerCell(e: FederatedPointerEvent): { gx: number; gy: number } {
    const local = this.toLocal(e.global);
    return toGrid(local.x, local.y);
  }

  private onDragStart(id: string, e: FederatedPointerEvent): void {
    if (!this.edit) return;
    e.stopPropagation();
    this.select(id);
    const pf = this.placed.get(id);
    if (!pf) return;
    const { gx, gy } = this.pointerCell(e);
    this.drag = {
      id,
      grabDx: Math.floor(gx) - pf.item.x,
      grabDy: Math.floor(gy) - pf.item.y,
      cand: { x: pf.item.x, y: pf.item.y },
      valid: true,
    };
    pf.sprite.cursor = 'grabbing';
    pf.sprite.alpha = 0.85;
    this.drawOverlay();
  }

  private onDragMove(e: FederatedPointerEvent): void {
    if (!this.drag) return;
    const pf = this.placed.get(this.drag.id);
    if (!pf) return;
    const { gx, gy } = this.pointerCell(e);
    let cand = { x: Math.floor(gx) - this.drag.grabDx, y: Math.floor(gy) - this.drag.grabDy, rotation: pf.item.rotation };
    if (pf.def.mount === 'wall') cand = snapToWall(cand);
    if (cand.x === this.drag.cand.x && cand.y === this.drag.cand.y) return;
    this.drag.cand = { x: cand.x, y: cand.y };
    this.drag.valid = this.isValid(pf, cand);
    this.positionSprite(pf, cand);
    this.drawOverlay();
  }

  private onDragEnd(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const pf = this.placed.get(drag.id);
    if (!pf) return;
    pf.sprite.cursor = 'grab';
    pf.sprite.alpha = 1;
    const moved = drag.cand.x !== pf.item.x || drag.cand.y !== pf.item.y;
    if (moved && drag.valid) this.commitMove(pf, { ...drag.cand, rotation: pf.item.rotation });
    else this.positionSprite(pf, pf.item);
    this.drawOverlay();
  }

  // ───────────────────────── Pockai ─────────────────────────

  private blockedCells(): Set<string> {
    const out = new Set<string>(this.holes);
    for (const pf of this.placed.values()) {
      if (pf.def.mount === 'wall') continue;
      for (const c of footprintCells(pf.def, pf.item)) out.add(c);
    }
    return out;
  }

  private petCell(): Cell {
    return { x: Math.floor(this.petPos.x), y: Math.floor(this.petPos.y) };
  }

  private placePetAtStart(): void {
    if (!this.room) return;
    const blocked = this.blockedCells();
    const cx = Math.floor(this.room.gridWidth / 2);
    const cy = Math.floor(this.room.gridHeight / 2);
    // Celda libre más cercana al centro
    let best: Cell = { x: cx, y: cy };
    let bestD = Infinity;
    for (let x = 0; x < this.room.gridWidth; x++) {
      for (let y = 0; y < this.room.gridHeight; y++) {
        if (blocked.has(`${x},${y}`)) continue;
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d < bestD) [best, bestD] = [{ x, y }, d];
      }
    }
    this.petPos = { x: best.x + 0.5, y: best.y + 0.5 };
    this.path = [];
    this.placePetSprite();
  }

  private placePetSprite(): void {
    const s = toScreen(this.petPos.x, this.petPos.y);
    this.pet.position.set(s.x, s.y);
    // El Pockai pesa un poco más que un mueble con el mismo centro: queda delante al rozarlo. Si
    // está usando un mueble (encima de la cama, sentado), va siempre por delante de él.
    this.pet.zIndex = depthOf(this.petPos.x, this.petPos.y, this.using ? 2 : 0.05);
  }

  // ───────────────────────── Agarrado con el ratón ─────────────────────────

  get holding(): boolean {
    return !!this.held;
  }

  /**
   * Levanta al Pockai (clip `drag`, como en el escritorio). `x`, `y` es el cursor en coordenadas
   * de la sala: se guarda el desfase para que no salte a los pies del cursor.
   */
  grabPet(x: number, y: number): boolean {
    if (!this.room || this.edit || this.activity === 'away' || !this.pet.visible) return false;
    this.endScene();
    this.path = [];
    this.onArrive = null;
    this.using = false;
    this.held = { dx: this.pet.x - x, dy: this.pet.y - y, lastX: x };
    this.pet.setBaseClip('drag');
    return true;
  }

  /** Sigue al cursor (coordenadas de la sala), un pelín levantado y siempre por delante. */
  holdPetAt(x: number, y: number): void {
    if (!this.held) return;
    const dx = x - this.held.lastX;
    if (Math.abs(dx) > 1) {
      this.pet.setFacing(dx > 0 ? 1 : -1);
      this.held.lastX = x;
    }
    this.pet.position.set(x + this.held.dx, y + this.held.dy);
    this.pet.zIndex = 1e6;
  }

  /** Lo suelta: aterriza en la celda libre más cercana a sus pies y sigue a lo suyo. */
  releasePet(x: number, y: number): void {
    if (!this.held || !this.room) return this.cancelHold();
    const feet = toGrid(x + this.held.dx, y + this.held.dy);
    const cell = nearestFreeCell(this.room, this.blockedCells(), feet);
    if (cell) this.petPos = { x: cell.x + 0.5, y: cell.y + 0.5 };
    this.finishHold();
    this.pet.play('land', true);
  }

  /** Lo devuelve a donde estaba (se lo llevaron fuera de la sala o se soltó en otro sitio). */
  cancelHold(): void {
    if (!this.held) return;
    this.finishHold();
  }

  private finishHold(): void {
    this.held = null;
    this.setPetHidden(false);
    this.pet.setBaseClip(this.activity === 'sleep' ? 'sleep' : this.restClip);
    this.placePetSprite();
    this.waitMs = 900;
  }

  /** Lo oculta mientras el anfitrión lo dibuja fuera de la sala. */
  setPetHidden(hidden: boolean): void {
    this.pet.visible = this.activity !== 'away' && !hidden;
  }

  /** Si una edición tapa el camino o la celda del Pockai, recalcula. */
  private replanIfBlocked(): void {
    const blocked = this.blockedCells();
    const here = this.petCell();
    if (blocked.has(`${here.x},${here.y}`) && !this.using && !this.held) {
      this.placePetAtStart();
      return;
    }
    if (this.path.some((c) => blocked.has(`${c.x},${c.y}`))) {
      this.path = [];
      this.onArrive = null;
    }
    // Lo mismo para el visitante: si le ponen un mueble encima o en el camino, se recoloca
    if (this.guest) {
      const at = this.guestCell();
      if (blocked.has(`${at.x},${at.y}`)) {
        this.endScene();
        this.placeGuestAtEntrance();
      } else if (this.guestPath.some((c) => blocked.has(`${c.x},${c.y}`))) {
        this.guestPath = [];
      }
    }
  }

  private goTo(target: Cell, allowed: Set<string> = new Set(), onArrive: (() => void) | null = null): boolean {
    if (!this.room) return false;
    const path = findPath(this.room, this.blockedCells(), this.petCell(), target, allowed);
    if (!path) return false;
    this.path = path;
    this.onArrive = onArrive;
    if (path.length) this.pet.setBaseClip('walk');
    return true;
  }

  /** Lleva al Pockai al mueble con esa interacción y reproduce su clip al llegar. */
  private useFurniture(interaction: Interaction, stay: boolean): boolean {
    const candidates = [...this.placed.values()].filter((p) => p.def.interaction === interaction && p.def.mount !== 'wall');
    if (!candidates.length) return false;
    // Va al mueble que le pilla más a mano y, dentro de él, a la celda más cercana a la que llegue
    const here = this.petCell();
    const options = candidates.map((pf) => ({ pf, cells: footprintCells(pf.def, pf.item) }));
    for (const { pf, cells } of byNearest(options, here)) {
      const allowed = new Set(cells);
      for (const target of cellsByDistance(cells, here)) {
        const ok = this.goTo(target, allowed, () => {
          this.using = true;
          this.placePetSprite();
          // Ha llegado y lo usa: se avisa una vez por uso (si se queda, como al dormir, también)
          this.opts.emit({ type: 'furnitureUsed', itemId: pf.item.id, interaction });
          const clip = USE_CLIP[interaction];
          if (stay) this.pet.setBaseClip(clip);
          else {
            this.pet.play(clip, true);
            this.waitMs = 2600;
          }
        });
        if (ok) return true;
      }
    }
    return false;
  }

  private wander(): void {
    if (!this.room) return;
    this.using = false;
    const blocked = this.blockedCells();
    const here = this.petCell();
    if (this.sheltering) {
      // Llueve o nieva en el jardín: se queda al fondo, bajo el árbol.
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.min(this.room.gridWidth - 1, Math.floor(this.rng() * SHELTER));
        const y = Math.min(this.room.gridHeight - 1, Math.floor(this.rng() * SHELTER));
        if ((x !== here.x || y !== here.y) && !blocked.has(`${x},${y}`) && this.goTo({ x, y })) return;
      }
      this.waitMs = 3000;
      return;
    }
    // Elige según cómo es y cómo está: con hambre va al comedero, sucio a la fuente, cansado se
    // sienta; con buen tiempo y de día a veces se alegra. Si no, pasea a una celda libre cercana.
    const sunny = !!this.sky && !!this.look && this.sky.daylight > 0.8 && this.look.cover < 0.5 && this.look.feel !== 'hot';
    const available = new Set<Interaction>();
    for (const p of this.placed.values()) if (p.def.interaction && p.def.mount !== 'wall') available.add(p.def.interaction);
    const action = chooseRoomAction({
      mind: this.mind,
      available,
      sunny,
      recent: this.recent,
      lastAt: this.lastAt,
      now: this.lifeMs,
      rng: this.rng,
    });
    if (action) {
      this.recent = pushRecent(this.recent, action.id, ROOM_CONFIG.antiRepeat.window);
      this.lastAt[action.id] = this.lifeMs;
      if (action.id === 'cheer') {
        this.pet.play('happy', true);
        this.waitMs = 2400;
        return;
      }
      // Si no llega al mueble (camino tapado), se queda en un paseo
      if (action.interaction && this.useFurniture(action.interaction, false)) return;
    }
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.max(0, Math.min(this.room.gridWidth - 1, here.x + Math.round((this.rng() - 0.5) * 8)));
      const y = Math.max(0, Math.min(this.room.gridHeight - 1, here.y + Math.round((this.rng() - 0.5) * 8)));
      if ((x !== here.x || y !== here.y) && !blocked.has(`${x},${y}`) && this.goTo({ x, y })) return;
    }
    this.waitMs = 1500;
  }

  update(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    this.lifeMs += dt;
    if (this.startleMs > 0) this.startleMs -= dt;
    if (this.room) {
      this.drawAmbient(dt);
      this.life.setFurnitureGlows(this.furnitureGlows());
      this.life.update(dt);
    }
    if (!this.room || this.activity === 'away') return;
    if (this.held) return; // en la mano: ni pasea ni representa escenas

    this.updateGuest(dt);
    this.updateScene(dt);

    if (this.path.length) {
      const next = this.path[0];
      const tx = next.x + 0.5;
      const ty = next.y + 0.5;
      const dx = tx - this.petPos.x;
      const dy = ty - this.petPos.y;
      const dist = Math.hypot(dx, dy);
      const step = (WALK_SPEED * dt) / 1000;
      if (dist <= step) {
        this.petPos = { x: tx, y: ty };
        this.path.shift();
      } else {
        this.petPos = { x: this.petPos.x + (dx / dist) * step, y: this.petPos.y + (dy / dist) * step };
      }
      // Mira hacia donde va en pantalla (x de pantalla = x − y de la rejilla)
      const sdx = dx - dy;
      if (Math.abs(sdx) > 0.01) this.pet.setFacing(sdx > 0 ? 1 : -1);
      this.placePetSprite();
      if (!this.path.length) {
        const cb = this.onArrive;
        this.onArrive = null;
        // En plena escena el gesto al llegar lo pone el guion, no el reposo de siempre
        if (!this.scene) this.pet.setBaseClip(this.activity === 'sleep' && !cb ? 'sleep' : this.restClip);
        this.waitMs = (1500 + this.rng() * 3000) * this.calm;
        cb?.();
      }
      return;
    }

    if (this.opts.reducedMotion) return;

    if (this.activity === 'sleep') {
      if (!this.using) {
        // Busca la cama una vez; si no hay o no llega, duerme donde esté.
        this.using = true;
        if (!this.useFurniture('sleep', true)) this.pet.setBaseClip('sleep');
      }
      return;
    }

    if (this.staysPut) return; // enfermo o cansado: se queda quieto con su clip de reposo
    if (this.scene) return; // en plena escena con el visitante no se va a pasear por su cuenta
    this.waitMs -= dt;
    if (this.waitMs <= 0) this.wander();
  }
}
