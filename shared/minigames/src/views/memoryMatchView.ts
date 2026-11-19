import { applyBackdrop, itemUrl, piece, pieceUrl } from '../assets';
import { isPeeking, pairsFound, type MemoryMatchState } from '../games/memoryMatch';
import { el, pct, type GameView, type ViewContext } from './types';

const GAME = 'memory_match';
const W = 340;
const H = 260;
/** Lado de una faceta y paso de la rejilla, en px lógicos. */
const CARD = 48;
const STEP = 54;
const COLS = 4;
const LEFT = 14;
/** Dónde espera el Pockai: a la derecha del tablero. */
const PET_X = 288;
const PET_Y = 238;

/** Los recuerdos de cada faceta: los frutos de los Seis Flujos, un Códice y un nudo del Telar. */
const FACES: { name: string; url: () => string | undefined; color: string }[] = [
  { name: 'Baya Ígnea', url: () => itemUrl('spicy_berry'), color: '#fb4903' },
  { name: 'Coral Glaseado', url: () => itemUrl('sweet_coral'), color: '#4da2ff' },
  { name: 'Semilla Solar', url: () => itemUrl('sun_seed'), color: '#55db9c' },
  { name: 'Caramelo de Chispa', url: () => itemUrl('spark_candy'), color: '#ffd731' },
  { name: 'Mora de Medianoche', url: () => itemUrl('midnight_berry'), color: '#5c4ade' },
  { name: 'Miel de Alba', url: () => itemUrl('dawn_honey'), color: '#fff6d6' },
  { name: 'Códice', url: () => pieceUrl('reflex', 'codex'), color: '#e9ccff' },
  { name: 'Nudo del Telar', url: () => itemUrl('evolution_stone'), color: '#a99cff' },
];

/**
 * Cristal de Recuerdos: las facetas son botones de verdad (Tab y Enter), con su arte encima. El
 * Pockai mira el tablero y reacciona a cada pareja.
 */
export function createMemoryMatchView(): GameView<MemoryMatchState> {
  const cards: HTMLButtonElement[] = [];
  const shown: string[] = [];
  const cleanups: (() => void)[] = [];
  let ctx: ViewContext;
  let arena: HTMLElement;
  let seenEvent = -1;
  let done = false;

  return {
    mount(root, c, initial) {
      ctx = c;
      arena = el('div', 'pmg-arena pmg-arena--crystal');
      applyBackdrop(arena, GAME);
      const rows = Math.ceil(initial.deck.length / COLS);
      const top = Math.round((H - 30 - (rows * STEP - (STEP - CARD))) / 2);
      for (let i = 0; i < initial.deck.length; i++) {
        const b = el('button', 'pmg-facet');
        b.type = 'button';
        b.style.left = pct(LEFT + (i % COLS) * STEP, W);
        b.style.top = pct(top + Math.floor(i / COLS) * STEP, H);
        const onClick = () => ctx.push({ kind: 'flip', i });
        b.addEventListener('click', onClick);
        cleanups.push(() => b.removeEventListener('click', onClick));
        cards.push(b);
        arena.append(b);
      }
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, W);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, H);
      c.pet.face(-1);
      c.pet.play('idle');
      c.pet.play('surprised', { once: true });
      arena.append(shadow, c.pet.el);
      const hint = initial.hints ? ' La pareja de la faceta destapada brilla.' : '';
      root.append(arena, el('p', 'pmg-hint', `Mira el destello del Cristal y empareja las ${initial.pairs} parejas de recuerdos. Con menos fallos y más rapidez, más puntos. Puedes usar Tab y Enter.${hint}`));
    },
    render(s) {
      const doc = arena.ownerDocument;
      const peeking = isPeeking(s);
      const open = s.hints && s.flipped.length === 1 ? s.flipped[0] : -1;
      cards.forEach((b, i) => {
        const matched = s.matched[i];
        const up = peeking || matched || s.flipped.includes(i);
        const hint = open >= 0 && i !== open && !matched && s.deck[i] === s.deck[open];
        const key = `${up ? 1 : 0}${matched ? 1 : 0}${hint ? 1 : 0}`;
        if (shown[i] === key) return;
        shown[i] = key;
        const face = FACES[s.deck[i]];
        b.replaceChildren(
          piece(doc, pieceUrl(GAME, up ? 'facet_front' : 'facet_back'), '', up ? '#ece8ff' : '#5c4ade'),
          ...(up ? [piece(doc, face.url(), 'pmg-facet__face', face.color)] : []),
        );
        b.classList.toggle('is-up', up);
        b.classList.toggle('is-ok', matched);
        b.classList.toggle('is-hint', hint);
        b.disabled = matched;
        b.setAttribute('aria-label', `Faceta ${i + 1}: ${matched ? `${face.name}, emparejada` : up ? face.name : 'apagada'}`);
      });
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        ctx.pet.play(s.last.ok ? 'happy' : 'hit', { once: true });
      }
      if (s.completedAt >= 0 && !done) {
        done = true;
        ctx.pet.play('celebrate', { once: true });
      }
    },
    status: (s) => (isPeeking(s) ? 'Mira el destello…' : `${pairsFound(s)}/${s.pairs} recuerdos · fallos ${s.misses}`),
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      cards.length = 0;
    },
  };
}
