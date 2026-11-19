import { applyBackdrop, piece, pieceUrl } from '../assets';
import { REFLEX as R, isTangled, meanReactionMs, type ReflexState } from '../games/reflex';
import { el, pct, typing, type GameView, type ViewContext } from './types';

const GAME = 'reflex';
/** Dónde pesca el Pockai: en la orilla, abajo a la izquierda. */
const PET_X = 46;
const PET_Y = 244;
const NOISE_COLOR = '#6b6485';

/**
 * Pesca de Códices: el Pockai espera en la orilla del Telar y tira del sedal cuando el Custodio lo
 * dice. Pulsar el Códice, tocarlo o Espacio valen lo mismo: la lógica solo sabe de «tirar».
 */
export function createReflexView(): GameView<ReflexState> {
  let arena: HTMLElement;
  let target: HTMLButtonElement;
  let live: HTMLElement;
  let ctx: ViewContext;
  let shownAt = -1;
  let seenEvent = -1;
  const cleanups: (() => void)[] = [];

  return {
    mount(root, c) {
      ctx = c;
      arena = el('div', 'pmg-arena pmg-arena--loom');
      applyBackdrop(arena, GAME);
      target = el('button', 'pmg-catch');
      target.type = 'button';
      target.tabIndex = -1;
      target.hidden = true;
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, R.W);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, R.H);
      c.pet.play('idle');
      arena.append(target, shadow, c.pet.el);
      live = el('div', 'pmg-sr-only');
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'assertive');
      root.append(
        live,
        arena,
        el('p', 'pmg-hint', 'Pesca el Códice en cuanto aflore: con el ratón, tocándolo o con Espacio. En menos de 0,4 s puntúa doble. Si está roto y sin tejer, déjalo pasar: enreda el sedal.'),
      );

      const hit = () => ctx.push({ kind: 'hit' });
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        hit();
      };
      // Espacio o Enter tiran del sedal: el juego también se puede jugar con teclado.
      const onKey = (e: KeyboardEvent) => {
        if ((e.key !== ' ' && e.key !== 'Enter') || typing(e)) return;
        e.preventDefault();
        hit();
      };
      target.addEventListener('pointerdown', onDown);
      window.addEventListener('keydown', onKey);
      cleanups.push(
        () => target.removeEventListener('pointerdown', onDown),
        () => window.removeEventListener('keydown', onKey),
      );
    },
    render(s) {
      const doc = arena.ownerDocument;
      const t = s.target;
      target.hidden = !t;
      if (t && t.shownAt !== shownAt) {
        shownAt = t.shownAt;
        target.style.left = pct(t.x, R.W);
        target.style.top = pct(t.y, R.H);
        target.replaceChildren(piece(doc, pieceUrl(GAME, 'ripple'), 'pmg-catch__ripple', '#4da2ff'), piece(doc, pieceUrl(GAME, t.lure ? 'lure' : 'codex'), '', t.lure ? NOISE_COLOR : '#e9ccff'));
        target.classList.toggle('is-lure', t.lure);
        target.setAttribute('aria-label', t.lure ? 'Códice sin tejer: no lo pesques' : 'Códice: péscalo');
        ctx.pet.face(t.x < PET_X ? -1 : 1);
        // Reinicia la animación de aparición.
        target.classList.remove('is-pop');
        void target.offsetWidth;
        target.classList.add('is-pop');
      }
      const tangled = isTangled(s);
      arena.classList.toggle('is-tangled', tangled);
      ctx.pet.el.classList.toggle('is-stunned', tangled);
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        if (s.last.kind === 'fast') ctx.pet.play('happy', { once: true });
        else if (s.last.kind === 'catch') ctx.pet.play('attack', { once: true });
        else if (s.last.kind === 'lure') ctx.pet.play('hit', { once: true });
      }
      const msg = tangled ? 'Sedal enredado' : t ? (t.lure ? 'Sin tejer: déjalo' : '¡Códice!') : '';
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => {
      const ms = meanReactionMs(s);
      return `★ ${s.score} · ${s.hits} Códices${isTangled(s) ? ' · sedal enredado' : ms ? ` · ${ms} ms` : ''}`;
    },
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
