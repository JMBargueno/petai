import { applyBackdrop, piece, pieceUrl } from '../assets';
import { FARO as F, corruptCount, type FaroState } from '../games/faroClaridad';
import { el, on, pct, typing, type GameView, type ViewContext } from './types';

const GAME = 'faro_claridad';
/** La rejilla ocupa la sala a oscuras; debajo queda la pasarela por la que camina el Pockai. */
const GRID_H = 0.78;
const PET_Y = 250;

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

/** Faro de Claridad: el Pockai lleva el haz desde la pasarela y lo deja quieto sobre los bits corruptos. */
export function createFaroClaridadView(): GameView<FaroState> {
  let arena: HTMLElement;
  let grid: HTMLElement;
  let shaft: HTMLElement;
  let shadow: HTMLElement;
  let ctx: ViewContext;
  const cells: HTMLElement[] = [];
  const shown: boolean[] = [];
  const cleanups: (() => void)[] = [];
  let aim = -1;
  let petCol = F.COLS / 2 - 0.5;
  let seenEvent = -1;

  return {
    mount(root, c) {
      ctx = c;
      arena = el('div', 'pmg-arena pmg-arena--dark');
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Sala a oscuras: lleva el haz de luz sobre los bits corruptos');
      applyBackdrop(arena, GAME);
      grid = el('div', 'pmg-cells');
      grid.style.height = `${GRID_H * 100}%`;
      grid.style.gridTemplateColumns = `repeat(${F.COLS}, 1fr)`;
      for (let i = 0; i < F.COLS * F.ROWS; i++) {
        const cell = el('div', 'pmg-cell');
        cell.style.setProperty('--p', '0');
        grid.append(cell);
        cells.push(cell);
      }
      shaft = el('div', 'pmg-shaft');
      shaft.hidden = true;
      shadow = el('span', 'pmg-shadow');
      c.pet.el.classList.add('pmg-pet--glide');
      shadow.classList.add('pmg-pet--glide');
      c.pet.play('idle');
      arena.append(grid, shaft, shadow, c.pet.el);
      root.append(arena, el('p', 'pmg-hint', 'Deja el haz quieto medio segundo sobre un bit corrupto para devolverle la claridad, antes de que contagie a los de al lado. Ratón, dedo o flechas.'));

      const aimAt = (cell: number) => {
        aim = cell;
        ctx.push({ kind: 'aim', c: cell });
      };
      const fromPointer = (e: PointerEvent) => {
        const r = grid.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * F.COLS);
        const y = Math.floor(((e.clientY - r.top) / Math.max(1, r.height)) * F.ROWS);
        const inside = x >= 0 && y >= 0 && x < F.COLS && y < F.ROWS;
        const cell = inside ? y * F.COLS + x : -1;
        if (cell !== aim) aimAt(cell);
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
      const doc = arena.ownerDocument;
      cells.forEach((cell, i) => {
        const bad = s.corrupt[i];
        if (shown[i] !== bad) {
          shown[i] = bad;
          cell.replaceChildren(...(bad ? [piece(doc, pieceUrl(GAME, 'corrupt_bit'), 'pmg-cell__bit', '#6b6485')] : []));
          cell.classList.toggle('is-bad', bad);
        }
        cell.classList.toggle('is-beam', i === s.aim);
        cell.style.setProperty('--p', i === s.aim && bad ? String(s.progress / F.PURIFY_TICKS) : '0');
      });
      // El Pockai se pone bajo la columna a la que apunta y el haz sube desde él hasta la casilla.
      if (s.aim >= 0) {
        const col = s.aim % F.COLS;
        const row = Math.floor(s.aim / F.COLS);
        if (col !== petCol) ctx.pet.face(col - petCol);
        petCol = col;
        const top = ((row + 0.5) / F.ROWS) * GRID_H * 100;
        shaft.style.left = `${((col + 0.5) / F.COLS) * 100}%`;
        shaft.style.top = `${top}%`;
        shaft.style.height = `${(PET_Y / 260) * 100 - 14 - top}%`;
      }
      shaft.hidden = s.aim < 0;
      const x = `${((petCol + 0.5) / F.COLS) * 100}%`;
      ctx.pet.el.style.left = shadow.style.left = x;
      ctx.pet.el.style.top = shadow.style.top = pct(PET_Y, 260);
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        ctx.pet.play('happy', { once: true });
      }
    },
    status: (s) => `★ ${s.score} · corrupción ${Math.round((corruptCount(s) / (F.COLS * F.ROWS)) * 100)} %`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      cells.length = 0;
    },
  };
}
