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
import { footprintCells, normalizeRotation, rotatedFootprint, snapToWall, validatePlacement, type PlacedShape } from '../iso/layout';
import { findPath, type Cell } from '../iso/pathfind';
import { PetSprite } from '../pet/PetSprite';
import { furnitureMeta, loadFurnitureTexture, type Orientation } from './furnitureAssets';
import { SLAB, sparkle, styleFor, WALL_H, type Twinkle } from './roomStyles';

export { WALL_H } from './roomStyles';
const PET_SCALE = 72 / 128; // ~72 px de alto a escala de sala
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

const NIGHT_TINT = 0x1b1846;
const TWINKLE = 0xfff8e6;
const OK = 0x55db9c;
const BAD = 0xfb4903;
const ACCENT = 0x5c4ade;

/** Clip que se reproduce al usar un mueble. */
const USE_CLIP: Record<Interaction, string> = {
  sleep: 'sleep',
  eat: 'eat',
  play: 'happy',
  bathe: 'clean',
  sit: 'perch',
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
  private readonly shell = new Graphics();
  /** Misma geometría que la carcasa: recorta el tinte de noche a la silueta de cada sala. */
  private readonly shellMask = new Graphics(this.shell.context);
  /** Capa ambiental animada (estrellas que titilan), encima de la carcasa. */
  private readonly ambient = new Graphics();
  private readonly objects = new Container();
  private readonly overlay = new Graphics();
  private readonly night = new Graphics();
  private readonly pet: PetSprite;

  private room: RoomState | null = null;
  private placed = new Map<string, PlacedFurniture>();
  private restClip = 'idle';
  private twinkles: Twinkle[] = [];
  private clock = 0;

  private activity: Activity = 'idle';
  private isNight = false;
  private edit = false;
  private selected: string | null = null;

  // Paseo del Pockai (posición en la rejilla, fraccionaria)
  private petPos = { x: 1.5, y: 1.5 };
  private path: Cell[] = [];
  private onArrive: (() => void) | null = null;
  private waitMs = 1200;
  private using = false;

  // Arrastre en modo edición
  private drag: { id: string; grabDx: number; grabDy: number; cand: { x: number; y: number }; valid: boolean } | null = null;

  constructor(private readonly opts: IsoRoomOptions) {
    super();
    this.pet = opts.pet;
    this.objects.sortableChildren = true;
    this.addChild(this.shell, this.shellMask, this.ambient, this.objects, this.overlay, this.night);
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
    this.room = room;
    this.drawShell();
    this.syncFurniture();
    if (prevId !== room.id) this.placePetAtStart();
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
    this.pet.visible = activity !== 'away';
    this.path = [];
    this.onArrive = null;
    this.using = false;
    this.waitMs = 300;
    if (activity === 'idle') this.pet.setBaseClip(rest);
    // Con movimiento reducido no se va a la cama: duerme donde está, pero con los ojos cerrados.
    if (activity === 'sleep' && this.opts.reducedMotion) this.pet.setBaseClip('sleep');
    this.placePetSprite();
  }

  private get staysPut(): boolean {
    return this.restClip === 'sick' || this.restClip === 'tired';
  }

  setNight(night: boolean): void {
    this.isNight = night;
    this.drawNight();
  }

  setEditMode(edit: boolean): void {
    this.edit = edit;
    for (const pf of this.placed.values()) {
      pf.sprite.eventMode = edit ? 'static' : 'none';
      pf.sprite.cursor = edit ? 'grab' : 'default';
    }
    if (!edit) this.select(null);
    this.drawOverlay();
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
    return { ...DEFAULT_THEME, ...(this.room?.theme ?? {}) };
  }

  /** Límites en píxeles de la sala (para encajarla en el lienzo). */
  bounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const W = this.room?.gridWidth ?? 14;
    const H = this.room?.gridHeight ?? 10;
    const style = styleFor(this.room?.id);
    return {
      minX: -H * (TILE_W / 2) - 4,
      maxX: W * (TILE_W / 2) + 4,
      minY: -WALL_H - style.topExtra - 4,
      maxY: (W + H) * (TILE_H / 2) + SLAB + style.bottomExtra + 4,
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
      style.draw({ g, t: this.theme(), W, H });
      this.twinkles = style.twinkles?.(W, H) ?? [];
    }
    this.ambient.clear();
    this.drawNight();
  }

  private drawNight(): void {
    const g = this.night;
    g.clear();
    if (!this.isNight || !this.room) return;
    // Rectángulo que cubre la sala, recortado por la máscara a la silueta de la carcasa: el tinte
    // no oscurece el fondo de alrededor, tenga la sala la forma que tenga (setos, árbol, cristales).
    const b = this.bounds();
    g.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY).fill({ color: NIGHT_TINT, alpha: 0.42 });
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
      sparkle(g, tw.x, tw.y, tw.size * (0.6 + 0.4 * a), TWINKLE, a);
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
    if (this.drag) {
      const pf = this.placed.get(this.drag.id);
      if (pf) outline(footprintCells(pf.def, { ...this.drag.cand, rotation: pf.item.rotation }), this.drag.valid ? OK : BAD, 0.35);
    } else if (this.selected) {
      const pf = this.placed.get(this.selected);
      if (pf) outline(footprintCells(pf.def, pf.item), ACCENT, 0.18);
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
    const out = new Set<string>();
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

  /** Si una edición tapa el camino o la celda del Pockai, recalcula. */
  private replanIfBlocked(): void {
    const blocked = this.blockedCells();
    const here = this.petCell();
    if (blocked.has(`${here.x},${here.y}`) && !this.using) {
      this.placePetAtStart();
      return;
    }
    if (this.path.some((c) => blocked.has(`${c.x},${c.y}`))) {
      this.path = [];
      this.onArrive = null;
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
    const pf = candidates[Math.floor(Math.random() * candidates.length)];
    const cells = footprintCells(pf.def, pf.item);
    const [tx, ty] = cells[0].split(',').map(Number);
    return this.goTo({ x: tx, y: ty }, new Set(cells), () => {
      this.using = true;
      this.placePetSprite();
      const clip = USE_CLIP[interaction];
      if (stay) this.pet.setBaseClip(clip);
      else {
        this.pet.play(clip, true);
        this.waitMs = 2600;
      }
    });
  }

  private wander(): void {
    if (!this.room) return;
    this.using = false;
    // A veces usa un mueble (jugar, sentarse, bañarse); si no, pasea a una celda libre cercana.
    if (Math.random() < 0.3) {
      const kinds: Interaction[] = ['play', 'sit', 'bathe', 'eat'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      if (this.useFurniture(kind, false)) return;
    }
    const blocked = this.blockedCells();
    const here = this.petCell();
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.max(0, Math.min(this.room.gridWidth - 1, here.x + Math.round((Math.random() - 0.5) * 8)));
      const y = Math.max(0, Math.min(this.room.gridHeight - 1, here.y + Math.round((Math.random() - 0.5) * 8)));
      if ((x !== here.x || y !== here.y) && !blocked.has(`${x},${y}`) && this.goTo({ x, y })) return;
    }
    this.waitMs = 1500;
  }

  update(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    if (this.room) this.drawAmbient(dt);
    if (!this.room || this.activity === 'away') return;

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
        this.pet.setBaseClip(this.activity === 'sleep' && !cb ? 'sleep' : this.restClip);
        this.waitMs = 1500 + Math.random() * 3000;
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
    this.waitMs -= dt;
    if (this.waitMs <= 0) this.wander();
  }
}
