import { applyBackdrop, piece, pieceUrl } from '../assets';
import { FORJA as F, inZone, type ForjaState } from '../games/forjaTermica';
import { button, el, on, pct, typing, type GameView, type ViewContext } from './types';

const GAME = 'forja_termica';
/** Mantener pulsado aviva el fuelle a este ritmo. */
const HOLD_MS = 140;
/** Posiciones en la arena de 340×260: el Pockai junto al fuelle y el nudo sobre el yunque. */
const PET_X = 128;
const PET_Y = 246;
const BELLOWS_X = 184;
const BELLOWS_Y = 222;
const KNOT_X = 245;
const KNOT_Y = 136;

/** Forja Térmica: el Pockai aviva el fuelle y el nudo del Telar se templa mientras la forja está en su punto. */
export function createForjaTermicaView(): GameView<ForjaState> {
  let zone: HTMLElement;
  let mercury: HTMLElement;
  let heat: HTMLElement;
  let cold: HTMLElement;
  let hot: HTMLElement;
  let bellowsArt: HTMLElement;
  let feedback: HTMLElement;
  let ctx: ViewContext;
  let hold: ReturnType<typeof setInterval> | null = null;
  let lastTemp = -1;
  let seenEvent = -1;
  let pumpedAt = -99;
  const cleanups: (() => void)[] = [];

  const stopHold = () => {
    if (hold) clearInterval(hold);
    hold = null;
  };

  return {
    mount(root, c) {
      ctx = c;
      const doc = root.ownerDocument;
      const arena = el('div', 'pmg-arena pmg-arena--forge');
      applyBackdrop(arena, GAME);
      const gauge = el('div', 'pmg-gauge');
      zone = el('div', 'pmg-gauge__zone');
      mercury = el('div', 'pmg-gauge__temp');
      gauge.append(zone, mercury);
      const knot = el('span', 'pmg-drop pmg-drop--big');
      cold = piece(doc, pieceUrl(GAME, 'knot_cold'), '', '#6b6485');
      hot = piece(doc, pieceUrl(GAME, 'knot_hot'), '', '#e25822');
      knot.append(cold, hot);
      knot.style.left = pct(KNOT_X, 340);
      knot.style.top = pct(KNOT_Y, 260);
      const bellowsBox = el('span', 'pmg-drop pmg-drop--big');
      bellowsArt = piece(doc, pieceUrl(GAME, 'bellows'), 'pmg-bellows', '#8a4b1f');
      bellowsBox.append(bellowsArt);
      bellowsBox.style.left = pct(BELLOWS_X, 340);
      bellowsBox.style.top = pct(BELLOWS_Y, 260);
      const shadow = el('span', 'pmg-shadow');
      shadow.style.left = c.pet.el.style.left = pct(PET_X, 340);
      shadow.style.top = c.pet.el.style.top = pct(PET_Y, 260);
      c.pet.face(1);
      c.pet.play('idle');
      const bar = el('div', 'pmg-heat');
      heat = el('div', 'pmg-heat__fill');
      bar.append(heat);
      arena.append(gauge, knot, bellowsBox, shadow, c.pet.el, bar);
      feedback = el('p', 'pmg-line');
      feedback.setAttribute('aria-live', 'polite');

      const bellows = button('pmg-btn pmg-btn--big', 'Avivar', 'Avivar el fuelle (Espacio)');
      const pump = () => ctx.push({ kind: 'pump' });
      cleanups.push(
        on(bellows, 'pointerdown', (e: PointerEvent) => {
          e.preventDefault();
          pump();
          stopHold();
          hold = setInterval(pump, HOLD_MS);
        }),
        on(bellows, 'pointerup', stopHold),
        on(bellows, 'pointerleave', stopHold),
        on(bellows, 'pointercancel', stopHold),
        on(window, 'blur', stopHold),
        on(window, 'keydown', (e: KeyboardEvent) => {
          if (typing(e) || (e.key !== ' ' && e.key !== 'Enter')) return;
          e.preventDefault();
          // La repetición del teclado hace de «mantener pulsado».
          pump();
        }),
        stopHold,
      );
      root.append(arena, feedback, bellows, el('p', 'pmg-hint', 'Mantén la forja en la franja dorada: cada 3 s templas un nudo del Telar. Si pasa del rojo, se quema.'));
    },
    render(s) {
      zone.style.bottom = `${s.zone - s.zoneWidth / 2}%`;
      zone.style.height = `${s.zoneWidth}%`;
      mercury.style.height = `${s.temp}%`;
      mercury.classList.toggle('is-ok', inZone(s));
      mercury.classList.toggle('is-hot', s.temp > F.BURN - 8);
      heat.style.width = `${(s.heat / F.TEMPER_TICKS) * 100}%`;
      // El nudo está al rojo solo mientras la forja está en su punto: dos dibujos, no un filtro.
      hot.hidden = !inZone(s);
      cold.hidden = inZone(s);
      // La temperatura solo sube de golpe con un golpe de fuelle: ahí el Pockai empuja.
      if (lastTemp >= 0 && s.temp > lastTemp + 1) {
        pumpedAt = s.tick;
        ctx.pet.play('attack', { once: true });
      }
      lastTemp = s.temp;
      bellowsArt.classList.toggle('is-pumped', s.tick - pumpedAt < 6);
      if (s.last && s.last.tick !== seenEvent) {
        seenEvent = s.last.tick;
        ctx.pet.play(s.last.kind === 'piece' ? 'happy' : 'hit', { once: true });
      }
      const recent = s.last && s.tick - s.last.tick < 45 ? s.last : null;
      const text = recent ? (recent.kind === 'piece' ? '¡Nudo templado! +4' : '¡Se ha quemado!') : '';
      if (feedback.textContent !== text) feedback.textContent = text;
    },
    status: (s) => `${s.pieces} nudos · ★ ${s.score}${s.burns ? ` · quemados ${s.burns}` : ''}`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
