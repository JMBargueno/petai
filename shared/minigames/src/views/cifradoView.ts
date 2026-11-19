import { applyBackdrop, piece, pieceUrl } from '../assets';
import { CIFRADO as C, litGlyph, type CifradoState } from '../games/cifrado';
import { MG } from '../sound';
import { button, el, on, pct, typing, type GameView, type ViewContext } from './types';

const GAME = 'cifrado';
/** Sello de cada Flujo, en el orden de los glifos de la lógica. */
const SEALS = ['seal_fire', 'seal_water', 'seal_plant', 'seal_electric', 'seal_shadow', 'seal_light'];
const NAMES = ['Fuego', 'Agua', 'Planta', 'Eléctrico', 'Sombra', 'Luz'];
const COLORS = ['#fb4903', '#4da2ff', '#55db9c', '#ffd731', '#a99cff', '#fff6d6'];
/** Centro de cada sello en la arena de 340×260: dos filas de tres en el nicho. */
const SEAL_X = [96, 170, 244];
const SEAL_Y = [58, 126];
const PET_X = 170;
const PET_Y = 246;

/** Cifrado: seis sellos del Deep Éter se encienden en un orden y el Custodio lo repite. */
export function createCifradoView(): GameView<CifradoState> {
  const pads: HTMLButtonElement[] = [];
  let live: HTMLElement;
  let replay: HTMLButtonElement | null = null;
  let ctx: ViewContext;
  let seenEvent = -1;
  let rounds = 0;
  let shown = -1;
  const cleanups: (() => void)[] = [];

  return {
    mount(root, c, initial) {
      ctx = c;
      const doc = root.ownerDocument;
      const arena = el('div', 'pmg-arena pmg-arena--shadow');
      applyBackdrop(arena, GAME);
      for (let g = 0; g < C.GLYPHS; g++) {
        const b = button('pmg-seal', '', `Sello de ${NAMES[g]} (tecla ${g + 1})`);
        b.style.left = pct(SEAL_X[g % 3], 340);
        b.style.top = pct(SEAL_Y[Math.floor(g / 3)], 260);
        b.style.setProperty('--pmg-flow', COLORS[g]);
        b.append(piece(doc, pieceUrl(GAME, SEALS[g]), '', COLORS[g]));
        cleanups.push(on(b, 'click', () => ctx.push({ kind: 'press', g })));
        pads.push(b);
        arena.append(b);
      }
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, 340);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, 260);
      c.pet.play('idle');
      arena.append(shadow, c.pet.el);
      live = el('p', 'pmg-line');
      live.setAttribute('aria-live', 'polite');
      root.append(arena, live);
      if (initial.easy) {
        replay = button('pmg-btn', 'Repetir secuencia');
        cleanups.push(on(replay, 'click', () => ctx.push({ kind: 'replay' })));
        root.append(replay);
      }
      root.append(el('p', 'pmg-hint', 'Mira el orden en que se encienden los sellos y repítelo (clic, toque o teclas 1–6).'));
      cleanups.push(
        on(window, 'keydown', (e: KeyboardEvent) => {
          const g = Number(e.key) - 1;
          if (e.repeat || typing(e) || !(g >= 0 && g < C.GLYPHS)) return;
          e.preventDefault();
          ctx.push({ kind: 'press', g });
        }),
      );
    },
    render(s) {
      const lit = litGlyph(s);
      const recent = s.last && s.tick - s.last.tick < 15 ? s.last : null;
      pads.forEach((b, g) => {
        b.classList.toggle('is-lit', lit === g || (!!recent && recent.ok && recent.glyph === g));
        b.classList.toggle('is-wrong', !!recent && !recent.ok && recent.glyph === g);
        b.setAttribute('aria-disabled', String(s.phase !== 'input'));
      });
      if (replay) replay.disabled = s.phase !== 'input';
      // Cada sello que se enciende en la reproducción canta su nota.
      const showing = s.phase === 'show' ? lit : -1;
      if (showing !== shown) {
        shown = showing;
        if (showing >= 0) ctx.sfx.play(MG.cifrado.glyph, { note: showing });
      }
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        if (!s.last.ok) ctx.pet.play('hit', { once: true });
        // Acertar un sello suena con su misma nota: la secuencia es una melodía.
        if (s.last.ok) ctx.sfx.play(MG.cifrado.glyph, { note: s.last.glyph });
        else ctx.sfx.play(MG.cifrado.wrong);
      }
      if (s.rounds !== rounds) {
        rounds = s.rounds;
        ctx.pet.play('happy', { once: true });
        ctx.sfx.play(MG.cifrado.round);
      }
      // Durante la reproducción se anuncia cada sello para quien no lo ve.
      const msg = s.phase === 'show' ? (lit >= 0 ? NAMES[lit] : 'Mira…') : `Tu turno: ${s.pos}/${s.sequence.length}`;
      if (live.textContent !== msg) live.textContent = msg;
    },
    status: (s) => `★ ${s.score} · ronda ${s.rounds + 1} · ${s.sequence.length} sellos`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      pads.length = 0;
    },
  };
}
