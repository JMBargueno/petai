import { applyBackdrop, piece, pieceUrl } from '../assets';
import { PULSO as P, type PulsoState } from '../games/pulsoVoltaico';
import { button, el, on, pct, typing, type GameView, type ViewContext } from './types';

const GAME = 'pulso_voltaico';
const LINE = 0.8; // altura de la línea de sinapsis (fracción de la arena)
/** Los carriles ocupan esta parte del ancho; el resto es la repisa donde el Pockai lleva el ritmo. */
const LANES_W = 0.74;
const PET_X = 298;
const PET_Y = 246;
const KEYS: Record<string, number> = { j: 0, J: 0, '1': 0, ArrowLeft: 0, k: 1, K: 1, '2': 1, ArrowDown: 1, l: 2, L: 2, '3': 2, ArrowRight: 2 };
const GRADE_TEXT = { perfect: '¡Perfecto!', good: 'Bien', miss: 'Fallo' } as const;
const PULSE_COLOR = '#ffd731';

const laneX = (lane: number) => `${(((lane + 0.5) * LANES_W) / P.LANES) * 100}%`;

/** Pulso Voltaico: los pulsos bajan por tres hilos hasta la sinapsis y el Pockai marca cada acierto. */
export function createPulsoVoltaicoView(): GameView<PulsoState> {
  let arena: HTMLElement;
  let feedback: HTMLElement;
  let ctx: ViewContext;
  let seenEvent = -1;
  const notes = new Map<number, HTMLElement>();
  const nodes: HTMLElement[] = [];
  const pads: HTMLButtonElement[] = [];
  const cleanups: (() => void)[] = [];

  return {
    mount(root, c) {
      ctx = c;
      const doc = root.ownerDocument;
      arena = el('div', 'pmg-arena pmg-arena--volt');
      applyBackdrop(arena, GAME);
      for (let l = 0; l < P.LANES; l++) {
        const wire = el('div', 'pmg-wire');
        wire.style.left = laneX(l);
        wire.style.height = `${LINE * 100}%`;
        const node = el('span', 'pmg-drop pmg-node');
        node.append(piece(doc, pieceUrl(GAME, 'node'), '', '#b38600'));
        node.style.left = laneX(l);
        node.style.top = `${LINE * 100}%`;
        nodes.push(node);
        arena.append(wire, node);
      }
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, 340);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, 260);
      c.pet.face(-1);
      c.pet.play('idle');
      arena.append(shadow, c.pet.el);
      feedback = el('p', 'pmg-line');
      feedback.setAttribute('aria-live', 'polite');

      const padRow = el('div', 'pmg-pads');
      ['J', 'K', 'L'].forEach((key, lane) => {
        const b = button('pmg-pad', key, `Hilo ${lane + 1}`);
        cleanups.push(
          on(b, 'pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            ctx.push({ kind: 'tap', lane });
          }),
        );
        pads.push(b);
        padRow.append(b);
      });
      root.append(arena, feedback, padRow, el('p', 'pmg-hint', 'Pulsa el hilo cuando el pulso llegue a la sinapsis: J K L, flechas, 1 2 3 o tocando los botones.'));

      cleanups.push(
        on(window, 'keydown', (e: KeyboardEvent) => {
          if (e.repeat || typing(e) || !(e.key in KEYS)) return;
          e.preventDefault();
          ctx.push({ kind: 'tap', lane: KEYS[e.key] });
        }),
      );
    },
    render(s) {
      const doc = arena.ownerDocument;
      const alive = new Set<number>();
      s.notes.forEach((n, i) => {
        const from = n.hit - s.fallTicks;
        if (n.grade === 'perfect' || n.grade === 'good' || s.tick < from || s.tick > n.hit + s.good + 6) return;
        alive.add(i);
        let node = notes.get(i);
        if (!node) {
          node = el('span', 'pmg-drop pmg-note');
          node.setAttribute('aria-hidden', 'true');
          node.append(piece(doc, pieceUrl(GAME, 'pulse'), '', PULSE_COLOR));
          node.style.left = laneX(n.lane);
          arena.append(node);
          notes.set(i, node);
        }
        node.style.top = `${((s.tick - from) / s.fallTicks) * LINE * 100}%`;
        node.classList.toggle('is-miss', n.grade === 'miss');
      });
      for (const [i, node] of notes) {
        if (!alive.has(i)) {
          node.remove();
          notes.delete(i);
        }
      }
      const recent = s.last && s.tick - s.last.tick < 30 ? s.last : null;
      const text = recent ? GRADE_TEXT[recent.grade] : '';
      if (feedback.textContent !== text) feedback.textContent = text;
      pads.forEach((b, l) => b.classList.toggle('is-hit', !!recent && recent.lane === l && recent.grade !== 'miss'));
      nodes.forEach((n, l) => n.classList.toggle('is-hit', !!recent && recent.lane === l && recent.grade !== 'miss'));
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        ctx.pet.play(s.last.grade === 'perfect' ? 'happy' : s.last.grade === 'good' ? 'attack' : 'hit', { once: true });
      }
    },
    status: (s) => `★ ${s.score} · racha ${s.combo} · ${s.bpm} BPM`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      notes.clear();
      nodes.length = 0;
      pads.length = 0;
    },
  };
}
