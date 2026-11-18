import { FARO as F, corruptCount, type FaroState } from '../games/faroClaridad';
import { el, on, typing, type GameView } from './types';

const MOVE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

export function createFaroClaridadView(): GameView<FaroState> {
  let arena: HTMLElement;
  const cells: HTMLElement[] = [];
  const cleanups: (() => void)[] = [];
  let aim = -1;

  return {
    mount(root, ctx) {
      arena = el('div', 'pmg-arena pmg-arena--dark pmg-cells');
      arena.style.gridTemplateColumns = `repeat(${F.COLS}, 1fr)`;
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Pantalla a oscuras: mueve el haz de luz sobre los bits corruptos');
      for (let i = 0; i < F.COLS * F.ROWS; i++) {
        const c = el('div', 'pmg-cell');
        c.style.setProperty('--p', '0');
        arena.append(c);
        cells.push(c);
      }
      root.append(arena, el('p', 'pmg-hint', 'Deja el haz quieto sobre un bit corrupto 👾 medio segundo para purificarlo. Ratón, dedo o flechas.'));

      const aimAt = (c: number) => {
        aim = c;
        ctx.push({ kind: 'aim', c });
      };
      const fromPointer = (e: PointerEvent) => {
        const r = arena.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * F.COLS);
        const y = Math.floor(((e.clientY - r.top) / Math.max(1, r.height)) * F.ROWS);
        const inside = x >= 0 && y >= 0 && x < F.COLS && y < F.ROWS;
        const c = inside ? y * F.COLS + x : -1;
        if (c !== aim) aimAt(c);
      };
      cleanups.push(
        on(arena, 'pointermove', fromPointer),
        on(arena, 'pointerdown', fromPointer),
        on(arena, 'pointerleave', (e: PointerEvent) => {
          if (e.pointerType === 'mouse') aimAt(-1);
        }),
        on(window, 'keydown', (e: KeyboardEvent) => {
          if (typing(e) || !(e.key in MOVE)) return;
          e.preventDefault();
          const cur = aim < 0 ? Math.floor((F.ROWS / 2) * F.COLS + F.COLS / 2) : aim;
          const [dx, dy] = MOVE[e.key];
          const x = Math.min(F.COLS - 1, Math.max(0, (cur % F.COLS) + dx));
          const y = Math.min(F.ROWS - 1, Math.max(0, Math.floor(cur / F.COLS) + dy));
          aimAt(y * F.COLS + x);
        }),
      );
    },
    render(s) {
      cells.forEach((c, i) => {
        const bad = s.corrupt[i];
        const text = bad ? '👾' : '';
        if (c.textContent !== text) c.textContent = text;
        c.classList.toggle('is-bad', bad);
        c.classList.toggle('is-beam', i === s.aim);
        c.style.setProperty('--p', i === s.aim && bad ? String(s.progress / F.PURIFY_TICKS) : '0');
      });
    },
    status: (s) => `✨ ${s.score} · corrupción ${Math.round((corruptCount(s) / (F.COLS * F.ROWS)) * 100)} %`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      cells.length = 0;
    },
  };
}
