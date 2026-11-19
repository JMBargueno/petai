import { applyBackdrop, piece, pieceUrl } from '../assets';
import { E, N, S, W, cellMatches, type RaizBoard, type RaizState } from '../games/raizFractal';
import { el, pct, type GameView, type ViewContext } from './types';

const GAME = 'raiz_fractal';
const AW = 340;
const AH = 260;
/** El tablero: un cuadrado a la izquierda, con sitio para la semilla delante y el Pockai al lado. */
const GRID_X = 40;
const GRID_Y = 20;
const GRID = 220;
const PET_X = 292;
const PET_Y = 218;

const SEGMENTS: [number, string][] = [
  [N, 'M50 50V0'],
  [E, 'M50 50H100'],
  [S, 'M50 50V100'],
  [W, 'M50 50H0'],
];

/** La raíz de una casilla: tramos rectos y un nudo cuadrado, para que case con el pixel art. */
function rootSvg(mask: number) {
  const d = SEGMENTS.filter(([bit]) => mask & bit).map(([, p]) => p).join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="pmg-root__rim" d="${d}"/><path d="${d}"/><rect x="36" y="36" width="28" height="28"/></svg>`;
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

/** Raíz Fractal: se giran las raíces hasta que la savia de la semilla cruza el tablero y florece. */
export function createRaizFractalView(): GameView<RaizState> {
  let arena: HTMLElement;
  let gridHost: HTMLElement;
  let seed: HTMLElement;
  let bloom: HTMLElement;
  let live: HTMLElement;
  let ctx: ViewContext;
  let board: RaizBoard | null = null;
  let cells: HTMLButtonElement[] = [];
  const shown: string[] = [];
  let wasBlooming = false;
  let push: (i: number) => void = () => {};

  const rowY = (b: RaizBoard, row: number) => GRID_Y + ((row + 0.5) * GRID) / b.size;

  const build = (b: RaizBoard) => {
    board = b;
    gridHost.replaceChildren();
    gridHost.style.gridTemplateColumns = `repeat(${b.size}, 1fr)`;
    cells = b.cells.map((_, i) => {
      const c = el('button', 'pmg-root');
      c.type = 'button';
      c.addEventListener('click', () => push(i));
      gridHost.append(c);
      return c;
    });
    seed.style.top = pct(rowY(b, b.sourceRow), AH);
    shown.length = 0;
  };

  return {
    mount(root, c, initial) {
      ctx = c;
      const doc = root.ownerDocument;
      push = (i) => ctx.push({ kind: 'rotate', i });
      arena = el('div', 'pmg-arena pmg-arena--soil');
      applyBackdrop(arena, GAME);
      gridHost = el('div', 'pmg-roots');
      gridHost.style.left = pct(GRID_X, AW);
      gridHost.style.top = pct(GRID_Y, AH);
      gridHost.style.width = pct(GRID, AW);
      seed = el('span', 'pmg-drop');
      seed.append(piece(doc, pieceUrl(GAME, 'seed'), '', '#57cc99'));
      seed.style.left = pct(GRID_X - 18, AW);
      bloom = el('span', 'pmg-drop');
      bloom.append(piece(doc, pieceUrl(GAME, 'bloom'), '', '#f0fff6'));
      bloom.style.left = pct(GRID_X + GRID + 6, AW);
      bloom.hidden = true;
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, AW);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, AH);
      c.pet.face(-1);
      c.pet.play('idle');
      arena.append(gridHost, seed, bloom, shadow, c.pet.el);
      live = el('div', 'pmg-sr-only');
      live.setAttribute('aria-live', 'polite');
      root.append(arena, live, el('p', 'pmg-hint', 'Gira las raíces (clic, toque o Tab + Enter) para llevar la savia desde la semilla hasta el borde derecho.'));
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
        c.innerHTML = rootSvg(mask);
        c.classList.toggle('is-lit', !!s.lit[i]);
        c.classList.toggle('is-hint', i === hint);
        c.classList.toggle('is-bloom', blooming && !!s.lit[i]);
        c.setAttribute('aria-label', `Raíz ${i + 1}: conecta ${describe(mask)}${s.lit[i] ? ', con savia' : ''}`);
      });
      // La flor brota donde la savia sale por el borde derecho.
      const size = s.board.size;
      let exitRow = -1;
      if (blooming) for (let r = 0; r < size; r++) if (s.lit[r * size + size - 1] && s.board.cells[r * size + size - 1] & E) exitRow = r;
      bloom.hidden = exitRow < 0;
      if (exitRow >= 0) bloom.style.top = pct(rowY(s.board, exitRow), AH);
      if (blooming && !wasBlooming) ctx.pet.play('happy', { once: true });
      wasBlooming = blooming;
      const msg = blooming ? '¡La raíz florece!' : '';
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => `${s.boards} brotes · ★ ${s.score}`,
    dispose() {
      gridHost?.replaceChildren();
      cells = [];
    },
  };
}
