import { applyBackdrop, piece, pieceUrl } from '../assets';
import { CORRIENTE as C, type CorrienteState } from '../games/corrienteDatos';
import { el, on, typing, type GameView, type ViewContext } from './types';

const GAME = 'corriente_datos';
/** Altura a la que nada el Pockai (fracción de la arena): ahí recoge y ahí choca. */
const PLAYER_Y = 0.84;
/** El sprite se ancla por los pies; su cuerpo queda centrado un poco más arriba. */
const FEET = 0.08;
const SHIFT: Record<string, number> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };

/** Corriente de Datos: el Pockai del jugador nada corriente arriba y cambia de carril. */
export function createCorrienteDatosView(): GameView<CorrienteState> {
  let arena: HTMLElement;
  let ctx: ViewContext;
  let lastLane = -1;
  let seenEvent = -1;
  const nodes = new Map<number, HTMLElement>();
  const cleanups: (() => void)[] = [];

  const laneX = (lane: number) => `${((lane + 0.5) * 100) / C.LANES}%`;

  return {
    mount(root, c) {
      ctx = c;
      arena = el('div', 'pmg-arena pmg-arena--stream');
      arena.setAttribute('role', 'application');
      arena.setAttribute('aria-label', 'Corriente de datos: cambia de carril para recoger paquetes y dejar pasar los bloques corruptos');
      applyBackdrop(arena, GAME);
      for (let l = 1; l < C.LANES; l++) {
        const sep = el('div', 'pmg-lane-sep');
        sep.style.left = `${(l * 100) / C.LANES}%`;
        arena.append(sep);
      }
      c.pet.el.classList.add('pmg-pet--swim');
      c.pet.el.style.top = `${(PLAYER_Y + FEET) * 100}%`;
      c.pet.play('walk');
      arena.append(c.pet.el);
      root.append(arena, el('p', 'pmg-hint', 'Recoge los paquetes de datos y deja pasar los bloques corruptos: un choque te frena un momento. Usa ← →, A D o toca el carril.'));

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
      const doc = arena.ownerDocument;
      const pet = ctx.pet;
      pet.el.style.left = laneX(s.lane);
      if (lastLane >= 0 && s.lane !== lastLane) pet.face(s.lane - lastLane);
      lastLane = s.lane;
      pet.el.classList.toggle('is-stunned', s.tick < s.stunnedUntil);
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        if (s.last.kind === 'block') pet.play('hit', { once: true });
      }
      const alive = new Set<number>();
      for (const o of s.objects) {
        alive.add(o.id);
        let node = nodes.get(o.id);
        if (!node) {
          const packet = o.kind === 'packet';
          node = el('span', `pmg-drop${packet ? '' : ' is-noise'}`);
          node.setAttribute('aria-hidden', 'true');
          node.append(piece(doc, pieceUrl(GAME, packet ? 'packet' : 'block'), '', packet ? '#4da2ff' : '#6b6485'));
          node.style.left = laneX(o.lane);
          arena.insertBefore(node, pet.el);
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
    status: (s) => `★ ${s.score} · racha ${s.combo}${s.tick < s.stunnedUntil ? ' · frenado' : ''}`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      nodes.clear();
    },
  };
}
