import { MEMORY_MATCH as M, pairsFound, type MemoryMatchState } from '../games/memoryMatch';
import { el, type GameView } from './types';

const FACES = ['🐉', '🌿', '🌊', '🔥', '⭐', '🌙', '🍄', '💎'];

export function createMemoryMatchView(): GameView<MemoryMatchState> {
  const cards: HTMLButtonElement[] = [];
  const cleanups: (() => void)[] = [];

  return {
    mount(root, ctx) {
      const grid = el('div', 'pmg-grid');
      for (let i = 0; i < M.PAIRS * 2; i++) {
        const b = el('button', 'pmg-card');
        b.type = 'button';
        const onClick = () => ctx.push({ kind: 'flip', i });
        b.addEventListener('click', onClick);
        cleanups.push(() => b.removeEventListener('click', onClick));
        cards.push(b);
        grid.append(b);
      }
      root.append(grid, el('p', 'pmg-hint', `Encuentra las ${M.PAIRS} parejas. Cuanto más rápido y con menos fallos, más puntos. Puedes usar Tab y Enter.`));
    },
    render(s) {
      cards.forEach((b, i) => {
        const matched = s.matched[i];
        const up = matched || s.flipped.includes(i);
        const face = FACES[s.deck[i]];
        const text = up ? face : '❔';
        if (b.textContent !== text) b.textContent = text;
        b.classList.toggle('is-up', up);
        b.classList.toggle('is-ok', matched);
        b.disabled = matched;
        b.setAttribute('aria-label', `Carta ${i + 1}: ${matched ? `${face}, emparejada` : up ? face : 'boca abajo'}`);
      });
    },
    status: (s) => `🃏 ${pairsFound(s)}/${M.PAIRS} parejas · fallos ${s.misses}`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      cards.length = 0;
    },
  };
}
