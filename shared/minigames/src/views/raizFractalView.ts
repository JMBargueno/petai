import { E, N, S, W, cellMatches, type RaizBoard, type RaizState } from '../games/raizFractal';
import { el, type GameView } from './types';

const SEGMENTS: [number, string][] = [
  [N, 'M50 50V0'],
  [E, 'M50 50H100'],
  [S, 'M50 50V100'],
  [W, 'M50 50H0'],
];

function pieceSvg(mask: number) {
  const d = SEGMENTS.filter(([bit]) => mask & bit).map(([, p]) => p).join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}"/><circle cx="50" cy="50" r="9"/></svg>`;
}

const describe = (mask: number) =>
  [
    [N, 'arriba'],
    [E, 'derecha'],
    [S, 'abajo'],
    [W, 'izquierda'],
  ]
    .filter(([bit]) => mask & (bit as number))
    .map(([, t]) => t)
    .join(', ');

export function createRaizFractalView(): GameView<RaizState> {
  let gridHost: HTMLElement;
  let live: HTMLElement;
  let board: RaizBoard | null = null;
  let cells: HTMLButtonElement[] = [];
  const shown: string[] = [];
  let push: (i: number) => void = () => {};

  const build = (b: RaizBoard) => {
    board = b;
    gridHost.replaceChildren();
    gridHost.style.gridTemplateColumns = `repeat(${b.size}, 1fr)`;
    cells = b.cells.map((_, i) => {
      const c = el('button', 'pmg-root');
      c.type = 'button';
      c.addEventListener('click', () => push(i));
      if (i % b.size === 0 && Math.floor(i / b.size) === b.sourceRow) c.classList.add('is-source');
      gridHost.append(c);
      return c;
    });
    shown.length = 0;
  };

  return {
    mount(root, ctx, initial) {
      push = (i) => ctx.push({ kind: 'rotate', i });
      gridHost = el('div', 'pmg-roots');
      live = el('div', 'pmg-sr-only');
      live.setAttribute('aria-live', 'polite');
      root.append(gridHost, live, el('p', 'pmg-hint', 'Gira las raíces (clic, toque o Tab + Enter) para llevar la savia desde la semilla 🌱 hasta el borde derecho.'));
      build(initial.board);
    },
    render(s) {
      if (s.board !== board) build(s.board);
      const blooming = s.tick < s.bloomUntil;
      const hint = s.hints && !blooming ? s.board.cells.findIndex((_, i) => !cellMatches(s.board, i)) : -1;
      cells.forEach((c, i) => {
        const mask = s.board.cells[i];
        const key = `${mask}|${s.lit[i] ? 1 : 0}|${i === hint ? 1 : 0}|${blooming ? 1 : 0}`;
        if (shown[i] === key) return;
        shown[i] = key;
        c.innerHTML = pieceSvg(mask);
        c.classList.toggle('is-lit', !!s.lit[i]);
        c.classList.toggle('is-hint', i === hint);
        c.classList.toggle('is-bloom', blooming && !!s.lit[i]);
        c.setAttribute('aria-label', `Raíz ${i + 1}: conecta ${describe(mask)}${s.lit[i] ? ', con savia' : ''}`);
      });
      const msg = blooming ? '¡La raíz florece!' : '';
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => `🌸 ${s.boards} raíces · ★ ${s.score}`,
    dispose() {
      gridHost?.replaceChildren();
      cells = [];
    },
  };
}
