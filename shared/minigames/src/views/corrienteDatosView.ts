import { CORRIENTE as C, type CorrienteState } from '../games/corrienteDatos';
import { el, on, typing, type GameView } from './types';

const PLAYER_Y = 0.84;
const SHIFT: Record<string, number> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };

export function createCorrienteDatosView(): GameView<CorrienteState> {
  let arena: HTMLElement;
  let player: HTMLElement;
  const nodes = new Map<number, HTMLElement>();
  const cleanups: (() => void)[] = [];

  const laneX = (lane: number) => `${((lane + 0.5) * 100) / C.LANES}%`;

  return {
    mount(root, ctx) {
      arena = el('div', 'pmg-arena pmg-arena--stream');
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Corriente de datos: cambia de carril para recoger paquetes');
      for (let l = 1; l < C.LANES; l++) {
        const sep = el('div', 'pmg-lane-sep');
        sep.style.left = `${(l * 100) / C.LANES}%`;
        arena.append(sep);
      }
      player = el('span', 'pmg-sprite pmg-swimmer', '🐟');
      player.style.top = `${PLAYER_Y * 100}%`;
      arena.append(player);
      root.append(arena, el('p', 'pmg-hint', 'Recoge los paquetes 💠 y esquiva los bloques corruptos 🧱. Usa ← →, A D o toca el carril.'));

      cleanups.push(
        on(arena, 'pointerdown', (e: PointerEvent) => {
          const r = arena.getBoundingClientRect();
          const lane = Math.floor(((e.clientX - r.left) / Math.max(1, r.width)) * C.LANES);
          ctx.push({ kind: 'lane', l: Math.min(C.LANES - 1, Math.max(0, lane)) });
        }),
        on(window, 'keydown', (e: KeyboardEvent) => {
          if (typing(e) || !(e.key in SHIFT)) return;
          e.preventDefault();
          ctx.push({ kind: 'shift', d: SHIFT[e.key] });
        }),
      );
    },
    render(s) {
      player.style.left = laneX(s.lane);
      player.classList.toggle('is-stunned', s.tick < s.stunnedUntil);
      const alive = new Set<number>();
      for (const o of s.objects) {
        alive.add(o.id);
        let node = nodes.get(o.id);
        if (!node) {
          node = el('span', 'pmg-sprite', o.kind === 'packet' ? '💠' : '🧱');
          node.setAttribute('aria-hidden', 'true');
          node.style.left = laneX(o.lane);
          arena.append(node);
          nodes.set(o.id, node);
        }
        node.style.top = `${((s.tick - o.spawn) / o.fall) * PLAYER_Y * 100}%`;
      }
      for (const [id, node] of nodes) {
        if (!alive.has(id)) {
          node.remove();
          nodes.delete(id);
        }
      }
    },
    status: (s) => `💠 ${s.score} · racha ${s.combo}${s.tick < s.stunnedUntil ? ' · ¡aturdido!' : ''}`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      nodes.clear();
    },
  };
}
