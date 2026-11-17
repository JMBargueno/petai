#!/usr/bin/env tsx
/**
 * Genera el arte isométrico de los muebles del hábitat.
 *
 *   pnpm generate:furniture            → shared/assets/furniture/<id>_{a,b}.svg + furniture.json
 *   pnpm generate:furniture --preview  → sprite-previews/furniture-contact.png (revisión visual)
 *
 * furniture.json da, por mueble y orientación, el tamaño del lienzo y el ancla (vértice superior de
 * la huella) para colocarlo en la sala. Ver scripts/sprites/furniture.ts y GUIA_ARTISTICA §7.4.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { FURNITURE_ART, renderFurniture, TILE_H, TILE_W, type Orientation } from './sprites/furniture';

const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'shared', 'assets', 'furniture');
const ORIENTATIONS: Orientation[] = ['a', 'b'];

const catalog = JSON.parse(readFileSync(join(ROOT, 'shared', 'game-data', 'habitats.json'), 'utf8')) as {
  furniture: { id: string; footprint?: [number, number] }[];
};

// Coherencia con el catálogo: todo mueble tiene arte y la misma huella.
for (const f of catalog.furniture) {
  const art = FURNITURE_ART.find((a) => a.id === f.id);
  if (!art) throw new Error(`Falta el arte de "${f.id}" en scripts/sprites/furniture.ts`);
  const fp = f.footprint ?? [1, 1];
  if (art.footprint[0] !== fp[0] || art.footprint[1] !== fp[1]) {
    throw new Error(`Huella de "${f.id}": arte ${art.footprint.join('×')} ≠ habitats.json ${fp.join('×')}`);
  }
}

if (process.argv.includes('--preview')) {
  // Hoja de contactos: cada mueble en a y b sobre su rombo de huella y una rejilla de referencia.
  const cell = 150;
  const cols = 4;
  const items = FURNITURE_ART.flatMap((art) => ORIENTATIONS.map((o) => ({ art, o, r: renderFurniture(art, o) })));
  const rows = Math.ceil(items.length / cols);
  let body = '<rect width="100%" height="100%" fill="#fbfaff"/>';
  items.forEach(({ art, o, r }, k) => {
    const cx = (k % cols) * cell + cell / 2;
    const cy = Math.floor(k / cols) * cell + cell - 40;
    const [w, d] = o === 'a' ? art.footprint : [art.footprint[1], art.footprint[0]];
    const P = (x: number, y: number) => `${cx + (x - y) * (TILE_W / 2)} ${cy - ((w + d) * TILE_H) / 2 + (x + y) * (TILE_H / 2)}`;
    body += `<path d="M${P(0, 0)}L${P(w, 0)}L${P(w, d)}L${P(0, d)}Z" fill="#e9e6f5" stroke="#b9b5d8"/>`;
    const ax = cx - r.anchorX;
    const ay = cy - ((w + d) * TILE_H) / 2 - r.anchorY;
    body += `<svg x="${ax}" y="${ay}" width="${r.width}" height="${r.height}" viewBox="0 0 ${r.width} ${r.height}">${r.svg
      .replace(/^<svg[^>]*>/, `<svg viewBox="${-r.anchorX} ${-r.anchorY} ${r.width} ${r.height}">`)}</svg>`;
    body += `<text x="${(k % cols) * cell + 6}" y="${Math.floor(k / cols) * cell + 14}" font-family="sans-serif" font-size="11" font-weight="700" fill="#0b0a14">${art.id} · ${o}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}">${body}</svg>`;
  const out = join(ROOT, 'sprite-previews', 'furniture-contact.png');
  mkdirSync(join(ROOT, 'sprite-previews'), { recursive: true });
  writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'zoom', value: 1.5 } }).render().asPng());
  console.log(`✓ hoja de contactos: ${out}`);
} else {
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, unknown> = {};
  for (const art of FURNITURE_ART) {
    const entry: Record<string, unknown> = { footprint: art.footprint, wall: !!art.wall };
    for (const o of ORIENTATIONS) {
      const r = renderFurniture(art, o);
      writeFileSync(join(OUT, `${art.id}_${o}.svg`), r.svg);
      entry[o] = { width: r.width, height: r.height, anchorX: r.anchorX, anchorY: r.anchorY };
    }
    manifest[art.id] = entry;
  }
  writeFileSync(join(OUT, 'furniture.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ ${FURNITURE_ART.length} muebles × ${ORIENTATIONS.length} orientaciones en shared/assets/furniture/`);
}
