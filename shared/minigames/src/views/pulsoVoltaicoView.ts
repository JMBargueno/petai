import { PULSO as P, type PulsoState } from '../games/pulsoVoltaico';
import { button, el, on, typing, type GameView } from './types';

const LINE = 0.82; // altura de la línea de sinapsis (fracción de la arena)
const KEYS: Record<string, number> = { j: 0, J: 0, '1': 0, ArrowLeft: 0, k: 1, K: 1, '2': 1, ArrowDown: 1, l: 2, L: 2, '3': 2, ArrowRight: 2 };
const GRADE_TEXT = { perfect: '¡Perfecto!', good: 'Bien', miss: 'Fallo' } as const;

export function createPulsoVoltaicoView(): GameView<PulsoState> {
  let arena: HTMLElement;
  let feedback: HTMLElement;
  const notes = new Map<number, HTMLElement>();
  const pads: HTMLButtonElement[] = [];
  const cleanups: (() => void)[] = [];

  return {
    mount(root, ctx) {
      arena = el('div', 'pmg-arena pmg-arena--volt');
      for (let l = 0; l < P.LANES; l++) {
        const lane = el('div', 'pmg-lane');
        lane.style.left = `${(l * 100) / P.LANES}%`;
        lane.style.width = `${100 / P.LANES}%`;
        arena.append(lane);
      }
      const line = el('div', 'pmg-hitline');
      line.style.top = `${LINE * 100}%`;
      feedback = el('div', 'pmg-feedback');
      feedback.setAttribute('aria-live', 'polite');
      arena.append(line, feedback);

      const padRow = el('div', 'pmg-pads');
      ['J', 'K', 'L'].forEach((key, lane) => {
        const b = button('pmg-pad', key, `Carril ${lane + 1}`);
        cleanups.push(
          on(b, 'pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            ctx.push({ kind: 'tap', lane });
          }),
        );
        pads.push(b);
        padRow.append(b);
      });
      root.append(arena, padRow, el('p', 'pmg-hint', 'Pulsa el carril cuando el pulso cruce la línea: J K L, flechas, 1 2 3 o tocando los botones.'));

      cleanups.push(
        on(window, 'keydown', (e: KeyboardEvent) => {
          if (e.repeat || typing(e) || !(e.key in KEYS)) return;
          e.preventDefault();
          ctx.push({ kind: 'tap', lane: KEYS[e.key] });
        }),
      );
    },
    render(s) {
      const alive = new Set<number>();
      s.notes.forEach((n, i) => {
        const from = n.hit - s.fallTicks;
        if (n.grade === 'perfect' || n.grade === 'good' || s.tick < from || s.tick > n.hit + s.good + 6) return;
        alive.add(i);
        let node = notes.get(i);
        if (!node) {
          node = el('span', 'pmg-sprite pmg-note', '⚡');
          node.setAttribute('aria-hidden', 'true');
          node.style.left = `${((n.lane + 0.5) * 100) / P.LANES}%`;
          arena.append(node);
          notes.set(i, node);
        }
        node.style.top = `${((s.tick - from) / s.fallTicks) * LINE * 100}%`;
        node.classList.toggle('is-miss', n.grade === 'miss');
      });
      for (const [i, node] of notes) {
        if (!alive.has(i)) {
          node.remove();
          notes.delete(i);
        }
      }
      const recent = s.last && s.tick - s.last.tick < 30 ? s.last : null;
      const text = recent ? GRADE_TEXT[recent.grade] : '';
      if (feedback.textContent !== text) feedback.textContent = text;
      pads.forEach((b, l) => b.classList.toggle('is-hit', !!recent && recent.lane === l && recent.grade !== 'miss'));
    },
    status: (s) => `★ ${s.score} · racha ${s.combo} · ${s.bpm} BPM`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      notes.clear();
      pads.length = 0;
    },
  };
}
