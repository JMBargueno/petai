import { TICKS_PER_SECOND } from '../core/types';
import { CATCH_FOOD as C, type CatchFoodState } from '../games/catchFood';
import { el, pct, toLogical, typing, type GameView, type ViewContext } from './types';

const GOOD = ['🍎', '🍓', '🍇', '🍪'];
const BAD = '🪨';
const MOVE_KEYS: Record<string, -1 | 1> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };

export function createCatchFoodView(): GameView<CatchFoodState> {
  let arena: HTMLElement;
  let basket: HTMLElement;
  const nodes = new Map<number, HTMLElement>();
  const held = new Set<string>();
  let ctx: ViewContext;
  let lastDir: -1 | 0 | 1 = 0;
  const cleanups: (() => void)[] = [];

  const pushDir = () => {
    let d = 0;
    for (const k of held) d += MOVE_KEYS[k] ?? 0;
    const dir = Math.sign(d) as -1 | 0 | 1;
    if (dir !== lastDir) {
      lastDir = dir;
      ctx.push({ kind: 'dir', d: dir });
    }
  };

  const listen = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void) => {
    target.addEventListener(type, fn as EventListener);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener));
  };

  return {
    mount(root, c) {
      ctx = c;
      arena = el('div', 'pmg-arena pmg-arena--sky pmg-arena--nocursor');
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Zona de juego: mueve la cesta para atrapar la comida');
      basket = el('span', 'pmg-sprite pmg-basket', '🧺');
      arena.append(basket);
      root.append(arena, el('p', 'pmg-hint', 'Mueve el ratón, arrastra el dedo o usa ← → para atrapar la comida. ¡Esquiva las piedras!'));

      // Posición entera: el registro que viaja al servidor queda más corto y es igual de jugable.
      const onPointer = (e: PointerEvent) => ctx.push({ kind: 'move', x: Math.round(toLogical(e, arena, C.W, C.H).x) });
      listen(arena, 'pointermove', onPointer);
      listen(arena, 'pointerdown', (e) => {
        arena.setPointerCapture?.(e.pointerId);
        onPointer(e);
      });
      listen(window, 'keydown', (e) => {
        if (!(e.key in MOVE_KEYS) || typing(e)) return;
        // Las flechas mueven la cesta, no el scroll del panel.
        e.preventDefault();
        held.add(e.key);
        pushDir();
      });
      listen(window, 'keyup', (e) => {
        held.delete(e.key);
        pushDir();
      });
      // Si la ventana pierde el foco con una tecla pulsada, el `keyup` no llega: se sueltan todas.
      listen(window, 'blur', () => {
        held.clear();
        pushDir();
      });
    },
    render(s) {
      basket.style.left = pct(s.basketX, C.W);
      basket.style.top = pct(C.BASKET_Y, C.H);
      const alive = new Set<number>();
      for (const it of s.items) {
        alive.add(it.id);
        let node = nodes.get(it.id);
        if (!node) {
          node = el('span', 'pmg-sprite pmg-item', it.kind < 0 ? BAD : GOOD[it.kind]);
          node.setAttribute('aria-hidden', 'true');
          arena.append(node);
          nodes.set(it.id, node);
        }
        node.style.left = pct(it.x, C.W);
        node.style.top = pct(it.y, C.H);
      }
      for (const [id, node] of nodes) {
        if (!alive.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    },
    status(s) {
      const recent = s.lastDelta && s.tick - s.lastDelta.tick < TICKS_PER_SECOND / 4;
      const flash = recent ? (s.lastDelta!.delta > 0 ? ' +1' : ' −1') : '';
      return `★ ${s.score}${flash}`;
    },
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      nodes.clear();
    },
  };
}
