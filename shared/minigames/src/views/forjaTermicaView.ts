import { FORJA as F, inZone, type ForjaState } from '../games/forjaTermica';
import { button, el, on, typing, type GameView } from './types';

/** Mantener pulsado aviva el fuelle a este ritmo. */
const HOLD_MS = 140;

export function createForjaTermicaView(): GameView<ForjaState> {
  let zone: HTMLElement;
  let mercury: HTMLElement;
  let heat: HTMLElement;
  let ember: HTMLElement;
  let feedback: HTMLElement;
  let hold: ReturnType<typeof setInterval> | null = null;
  const cleanups: (() => void)[] = [];

  const stopHold = () => {
    if (hold) clearInterval(hold);
    hold = null;
  };

  return {
    mount(root, ctx) {
      const arena = el('div', 'pmg-arena pmg-arena--forge');
      const gauge = el('div', 'pmg-gauge');
      zone = el('div', 'pmg-gauge__zone');
      mercury = el('div', 'pmg-gauge__temp');
      gauge.append(zone, mercury);
      ember = el('span', 'pmg-ember', '⚒️');
      const bar = el('div', 'pmg-heat');
      heat = el('div', 'pmg-heat__fill');
      bar.append(heat);
      feedback = el('div', 'pmg-feedback');
      feedback.setAttribute('aria-live', 'polite');
      arena.append(gauge, ember, bar, feedback);

      const bellows = button('pmg-btn pmg-btn--big', '🔥 Avivar', 'Avivar el fuelle (Espacio)');
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
      root.append(arena, bellows, el('p', 'pmg-hint', 'Mantén la temperatura en la franja dorada: cada 3 s templas una pieza. Si pasa del rojo, se quema.'));
    },
    render(s) {
      zone.style.bottom = `${s.zone - s.zoneWidth / 2}%`;
      zone.style.height = `${s.zoneWidth}%`;
      mercury.style.height = `${s.temp}%`;
      mercury.classList.toggle('is-ok', inZone(s));
      mercury.classList.toggle('is-hot', s.temp > F.BURN - 8);
      heat.style.width = `${(s.heat / F.TEMPER_TICKS) * 100}%`;
      ember.classList.toggle('is-glow', inZone(s));
      const recent = s.last && s.tick - s.last.tick < 45 ? s.last : null;
      const text = recent ? (recent.kind === 'piece' ? '¡Pieza templada! +4' : '¡Se ha quemado!') : '';
      if (feedback.textContent !== text) feedback.textContent = text;
    },
    status: (s) => `⚒️ ${s.pieces} piezas · ★ ${s.score}${s.burns ? ` · quemadas ${s.burns}` : ''}`,
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
