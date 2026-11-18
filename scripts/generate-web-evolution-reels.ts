#!/usr/bin/env tsx
/**
 * Bobinas de evolución para la web (/pockais): huevo → bebé → joven → adulto → forma final.
 *
 *   pnpm generate:web-evolution
 *
 * La web no tiene el motor de efectos ni el horneado del escritorio, así que aquí se pregraban: por
 * cada especie de rareza normal (las tres iniciales) se compone, frame a frame y en la rejilla
 * nativa (64×80, como los efectos), la misma secuencia que vive el Custodio en el escritorio:
 *
 *  1. El huevo con grietas de luz (`huevoGrietas`, el mismo del escritorio) se zarandea, la luz del
 *     Flujo de la especie se cuela por las grietas y estalla.
 *  2. Al estallar sube la Revelación de densidad (`revelacionDensidad`, detrás): nace el bebé.
 *  3. En cada salto de etapa, el Capullo del Telar (`capulloTelar`, delante) envuelve al Pockai y lo
 *     vuelve a tejer en su nueva forma; en la Apoteosis (forma final) lleva corona de destellos.
 *
 * Los sprites salen de las hojas reales (shared/assets/species/<id>/<etapa>/ y la etapa adulta en la
 * raíz), horneadas con `bakePixels` y la paleta por defecto; los efectos, del paquete común
 * (shared/scene/src/effects: los mismos del escritorio y de la escena móvil) con la rampa del Flujo del elemento de la especie. Salida (se commitea):
 *
 *   shared/assets/sprites/evolution_<especie>.png   hoja de frames únicos (nativos, 64×80)
 *   shared/assets/sprites/evolution_<especie>.json  línea de tiempo: frames, inicio de cada etapa y retratos
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { bakePixels } from '../shared/scene/src/bake/bakePixels';
import { deriveVisualTraits } from '../shared/scene/src/prng';
import { capulloTelar, inCocoon } from '../shared/scene/src/effects/capulloTelar';
import { huevoGrietas } from '../shared/scene/src/effects/huevoGrietas';
import { revelacionDensidad } from '../shared/scene/src/effects/revelacionDensidad';
import { flowPalette } from '../shared/scene/src/effects/palettes';
import { renderFrame } from '../shared/scene/src/effects/render';
import type { EffectDef, FxPhase, PixelSink } from '../shared/scene/src/effects/types';
import { encodePng } from './sprites/pixel/raster';
// @ts-expect-error: módulo JS sin tipos (códec PNG compartido con generate-pattern-previews.mjs)
import { decodePng } from './lib/png.mjs';

const ROOT = resolve(__dirname, '..');
const SPECIES_DIR = join(ROOT, 'shared', 'assets', 'species');
const OUT_DIR = join(ROOT, 'shared', 'assets', 'sprites');

/** Lienzo nativo: el ancho del frame de la mascota y el alto de los efectos. */
const W = 64;
const H = 80;
/** Fila de los pies en el lienzo (la de `revelacionDensidad`). */
const FEET = 76;
const FPS = 12;
const FRAME_MS = 1000 / FPS;
/** Píxeles de hoja por píxel nativo en las hojas de la mascota. */
const CELL = 2;
const COLS = 16;

type StageId = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final';
const STAGES: StageId[] = ['egg', 'baby', 'juvenile', 'adult', 'final'];
type PetStage = Exclude<StageId, 'egg'>;
const PET_STAGES: PetStage[] = ['baby', 'juvenile', 'adult', 'final'];

interface SpeciesEntry {
  spriteKey: string;
  rarity: string;
  element: string;
  defaultPalette: { primary: string; secondary: string; accent?: string };
}
interface AnimJson {
  frames: { frame: { x: number; y: number; w: number; h: number } }[];
  meta: { frameTags: { name: string; from: number; to: number }[] };
}

/** Una hoja horneada a resolución nativa, con sus animaciones por nombre. */
interface Sheet {
  frames: Uint8Array[]; // RGBA nativos de 64×64
  tags: Map<string, number[]>;
  /** Fila (nativa) más baja con píxeles en la animación idle: los pies. */
  feet: number;
}

function neutralSeed(): number {
  let best = 0;
  for (let s = 0; s < 10_000 && Math.abs(deriveVisualTraits(best).hueShiftDeg) >= 0.05; s++) {
    if (Math.abs(deriveVisualTraits(s).hueShiftDeg) < Math.abs(deriveVisualTraits(best).hueShiftDeg)) best = s;
  }
  return best;
}
const SEED = neutralSeed();

function readRgba(file: string): { width: number; height: number; data: Uint8Array } {
  const { width, height, pixels } = decodePng(readFileSync(file));
  return { width, height, data: pixels };
}

function loadSheet(dir: string, palette: SpeciesEntry['defaultPalette']): Sheet {
  const anim = JSON.parse(readFileSync(join(dir, 'anim.json'), 'utf8')) as AnimJson;
  const base = readRgba(join(dir, 'base.png'));
  const mask = readRgba(join(dir, 'mask.png'));
  const baked = bakePixels(base, mask, { palette, visualSeed: SEED, pattern: null, pixelSize: CELL });
  const n = W; // 64 nativos por frame
  const frames = anim.frames.map(({ frame }) => {
    const out = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const s = ((frame.y + y * CELL) * base.width + frame.x + x * CELL) * 4;
        out.set(baked.subarray(s, s + 4), (y * n + x) * 4);
      }
    }
    return out;
  });
  const tags = new Map<string, number[]>();
  for (const t of anim.meta.frameTags) tags.set(t.name, Array.from({ length: t.to - t.from + 1 }, (_, k) => t.from + k));
  let feet = 0;
  for (const i of tags.get('idle') ?? [0]) {
    for (let y = n - 1; y > feet; y--) {
      let row = false;
      for (let x = 0; x < n && !row; x++) row = frames[i][(y * n + x) * 4 + 3] > 0;
      if (row) {
        feet = y;
        break;
      }
    }
  }
  return { frames, tags, feet };
}

/* ───── Composición de un frame ───── */

/** Pinta en un RGBA nativo de W×H; los colores de los efectos son `#rrggbb`. */
class RgbaSink implements PixelSink {
  readonly width: number;
  readonly height: number;
  constructor(
    private readonly data: Uint8Array,
    private readonly ox: number,
    private readonly oy: number,
    def: EffectDef,
  ) {
    this.width = def.width;
    this.height = def.height;
  }
  set(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const cx = x + this.ox;
    const cy = y + this.oy;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) throw new Error(`Color de efecto no soportado: ${color}`);
    const v = parseInt(m[1], 16);
    this.data.set([v >> 16, (v >> 8) & 255, v & 255, 255], (cy * W + cx) * 4);
  }
}

interface FxLayer {
  def: EffectDef;
  phases: FxPhase[];
  elapsed: number;
  params: Record<string, string | number>;
}
interface Shot {
  /** `scale` < 1 encoge a la mascota hacia sus pies (para que quepa en el capullo). */
  pet: { sheet: Sheet; frame: number; scale?: number } | null;
  fx: FxLayer[];
}

/** Desfase entre el lienzo y la rejilla del capullo (sus pies están en `anchor.y`). */
const COCOON_DY = FEET - capulloTelar.anchor.y;
const COCOON_DX = Math.round(W / 2 - capulloTelar.anchor.x);
/**
 * Centro del capullo en el lienzo. La mascota se encoge hacia él, no hacia sus pies: el capullo se
 * estrecha abajo y acaba por encima de los pies, así que al encogerse sube y queda en su centro.
 */
const PIVOT = { x: capulloTelar.points.center.x + COCOON_DX, y: capulloTelar.points.center.y + COCOON_DY };

/**
 * La mascota colocada en el lienzo (pies en FEET) y escalada `scale` hacia PIVOT, con vecino más
 * próximo: sigue siendo pixel art. Llama a `put` por cada píxel opaco.
 */
function placePet(sheet: Sheet, frame: number, scale: number, put: (x: number, y: number, s: number) => void): void {
  const src = sheet.frames[frame];
  const oy = FEET - sheet.feet;
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(PIVOT.y + (y + 0.5 - PIVOT.y) / scale) - oy;
    if (sy < 0 || sy >= W) continue;
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(PIVOT.x + (x + 0.5 - PIVOT.x) / scale);
      if (sx < 0 || sx >= W) continue;
      const s = (sy * W + sx) * 4;
      if (src[s + 3] > 0) put(x, y, s);
    }
  }
}

/**
 * Mayor escala a la que todos los frames idle de una etapa caben dentro del capullo, con un píxel de
 * margen alrededor, para que no asome nada mientras se teje.
 */
function cocoonScale(sheet: Sheet): number {
  const inside = (x: number, y: number) => inCocoon(x - COCOON_DX, y - COCOON_DY);
  const fits = (scale: number) =>
    (sheet.tags.get('idle') ?? [0]).every((frame) => {
      let ok = true;
      placePet(sheet, frame, scale, (x, y) => {
        if (ok && !(inside(x, y) && inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) ok = false;
      });
      return ok;
    });
  for (let s = 1; s > 0.2; s -= 0.02) if (fits(s)) return Math.round(s * 100) / 100;
  return 0.2;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Fase y progreso de un efecto a `elapsed` ms (las fases `hold` ya llevan duración fija). */
function phaseAt(phases: FxPhase[], elapsed: number): { phase: string; t: number } {
  let acc = 0;
  for (const p of phases) {
    const ms = p.ms as number;
    if (ms > 0 && elapsed < acc + ms) return { phase: p.name, t: (elapsed - acc) / ms };
    acc += ms;
  }
  const last = [...phases].reverse().find((p) => (p.ms as number) > 0)!;
  return { phase: last.name, t: 1 };
}

function compose(shot: Shot, element: string): Uint8Array {
  const out = new Uint8Array(W * H * 4);
  const drawFx = (layer: FxLayer) => {
    const { phase, t } = phaseAt(layer.phases, layer.elapsed);
    const sink = new RgbaSink(out, Math.round(W / 2 - layer.def.anchor.x), FEET - layer.def.anchor.y, layer.def);
    renderFrame(layer.def, sink, { phase, t, elapsedMs: layer.elapsed }, flowPalette(element), SEED, false, layer.params);
  };
  for (const l of shot.fx) if (l.def.layer !== 'front') drawFx(l);
  if (shot.pet) {
    const { sheet, frame, scale = 1 } = shot.pet;
    const src = sheet.frames[frame];
    placePet(sheet, frame, scale, (x, y, s) => out.set(src.subarray(s, s + 4), (y * W + x) * 4));
  }
  for (const l of shot.fx) if (l.def.layer === 'front') drawFx(l);
  return out;
}

/* ───── Guion ───── */

function withHold(def: EffectDef, holdMs: number, params: Record<string, string | number>): FxPhase[] {
  const phases = def.phasesFor ? def.phasesFor(params, false) : def.phases;
  return phases.map((p) => (p.ms === 'hold' ? { ...p, ms: holdMs } : p));
}
const total = (phases: FxPhase[]) => phases.reduce((n, p) => n + (p.ms as number), 0);
const framesFor = (ms: number) => Math.round(ms / FRAME_MS);

function buildReel(s: SpeciesEntry) {
  const sheets: Record<PetStage, Sheet> = {
    baby: loadSheet(join(SPECIES_DIR, s.spriteKey, 'baby'), s.defaultPalette),
    juvenile: loadSheet(join(SPECIES_DIR, s.spriteKey, 'juvenile'), s.defaultPalette),
    adult: loadSheet(join(SPECIES_DIR, s.spriteKey), s.defaultPalette),
    final: loadSheet(join(SPECIES_DIR, s.spriteKey, 'final'), s.defaultPalette),
  };
  const shots: Shot[] = [];
  const starts: Partial<Record<StageId, number>> = {};
  const portraits: Partial<Record<StageId, number>> = {};
  /** Contador por etapa para que las animaciones en bucle sigan su ciclo entre tramos. */
  const loopIdx = new Map<string, number>();

  const anim = (stage: PetStage, tag: string) => sheets[stage].tags.get(tag) ?? sheets[stage].tags.get('idle')!;
  const nextLoop = (stage: PetStage, tag: string) => {
    const frames = anim(stage, tag);
    const k = loopIdx.get(stage + tag) ?? 0;
    loopIdx.set(stage + tag, k + 1);
    return frames[k % frames.length];
  };
  const play = (stage: PetStage, tag: string, count: number, loop = true) => {
    const frames = anim(stage, tag);
    for (let i = 0; i < count; i++) {
      const frame = loop ? nextLoop(stage, tag) : frames[Math.min(i, frames.length - 1)];
      shots.push({ pet: { sheet: sheets[stage], frame }, fx: [] });
    }
  };
  const mark = (stage: StageId) => {
    starts[stage] = shots.length;
    portraits[stage] = shots.length; // se corrige al primer frame idle de la etapa
  };

  // 1. Huevo con grietas de luz: se zarandea (la espera), se agrieta con la luz del Flujo y estalla.
  mark('egg');
  const EGG_HOLD_MS = 1500;
  const egg = withHold(huevoGrietas, EGG_HOLD_MS, {});
  const eggFrames = framesFor(total(egg));
  const burstStart = framesFor(total(egg.slice(0, 2)));
  // 2. Eclosión: al estallar sube la Revelación de densidad detrás y, ya sin cáscara, aparece el bebé.
  const birthParams = { rarity: s.rarity, shiny: 0 };
  const birth = withHold(revelacionDensidad, 0, birthParams);
  const birthEnd = burstStart + framesFor(total(birth));
  for (let i = 0; i < Math.max(eggFrames, birthEnd); i++) {
    const fx: FxLayer[] = [];
    if (i >= burstStart && i < birthEnd) {
      fx.push({ def: revelacionDensidad, phases: birth, elapsed: (i - burstStart) * FRAME_MS, params: birthParams });
    }
    if (i < eggFrames) fx.push({ def: huevoGrietas, phases: egg, elapsed: i * FRAME_MS, params: {} });
    if (i === eggFrames) mark('baby');
    shots.push({ pet: i < eggFrames ? null : { sheet: sheets.baby, frame: nextLoop('baby', 'idle') }, fx });
  }
  play('baby', 'idle', 18);

  // 3. Cada salto: el Pockai se encoge hasta caber en el capullo mientras llegan las hebras, el
  //    Capullo del Telar lo envuelve y late (aquí cambia la forma), y al estallar crece a su tamaño.
  const HOLD_MS = 500;
  const evolve = (from: PetStage, to: PetStage) => {
    const params = to === 'final' ? { stage: 'final' } : { stage: to };
    const phases = withHold(capulloTelar, HOLD_MS, params);
    const gatherEnd = framesFor(total(phases.slice(0, 1)));
    const swapAt = framesFor(total(phases.slice(0, 2)) + HOLD_MS / 2);
    const burstAt = framesFor(total(phases.slice(0, 3)));
    const burstEnd = framesFor(total(phases.slice(0, 4)));
    const n = framesFor(total(phases));
    const small = { from: cocoonScale(sheets[from]), to: cocoonScale(sheets[to]) };
    for (let i = 0; i < n; i++) {
      const stage = i < swapAt ? from : to;
      if (i === burstAt) mark(to);
      let scale: number;
      if (i < gatherEnd) scale = 1 + (small.from - 1) * smooth(i / Math.max(1, gatherEnd - 1));
      else if (i < burstAt) scale = stage === from ? small.from : small.to;
      else if (i < burstEnd) scale = small.to + (1 - small.to) * smooth((i - burstAt + 1) / Math.max(1, burstEnd - burstAt));
      else scale = 1;
      shots.push({
        pet: { sheet: sheets[stage], frame: nextLoop(stage, 'idle'), scale },
        fx: [{ def: capulloTelar, phases, elapsed: i * FRAME_MS, params }],
      });
    }
    console.log(`  ${s.spriteKey} ${from}→${to}: escala en el capullo ${small.from} → ${small.to}`);
  };
  evolve('baby', 'juvenile');
  play('juvenile', 'idle', 18);
  evolve('juvenile', 'adult');
  play('adult', 'idle', 18);
  evolve('adult', 'final');
  play('final', 'happy', anim('final', 'happy').length * 2);
  play('final', 'idle', 24);

  // Retratos: un frame idle sin efectos de cada etapa (para movimiento reducido y el selector).
  portraits.egg = shots.length;
  shots.push({ pet: null, fx: [{ def: huevoGrietas, phases: egg, elapsed: 0, params: {} }] });
  for (const st of PET_STAGES) {
    const sheet = sheets[st];
    const idle = sheet.tags.get('idle')![0];
    portraits[st] = shots.length;
    shots.push({ pet: { sheet, frame: idle }, fx: [] });
  }
  const timelineLength = shots.length - STAGES.length;

  // Frames únicos → hoja; la línea de tiempo apunta a la hoja.
  const unique: Uint8Array[] = [];
  const byHash = new Map<string, number>();
  const index = shots.map((shot) => {
    const px = compose(shot, s.element);
    const h = createHash('sha1').update(px).digest('hex');
    let k = byHash.get(h);
    if (k === undefined) {
      k = unique.length;
      unique.push(px);
      byHash.set(h, k);
    }
    return k;
  });

  const rows = Math.ceil(unique.length / COLS);
  const sheetW = COLS * W;
  const sheetH = rows * H;
  const png = new Uint8Array(sheetW * sheetH * 4);
  unique.forEach((px, k) => {
    const ox = (k % COLS) * W;
    const oy = Math.floor(k / COLS) * H;
    for (let y = 0; y < H; y++) png.set(px.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * sheetW + ox) * 4);
  });

  const json = {
    frameWidth: W,
    frameHeight: H,
    columns: COLS,
    fps: FPS,
    frames: index.slice(0, timelineLength),
    stages: STAGES.map((id) => ({ id, start: starts[id]! })),
    portraits: Object.fromEntries(STAGES.map((id) => [id, index[portraits[id]!]])),
  };
  return { png: encodePng(sheetW, sheetH, png), json, unique: unique.length, timeline: timelineLength };
}

const species = JSON.parse(readFileSync(join(ROOT, 'shared', 'game-data', 'species.json'), 'utf8')) as SpeciesEntry[];
for (const s of species.filter((x) => x.rarity === 'normal')) {
  const reel = buildReel(s);
  writeFileSync(join(OUT_DIR, `evolution_${s.spriteKey}.png`), reel.png);
  writeFileSync(join(OUT_DIR, `evolution_${s.spriteKey}.json`), JSON.stringify(reel.json) + '\n');
  const secs = (reel.timeline / FPS).toFixed(1);
  console.log(`evolution_${s.spriteKey}: ${reel.timeline} frames (${secs} s), ${reel.unique} únicos, ${(reel.png.length / 1024).toFixed(0)} KiB`);
}
