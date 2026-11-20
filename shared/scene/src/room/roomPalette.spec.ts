import { describe, expect, it } from 'vitest';
import { CLASSIC_ROOM_PALETTE, roomPaletteFor } from './roomPalette';

describe('roomPaletteFor', () => {
  it('el clásico, o sin paleta, es el dibujo original', () => {
    expect(roomPaletteFor('classic', { firefly: '#000000' })).toBe(CLASSIC_ROOM_PALETTE);
    expect(roomPaletteFor('cozy', null)).toBe(CLASSIC_ROOM_PALETTE);
    expect(roomPaletteFor(undefined, { firefly: '#000000' })).toBe(CLASSIC_ROOM_PALETTE);
  });

  it('traduce la paleta del tema a colores de Pixi', () => {
    const p = roomPaletteFor('cozy', {
      firefly: '#ffe08a',
      star: '#fff4e0',
      confetti: ['#ffc857', '#ff9f80'],
      wisp: ['#ffd9a8'],
      nightTint: '#2a160c',
      accent: '#b0502a',
      ambient: '#ffb070',
    });
    expect(p).toEqual({
      dust: 0xfff4e0,
      firefly: 0xffe08a,
      butterfly: [0xffc857, 0xff9f80],
      stardust: [0xffd9a8],
      twinkle: 0xfff4e0,
      nightTint: 0x2a160c,
      accent: 0xb0502a,
      ambient: 0xffb070,
    });
  });

  it('lo que falta o no vale se queda con el clásico', () => {
    const p = roomPaletteFor('cozy', { firefly: 'rojo', confetti: [], glowRgb: '255, 255, 255' });
    expect(p.firefly).toBe(CLASSIC_ROOM_PALETTE.firefly);
    expect(p.butterfly).toBe(CLASSIC_ROOM_PALETTE.butterfly);
    expect(p.ambient).toBeNull();
  });
});
