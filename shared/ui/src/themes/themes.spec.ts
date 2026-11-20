import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEMES, getTheme } from './index';
import type { CanvasPalette, ColorScheme } from './types';

const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../styles');
const read = (f: string) => readFileSync(resolve(stylesDir, f), 'utf8');
const HEX = /^#[0-9a-f]{6}$/i;

describe('registro de temas', () => {
  it('ids únicos y el tema por defecto existe', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getTheme(DEFAULT_THEME).id).toBe(DEFAULT_THEME);
    expect(getTheme('no-existe').id).toBe(DEFAULT_THEME);
  });

  it('cada tema (salvo el clásico) tiene su CSS importado en themes.css', () => {
    const bundle = read('themes.css');
    for (const t of THEMES.filter((t) => t.id !== DEFAULT_THEME)) {
      expect(bundle, t.id).toContain(`@import './themes/${t.id}.css'`);
      expect(read(`themes/${t.id}.css`), t.id).toContain(`:root[data-theme='${t.id}']`);
    }
  });

  it('esquemas, muestra y paleta de canvas completos y en hex', () => {
    const keys: (keyof CanvasPalette)[] = ['sparkle', 'confetti', 'firefly', 'ember', 'wisp', 'star', 'glowRgb'];
    for (const t of THEMES) {
      expect(t.schemes.length, t.id).toBeGreaterThan(0);
      for (const s of t.schemes) {
        expect(t.swatch[s].every((c) => HEX.test(c)), `${t.id} swatch ${s}`).toBe(true);
        const p = t.canvas[s];
        for (const k of keys) expect(p[k], `${t.id}.${s}.${k}`).toBeTruthy();
        for (const c of [...p.sparkle, ...p.confetti, ...p.ember, ...p.wisp, p.firefly, p.star]) {
          expect(c, `${t.id}.${s}`).toMatch(HEX);
        }
        expect(p.glowRgb).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
      }
    }
  });
});

/** Saca los dos valores de `--token: light-dark(a, b)` (solo hex). */
function lightDark(css: string, token: string): Record<ColorScheme, string> | null {
  const m = css.match(new RegExp(`${token}:\\s*light-dark\\((#[0-9a-fA-F]{6}),\\s*(#[0-9a-fA-F]{6})\\)`));
  return m ? { light: m[1], dark: m[2] } : null;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

describe('contraste del texto (WCAG AA ≥ 4.5)', () => {
  const sources: Record<string, string> = { classic: read('tokens.css') };
  for (const t of THEMES) if (t.id !== DEFAULT_THEME) sources[t.id] = read(`themes/${t.id}.css`);

  for (const [id, css] of Object.entries(sources)) {
    for (const scheme of ['light', 'dark'] as const) {
      it(`${id} · ${scheme}`, () => {
        for (const ink of ['--ink', '--ink-muted']) {
          for (const bg of ['--bg', '--surface']) {
            const fg = lightDark(css, ink);
            const back = lightDark(css, bg);
            expect(fg && back, `${id} define ${ink} y ${bg}`).toBeTruthy();
            expect(contrast(fg![scheme], back![scheme]), `${ink} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });
    }
  }

  it('el botón principal del tema cozy se lee (texto blanco sobre el acento)', () => {
    const accent = read('themes/cozy.css').match(/--accent:\s*(#[0-9a-fA-F]{6})/)![1];
    expect(contrast('#ffffff', accent)).toBeGreaterThanOrEqual(4.5);
  });
});
