import { describe, expect, it } from 'vitest';
import { FLOW_PALETTES, GridSink } from '@pockai/scene/effects';
import { MP3_H, MP3_W, drawMp3 } from './mp3Art';

function draw(playing: boolean, beat = 0, element = 'water', bars = 3) {
  const sink = new GridSink(MP3_W, MP3_H);
  drawMp3(sink, { palette: FLOW_PALETTES[element], playing, beat, bars, seed: 5 });
  return sink;
}

describe('reproductor MP3 del Éter (spec 42)', () => {
  it('cabe en su rejilla con pocos colores en todos los Flujos', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      const s = draw(true, 2, el);
      expect(s.count()).toBeGreaterThan(500);
      expect(s.colors().size).toBeLessThanOrEqual(12);
    }
  });

  it('sonando, el ecualizador baila con el beat y brilla; parado no', () => {
    const p = FLOW_PALETTES['water'];
    expect(draw(true, 1).cells).not.toEqual(draw(true, 2).cells);
    expect(draw(false, 1).cells).toEqual(draw(false, 2).cells);
    expect(draw(true).colors()).toContain(p.glow);
  });
});
