import { CIFRADO as C, litGlyph, type CifradoState } from '../games/cifrado';
import { button, el, on, typing, type GameView } from './types';

export const GLYPHS = ['🔥', '🌊', '🌿', '⚡', '🌙', '☀️'];
const NAMES = ['Fuego', 'Agua', 'Planta', 'Eléctrico', 'Sombra', 'Luz'];

export function createCifradoView(): GameView<CifradoState> {
  const pads: HTMLButtonElement[] = [];
  let live: HTMLElement;
  let replay: HTMLButtonElement | null = null;
  const cleanups: (() => void)[] = [];

  return {
    mount(root, ctx, initial) {
      const board = el('div', 'pmg-arena pmg-arena--shadow pmg-glyphs');
      for (let g = 0; g < C.GLYPHS; g++) {
        const b = button('pmg-glyph', GLYPHS[g], `${NAMES[g]} (tecla ${g + 1})`);
        cleanups.push(on(b, 'click', () => ctx.push({ kind: 'press', g })));
        pads.push(b);
        board.append(b);
      }
      live = el('div', 'pmg-feedback');
      live.setAttribute('aria-live', 'polite');
      root.append(board, live);
      if (initial.easy) {
        replay = button('pmg-btn', 'Repetir secuencia');
        cleanups.push(on(replay, 'click', () => ctx.push({ kind: 'replay' })));
        root.append(replay);
      }
      root.append(el('p', 'pmg-hint', 'Mira el orden en que se encienden los glifos y repítelo (clic, toque o teclas 1–6).'));
      cleanups.push(
        on(window, 'keydown', (e: KeyboardEvent) => {
          const g = Number(e.key) - 1;
          if (e.repeat || typing(e) || !(g >= 0 && g < C.GLYPHS)) return;
          e.preventDefault();
          ctx.push({ kind: 'press', g });
        }),
      );
    },
    render(s) {
      const lit = litGlyph(s);
      const recent = s.last && s.tick - s.last.tick < 15 ? s.last : null;
      pads.forEach((b, g) => {
        b.classList.toggle('is-lit', lit === g || (!!recent && recent.ok && recent.glyph === g));
        b.classList.toggle('is-wrong', !!recent && !recent.ok && recent.glyph === g);
        b.setAttribute('aria-disabled', String(s.phase !== 'input'));
      });
      if (replay) replay.disabled = s.phase !== 'input';
      // Durante la reproducción se anuncia cada glifo para quien no lo ve.
      const msg = s.phase === 'show' ? (lit >= 0 ? NAMES[lit] : 'Mira…') : `Tu turno: ${s.pos}/${s.sequence.length}`;
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => `★ ${s.score} · ronda ${s.rounds + 1} · ${s.sequence.length} glifos`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      pads.length = 0;
    },
  };
}
