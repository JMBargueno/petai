/**
 * Colores de la sala que dependen del tema de la app (clásico, cozy…): las partículas de ambiente,
 * los destellos, la penumbra de cuando el Pockai duerme, el resalte del mueble elegido y un tinte
 * general. Lo demás (carcasa, muebles, criaturas, cielo) es arte o dato de juego y no cambia.
 *
 * El anfitrión manda la paleta del tema con `setTheme` (CanvasPalette de @pockai/ui, en hex). El
 * clásico es el dibujo original: con él, o sin paleta, la sala usa CLASSIC_ROOM_PALETTE tal cual.
 */
import type { ThemePalette } from '../protocol';

export interface RoomPalette {
  /** Motas de polvo a la luz. */
  dust: number;
  firefly: number;
  /** Mariposas del jardín (se elige una al azar). */
  butterfly: readonly number[];
  /** Polvo de estrellas que sube en la sala celeste. */
  stardust: readonly number[];
  /** Destellos que titilan en la carcasa. */
  twinkle: number;
  /** Penumbra cuando el Pockai duerme con las luces apagadas. */
  nightTint: number;
  /** Resalte del mueble seleccionado. */
  accent: number;
  /** Tinte general del tema sobre la sala (null = sin tinte). */
  ambient: number | null;
}

/** Fuerza del tinte general del tema: un velo, no un filtro de color. */
export const AMBIENT_ALPHA = 0.1;

export const CLASSIC_ROOM_PALETTE: RoomPalette = {
  dust: 0xfff3c8,
  firefly: 0xd9ff7a,
  butterfly: [0xffd84d, 0xff8fb1, 0x9fd8ff, 0xffffff],
  stardust: [0xffe9a0, 0xd6c8ff],
  twinkle: 0xfff8e6,
  nightTint: 0x1b1846,
  accent: 0x5c4ade,
  ambient: null,
};

function hex(v: unknown): number | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? parseInt(v.slice(1), 16) : null;
}

function hexList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map(hex).filter((n): n is number => n !== null);
  return out.length ? out : null;
}

/** Paleta de la sala para un tema; cada clave que falte o no valga se queda con la del clásico. */
export function roomPaletteFor(themeId: string | null | undefined, palette: ThemePalette | null | undefined): RoomPalette {
  if (!palette || !themeId || themeId === 'classic') return CLASSIC_ROOM_PALETTE;
  const c = CLASSIC_ROOM_PALETTE;
  return {
    dust: hex(palette.star) ?? c.dust,
    firefly: hex(palette.firefly) ?? c.firefly,
    butterfly: hexList(palette.confetti) ?? c.butterfly,
    stardust: hexList(palette.wisp) ?? c.stardust,
    twinkle: hex(palette.star) ?? c.twinkle,
    nightTint: hex(palette.nightTint) ?? c.nightTint,
    accent: hex(palette.accent) ?? c.accent,
    ambient: hex(palette.ambient),
  };
}
