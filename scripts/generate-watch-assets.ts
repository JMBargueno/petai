#!/usr/bin/env tsx
/**
 * El catálogo de arte del Apple Watch ([spec 44](../docs/specs/spec-44-reloj-apple-watch.md)).
 *
 *   pnpm generate:watch-assets
 *
 * El reloj no tiene WKWebView ni `@pockai/scene`: no puede hornear nada en marcha. Así que el arte
 * del juego se hornea aquí, se guarda en un `Assets.xcassets` y se commitea, como los sprites de la
 * web. Escribe:
 *
 *   desktop/src-tauri/gen/apple/WatchArt/PockaiArt.xcassets/
 *     pockai/<especie>_<etapa>_<pose>_<n>.imageset   16 especies × 4 etapas × 5 poses × sus frames
 *     pockai/egg_idle_<n>.imageset
 *     item/<id>.imageset                         los objetos de shared/assets/items
 *     ui/<nombre>.imageset                       el set propio, aplanado y rasterizado
 *     element/<flujo>.colorset                       los seis Flujos
 *
 * Y, al lado, `PockaiWatchFrames.swift`: cuántos frames tiene cada pose y cuánto dura cada uno,
 * para que SwiftUI los pase a tiempo sin leer ningún `anim.json`.
 *
 * **Va en `WatchArt/` y no en `Shared/`** aunque lo compartan los dos targets de watchOS: `Shared/`
 * está en las `sources` de los cuatro targets, así que metería este arte dentro de la app de iPhone
 * y de su widget. Y hacen falta **dos copias** porque una extensión de WidgetKit no lee los assets
 * de la app que la contiene: la complicación necesita los suyos en su propio bundle, y eso lo
 * resuelve declarar `WatchArt` en los dos.
 *
 * Desviación de la spec 44 §4, que decía «sin sprites»: ahora sí los hay, pero con la **paleta por
 * defecto de la especie**, no con la del jugador. Shiny, accesorios y `visualSeed` se quedan fuera:
 * para eso habría que hornear en el iPhone y mandar la lámina en el resumen.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { bakePixels } from '../shared/scene/src/bake/bakePixels';
import { deriveVisualTraits } from '../shared/scene/src/prng';
import { encodePng } from './sprites/pixel/raster';
// @ts-expect-error: módulo JS sin tipos (el mismo códec PNG que usan los demás scripts de arte)
import { decodePng } from './lib/png.mjs';

const ROOT = resolve(__dirname, '..');
const SPECIES_DIR = join(ROOT, 'shared', 'assets', 'species');
const ITEMS_DIR = join(ROOT, 'shared', 'assets', 'items');
const ICONS_DIR = join(ROOT, 'shared', 'ui', 'src', 'icons');
const WATCH_ART = join(ROOT, 'desktop/src-tauri/gen/apple/WatchArt');
const OUT = join(WATCH_ART, 'PockaiArt.xcassets');

/** La raíz de cada especie es la etapa adulta; el resto son subcarpetas. */
const STAGES: Record<string, string> = { baby: 'baby', juvenile: 'juvenile', adult: '', final: 'final' };

/**
 * Las poses que el reloj sabe pedir: **los cinco `mood` que decide `care.rs::pet_glance`**, ni uno
 * más. De cada una se hornean todos sus frames, porque el reloj las anima; `eat` o `happy` seguirían
 * siendo láminas sin público, que el reloj no representa acciones.
 */
const POSES = ['idle', 'sleep', 'sick', 'sad', 'hungry'] as const;

/** Los iconos del set propio que pinta el reloj (ver `references/catalog.md`). */
const UI_ICONS = [
  'hunger', 'happiness', 'energy', 'hygiene', 'health',
  'feed', 'clean', 'sleep', 'wake', 'heal', 'evolve',
  'hatch', 'pet', 'coin', 'gem',
];

/** El color de UI de cada Flujo (`docs/GUIA_ARTISTICA.md` §3.6). */
const ELEMENTS: Record<string, string> = {
  fire: '#fb4903',
  water: '#4da2ff',
  plant: '#55db9c',
  electric: '#ffd731',
  shadow: '#9a5cff',
  light: '#fff3b0',
  neutral: '#e9ccff',
};

/** Píxeles de hoja por píxel nativo. */
const CELL = 2;
/** Margen alrededor del contenido, en píxeles de hoja. */
const PAD = 4;

interface SpeciesEntry {
  spriteKey: string;
  defaultPalette: { primary: string; secondary: string; accent?: string };
}
interface AnimJson {
  frames: { frame: { x: number; y: number; w: number; h: number }; duration: number }[];
  meta: { frameTags: { name: string; from: number; to: number }[] };
}

/** Lo que el manifiesto le cuenta a SwiftUI de una pose: la duración en ms de cada frame. */
const DURATIONS = new Map<string, number[]>();
/** Poses cuyos frames son todos el mismo dibujo: se hornean igual, pero en la muñeca no se mueven. */
const PLANAS: string[] = [];

// ── Utilidades del catálogo ────────────────────────────────────────────────────────────────────

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const INFO = { author: 'xcode', version: 1 } as const;

function write(file: string, data: string | Uint8Array) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, data);
}

/**
 * Una carpeta con nombre propio. Sin esto, `Image("pockai/ignisaur_baby_idle")` no encuentra nada:
 * la barra solo es una ruta si la carpeta declara su espacio de nombres. Y haría falta igual para no
 * chocar, porque hay un `ui/hatch` y un `pockai/egg_idle`.
 */
function namespace(dir: string) {
  write(join(OUT, dir, 'Contents.json'), json({ info: INFO, properties: { 'provides-namespace': true } }));
}

/**
 * Una imagen del catálogo, siempre a `2x`. Sin escala declarada, Xcode la trata como talla única y
 * mapea píxel a punto: un sprite de 92 px saldría midiendo 92 pt.
 */
function imageset(path: string, png: Uint8Array, template = false) {
  const name = basename(path);
  write(join(OUT, `${path}.imageset`, `${name}.png`), png);
  write(
    join(OUT, `${path}.imageset`, 'Contents.json'),
    json({
      images: [{ idiom: 'universal', scale: '2x', filename: `${name}.png` }],
      info: INFO,
      ...(template ? { properties: { 'template-rendering-intent': 'template' } } : {}),
    }),
  );
}

function colorset(path: string, hex: string) {
  const comp = (i: number) => `0x${hex.slice(1 + i * 2, 3 + i * 2).toUpperCase()}`;
  write(
    join(OUT, `${path}.colorset`, 'Contents.json'),
    json({
      colors: [
        {
          idiom: 'universal',
          color: {
            'color-space': 'srgb',
            components: { red: comp(0), green: comp(1), blue: comp(2), alpha: '1.000' },
          },
        },
      ],
      info: INFO,
    }),
  );
}

// ── Los sprites ────────────────────────────────────────────────────────────────────────────────

/** La semilla cuyo giro de tono es casi nulo: el reloj enseña la paleta canónica de la especie. */
function neutralSeed(): number {
  let best = 0;
  for (let s = 0; s < 10_000; s++) {
    if (Math.abs(deriveVisualTraits(s).hueShiftDeg) < Math.abs(deriveVisualTraits(best).hueShiftDeg)) best = s;
    if (Math.abs(deriveVisualTraits(best).hueShiftDeg) < 0.05) break;
  }
  return best;
}

function readRgba(file: string) {
  const { width, height, pixels } = decodePng(readFileSync(file));
  return { width, height, data: pixels as Uint8Array };
}

function crop(src: Uint8Array, srcW: number, x: number, y: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    out.set(src.subarray(((y + row) * srcW + x) * 4, ((y + row) * srcW + x + w) * 4), row * w * 4);
  }
  return out;
}

interface Frame {
  name: string;
  /** A quién pertenece: el recorte horizontal se centra por especie, no por etapa. */
  group: string;
  w: number;
  h: number;
  data: Uint8Array;
}

/**
 * Hornea una carpeta de hoja (`base.png` + `mask.png` + `anim.json`) y devuelve **todos** los frames
 * de cada pose pedida, numerados desde 0, apuntando sus duraciones en el manifiesto.
 */
function bakeSheet(
  dir: string,
  palette: SpeciesEntry['defaultPalette'],
  seed: number,
  group: string,
  name: (pose: string) => string,
) {
  const anim = JSON.parse(readFileSync(join(dir, 'anim.json'), 'utf8')) as AnimJson;
  const base = readRgba(join(dir, 'base.png'));
  const mask = readRgba(join(dir, 'mask.png'));
  const baked = new Uint8Array(
    bakePixels(base, mask, { palette, visualSeed: seed, pattern: null, pixelSize: CELL }) as ArrayBuffer,
  );

  const out: Frame[] = [];
  for (const pose of POSES) {
    const tag = anim.meta.frameTags.find((t) => t.name === pose);
    if (!tag) continue; // El huevo, por ejemplo, solo tiene `idle`.
    const key = name(pose);
    const durations: number[] = [];
    for (let i = tag.from; i <= tag.to; i++) {
      const { x, y, w, h } = anim.frames[i].frame;
      out.push({
        name: `${key}_${i - tag.from}`,
        group,
        w,
        h,
        data: crop(baked, base.width, x, y, w, h),
      });
      durations.push(Math.max(1, Math.round(anim.frames[i].duration)));
    }
    DURATIONS.set(key, durations);
    // Que una pose tenga varios frames no quiere decir que se mueva: hoy `idle` y `sad` son el
    // mismo dibujo repetido en todas las especies (ver `docs/PENDIENTES.md`). Conviene que se vea
    // al generar, y no descubrirlo mirando un reloj.
    const dibujos = new Set(out.slice(-durations.length).map((f) => Buffer.from(f.data).toString('base64')));
    if (durations.length > 1 && dibujos.size === 1) PLANAS.push(key);
  }
  return out;
}

/** La caja que cubre lo pintado de todos los frames, en coordenadas de frame. */
function contentBox(frames: Frame[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (f.data[(y * f.w + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Recorta todos los frames al mismo cuadrado, con el suelo a la misma altura: así en la muñeca todas
 * las especies salen a la misma escala y ninguna pierde los pies ni las Z de dormir. El recorte cae
 * en la rejilla nativa para que el pixel art escale limpio.
 *
 * El **lado y el suelo son comunes** a toda la etapa, que es lo que iguala la escala; el **centro
 * horizontal se calcula por especie**, porque si no una criatura estrecha queda pegada a un lado de
 * su lámina y, dentro del halo redondo del reloj, se nota mucho.
 */
function squareAndWrite(frames: Frame[], dir: string) {
  if (!frames.length) return 0;
  const { minY, maxY } = contentBox(frames);
  const comun = contentBox(frames);
  const frameH = frames[0].h;
  const side =
    Math.ceil((Math.max(comun.maxX - comun.minX + 1, maxY - minY + 1) + PAD * 2) / CELL) * CELL;
  const bottom = Math.min(frameH, Math.ceil((maxY + 1 + PAD) / CELL) * CELL);
  const top = bottom - side;

  const centros = new Map<string, number>();
  for (const f of frames) {
    if (centros.has(f.group)) continue;
    const propia = contentBox(frames.filter((o) => o.group === f.group));
    centros.set(f.group, Math.round(((propia.minX + propia.maxX + 1) / 2 - side / 2) / CELL) * CELL);
  }

  for (const f of frames) {
    const left = centros.get(f.group) ?? 0;
    const out = new Uint8Array(side * side * 4);
    for (let row = 0; row < side; row++) {
      const sy = top + row;
      if (sy < 0 || sy >= f.h) continue;
      for (let col = 0; col < side; col++) {
        const sx = left + col;
        if (sx < 0 || sx >= f.w) continue;
        out.set(f.data.subarray((sy * f.w + sx) * 4, (sy * f.w + sx) * 4 + 4), (row * side + col) * 4);
      }
    }
    imageset(join(dir, f.name), encodePng(side, side, out));
  }
  return side;
}

// ── Los iconos del set propio ──────────────────────────────────────────────────────────────────

/**
 * Los SVG del set usan `currentColor` y variables CSS, que ningún rasterizador resuelve. Se aplanan
 * a negro y se rasterizan; el catálogo los marca como plantilla, así que el color lo pone SwiftUI
 * con `.foregroundStyle`, igual que un símbolo del sistema.
 *
 * Se rasteriza y no se mete el SVG crudo en el catálogo a propósito: el importador de Xcode es
 * quisquilloso con los SVG y un fallo ahí rompe el build entero.
 */
function flattenIcon(svg: string) {
  return svg
    .replace(/var\(--icon-accent,\s*currentColor\)/g, '#000000')
    .replace(/var\(--icon-bg,\s*transparent\)/g, 'none')
    .replace(/currentColor/g, '#000000');
}

// ── Manos a la obra ────────────────────────────────────────────────────────────────────────────

rmSync(OUT, { recursive: true, force: true });
write(join(OUT, 'Contents.json'), json({ info: INFO }));

const species = JSON.parse(readFileSync(join(ROOT, 'shared/game-data/species.json'), 'utf8')) as (SpeciesEntry & {
  element: string;
})[];
const seed = neutralSeed();

// 1. Los Pockais, etapa a etapa.
namespace('pockai');
let sprites = 0;
for (const [stage, sub] of Object.entries(STAGES)) {
  const frames: Frame[] = [];
  for (const s of species) {
    const dir = join(SPECIES_DIR, s.spriteKey, sub);
    if (!existsSync(join(dir, 'anim.json'))) {
      console.warn(`  ${s.spriteKey}: sin etapa ${stage}, se omite`);
      continue;
    }
    frames.push(...bakeSheet(dir, s.defaultPalette, seed, s.spriteKey, (pose) => `${s.spriteKey}_${stage}_${pose}`));
  }
  const side = squareAndWrite(frames, 'pockai');
  sprites += frames.length;
  console.log(`  ${stage}: ${frames.length} láminas de ${side}×${side} px`);
}

// 2. El huevo, que solo tiene `idle` y va a su escala.
const egg = bakeSheet(join(SPECIES_DIR, 'egg'), { primary: '#ffd731', secondary: '#f2a007' }, seed, 'egg', () => 'egg_idle');
squareAndWrite(egg, 'pockai');
sprites += egg.length;

// 2b. El manifiesto de frames, para que SwiftUI anime sin leer ningún `anim.json`.
//
// Va en `WatchArt/` y **no** en `Shared/`: `Shared/` lo compilan los cuatro targets, así que este
// símbolo entraría también en la app de iPhone y en su widget, que no tienen este catálogo. Es la
// misma razón por la que el arte vive aquí (ver `project.yml`).
const manifest = [...DURATIONS.entries()].sort(([a], [b]) => a.localeCompare(b));
write(
  join(WATCH_ART, 'PockaiWatchFrames.swift'),
  `// Generado por \`pnpm generate:watch-assets\`. No editar a mano.
//
// Cuánto dura cada frame de cada pose, en milisegundos, tal como lo declara el \`anim.json\` de la
// especie. El número de frames es el largo de la lista: las láminas son
// \`pockai/<clave>_0\` … \`pockai/<clave>_<n-1>\`.

enum PockaiWatchFrames {
    /// "<especie>_<etapa>_<pose>" → duración en ms de cada frame.
    static let durations: [String: [Int]] = [
${manifest.map(([key, ms]) => `        "${key}": [${ms.join(', ')}],`).join('\n')}
    ]
}
`,
);

// 3. Los objetos, tal cual: ya son pixel art de 32 px guardado a ×2.
namespace('item');
let items = 0;
for (const file of readdirSync(ITEMS_DIR).filter((f) => f.endsWith('.png'))) {
  imageset(join('item', basename(file, '.png')), readFileSync(join(ITEMS_DIR, file)));
  items += 1;
}

// 4. El set de iconos propio, aplanado y rasterizado como plantilla.
namespace('ui');
for (const name of UI_ICONS) {
  const file = join(ICONS_DIR, `${name}.outline.svg`);
  if (!existsSync(file)) throw new Error(`el set no tiene el icono ${name}: ¿falta en icon-defs.mjs?`);
  const svg = flattenIcon(readFileSync(file, 'utf8'));
  // 24 pt de retícula × 2 = 48 px, que es lo que pide un imageset a 2x.
  imageset(join('ui', name), new Resvg(svg, { fitTo: { mode: 'width', value: 48 } }).render().asPng(), true);
}

// 5. Los colores de Flujo.
namespace('element');
for (const [name, hex] of Object.entries(ELEMENTS)) colorset(join('element', name), hex);

console.log(
  `generate-watch-assets: ${sprites} láminas en ${DURATIONS.size} poses, ${items} objetos, ` +
    `${UI_ICONS.length} iconos y ${Object.keys(ELEMENTS).length} colores → ${OUT.slice(ROOT.length + 1)}`,
);
if (PLANAS.length) {
  const poses = [...new Set(PLANAS.map((k) => k.split('_').pop()))].sort();
  console.warn(
    `  ⚠ ${PLANAS.length} de ${DURATIONS.size} poses son el mismo dibujo repetido (${poses.join(', ')}): ` +
      'se hornean sus frames, pero en la muñeca no se mueven. El arreglo está en la hoja de la ' +
      'especie, no aquí.',
  );
}
