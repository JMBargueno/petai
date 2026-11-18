import { REFLEX as R, meanReactionMs, type ReflexState } from '../games/reflex';
import { el, pct, typing, type GameView } from './types';

export function createReflexView(): GameView<ReflexState> {
  let target: HTMLButtonElement;
  let live: HTMLElement;
  let shownAt = -1;
  const cleanups: (() => void)[] = [];

  return {
    mount(root, ctx) {
      const arena = el('div', 'pmg-arena pmg-arena--radial');
      target = el('button', 'pmg-sprite pmg-target', '🎯');
      target.type = 'button';
      target.tabIndex = -1;
      target.setAttribute('aria-label', 'Objetivo');
      target.hidden = true;
      arena.append(target);
      live = el('div', 'pmg-sr-only');
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'assertive');
      root.append(live, arena, el('p', 'pmg-hint', 'Pulsa el objetivo en cuanto aparezca: con el ratón, tocándolo o con Espacio. En menos de 0,4 s puntúa doble.'));

      const hit = () => ctx.push({ kind: 'hit' });
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        hit();
      };
      // Espacio o Enter cuentan como pulsar el objetivo: el juego también se puede jugar con teclado.
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
      const t = s.target;
      target.hidden = !t;
      if (t && t.shownAt !== shownAt) {
        shownAt = t.shownAt;
        target.style.left = pct(t.x, R.W);
        target.style.top = pct(t.y, R.H);
        // Reinicia la animación de aparición.
        target.classList.remove('is-pop');
        void target.offsetWidth;
        target.classList.add('is-pop');
      }
      const msg = t ? '¡Objetivo!' : '';
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => {
      const ms = meanReactionMs(s);
      return `★ ${s.score} · aciertos ${s.hits}/${s.hits + s.misses}${ms ? ` · ${ms} ms` : ''}`;
    },
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
