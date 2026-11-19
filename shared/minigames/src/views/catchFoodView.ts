import { applyBackdrop, itemUrl, piece, pieceUrl } from '../assets';
import { TICKS_PER_SECOND } from '../core/types';
import { CATCH_FOOD as C, isStunned, tideFlow, type CatchFoodState } from '../games/catchFood';
import { el, pct, toLogical, typing, type GameView, type ViewContext } from './types';

const GAME = 'catch_food';
/** Fruto de cada Flujo (foods.json), en el orden de `CATCH_FOOD.FLOWS`. */
const FRUITS = ['spicy_berry', 'sweet_coral', 'sun_seed', 'spark_candy', 'midnight_berry', 'dawn_honey'];
const FLOW_NAMES = ['Fuego', 'Agua', 'Planta', 'Eléctrico', 'Sombra', 'Luz'];
/** Tono medio de cada Flujo (`FLOW_PALETTES`), para teñir la marea. */
const FLOW_COLORS = ['#fb4903', '#4da2ff', '#55db9c', '#ffd731', '#5c4ade', '#e6dcf5'];
const NOISE_COLOR = '#6b6485';
const MOVE_KEYS: Record<string, -1 | 1> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
const SPARK_TICKS = TICKS_PER_SECOND / 5;

/**
 * Cosecha del Éter: el Pockai del jugador corre bajo la corriente y recoge los frutos que caen. La
 * vista solo pinta el estado: qué fruto vale doble, la racha y la estática salen de la lógica.
 */
export function createCatchFoodView(): GameView<CatchFoodState> {
  let arena: HTMLElement;
  let shadow: HTMLElement;
  let spark: HTMLElement;
  let chip: HTMLElement;
  let tideLine: HTMLElement;
  const nodes = new Map<number, HTMLElement>();
  const held = new Set<string>();
  let ctx: ViewContext;
  let lastDir: -1 | 0 | 1 = 0;
  let lastX = C.W / 2;
  let shownFlow = -1;
  let seenEvent = -1;
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

  const showTide = (flow: number) => {
    shownFlow = flow;
    arena.style.setProperty('--pmg-flow', FLOW_COLORS[flow]);
    chip.replaceChildren(piece(arena.ownerDocument, pieceUrl(GAME, 'tide_halo'), 'pmg-halo', FLOW_COLORS[flow]), piece(arena.ownerDocument, itemUrl(FRUITS[flow]), '', FLOW_COLORS[flow]));
    tideLine.textContent = `Sube la marea de ${FLOW_NAMES[flow]}: sus frutos valen doble.`;
  };

  return {
    mount(root, c, initial) {
      ctx = c;
      const doc = root.ownerDocument;
      arena = el('div', 'pmg-arena pmg-arena--harvest');
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Zona de juego: lleva a tu Pockai bajo los frutos que caen y esquiva el polvo estático');
      applyBackdrop(arena, GAME);
      chip = el('div', 'pmg-tidechip');
      chip.setAttribute('aria-hidden', 'true');
      shadow = el('span', 'pmg-shadow');
      spark = piece(doc, pieceUrl(GAME, 'catch_spark'), 'pmg-spark', '#fff1c2');
      spark.hidden = true;
      arena.append(el('div', 'pmg-tide'), chip, shadow, c.pet.el, spark);
      tideLine = el('p', 'pmg-hint pmg-hint--strong');
      tideLine.setAttribute('aria-live', 'polite');
      root.append(arena, tideLine, el('p', 'pmg-hint', 'Mueve el ratón, arrastra el dedo o usa ← → para llevar a tu Pockai. El polvo estático lo deja un momento sin poder recoger.'));
      showTide(tideFlow(initial));
      c.pet.play('idle');

      // Posición entera: el registro que viaja al servidor queda más corto y es igual de jugable.
      const onPointer = (e: PointerEvent) => ctx.push({ kind: 'move', x: Math.round(toLogical(e, arena, C.W, C.H).x) });
      listen(arena, 'pointermove', onPointer);
      listen(arena, 'pointerdown', (e) => {
        arena.setPointerCapture?.(e.pointerId);
        onPointer(e);
      });
      listen(window, 'keydown', (e) => {
        if (!(e.key in MOVE_KEYS) || typing(e)) return;
        // Las flechas mueven al Pockai, no el scroll del panel.
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
      const doc = arena.ownerDocument;
      const flow = tideFlow(s);
      if (flow !== shownFlow) showTide(flow);

      // El Pockai: corre hacia donde va, se queda quieto si no, y parpadea con la estática.
      const pet = ctx.pet;
      const dx = s.petX - lastX;
      lastX = s.petX;
      pet.el.style.left = shadow.style.left = pct(s.petX, C.W);
      pet.el.style.top = shadow.style.top = pct(C.PET_Y, C.H);
      if (Math.abs(dx) > 0.01) pet.face(dx);
      pet.play(Math.abs(dx) > 0.01 ? 'walk' : 'idle');
      pet.el.classList.toggle('is-stunned', isStunned(s));

      // Lo que acaba de pasar: un destello donde recogió, y el gesto del Pockai.
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        if (s.last.delta === 0) pet.play('hit', { once: true });
        else if (s.last.streakBonus) pet.play('happy', { once: true });
        spark.style.left = pct(s.petX, C.W);
        spark.style.top = pct(C.CATCH_Y - 14, C.H);
        spark.classList.toggle('is-big', s.last.tide || s.last.streakBonus);
      }
      spark.hidden = !s.last || s.last.delta === 0 || s.tick - s.last.tick > SPARK_TICKS;

      const alive = new Set<number>();
      for (const it of s.items) {
        alive.add(it.id);
        let node = nodes.get(it.id);
        if (!node) {
          node = el('span', `pmg-drop${it.tide ? ' is-tide' : ''}${it.kind < 0 ? ' is-noise' : ''}`);
          node.setAttribute('aria-hidden', 'true');
          if (it.tide) node.append(piece(doc, pieceUrl(GAME, 'tide_halo'), 'pmg-halo', FLOW_COLORS[it.kind]));
          node.append(it.kind < 0 ? piece(doc, pieceUrl(GAME, 'static_dust'), '', NOISE_COLOR) : piece(doc, itemUrl(FRUITS[it.kind]), '', FLOW_COLORS[it.kind]));
          arena.insertBefore(node, shadow);
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
      const recent = s.last && s.tick - s.last.tick < TICKS_PER_SECOND / 3;
      const flash = !recent ? '' : s.last!.delta > 0 ? ` +${s.last!.delta}` : ' estática';
      const streak = s.streak >= 2 ? ` · racha ${s.streak}` : '';
      return `★ ${s.score}${flash}${streak}`;
    },
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      nodes.clear();
    },
  };
}
