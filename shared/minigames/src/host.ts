import { packLog } from './core/log';
import { createRunner } from './core/runner';
import type { GameVariant } from './core/types';
import { TICKS_PER_SECOND } from './core/types';
import { createPetActor, type PetSheetResolver } from './pet';
import type { MinigameEvent, MinigamePet } from './protocol';
import { getMinigame } from './registry';
import { createViewSound, MG, type MinigameSound } from './sound';
import { ensureStyles } from './styles';
import { button, el } from './views/types';

export interface MountOptions {
  gameId: string;
  seed: number;
  durationSeconds: number;
  variant?: GameVariant;
  reducedMotion?: boolean;
  /** Pausar solo al perder el foco u ocultar la ventana (por defecto, sí). */
  autoPause?: boolean;
  /** La mascota del jugador; sin ella sale la especie por defecto. */
  pet?: MinigamePet;
  /** De dónde salen las hojas de la mascota. Sin él, el juego funciona sin mascota a la vista. */
  resolvePetSheet?: PetSheetResolver;
  /** Motor de sonido del anfitrión (spec 40). Sin él, el juego es mudo. */
  sound?: MinigameSound;
  onEvent: (event: MinigameEvent) => void;
}

export interface MountedMinigame {
  pause(): void;
  resume(): void;
  dispose(): void;
}

/**
 * Pausa máxima. La sesión del servidor caduca a los 300 s (`sessionTtlSeconds`) aunque el juego esté
 * parado: pasado este tiempo la partida se da por terminada con lo conseguido, para no perderla.
 */
export const MAX_PAUSE_MS = 120_000;

/**
 * Monta un minijuego en `host` y lo ejecuta hasta que termina. Emite `score` cuando cambia la
 * puntuación, `paused` al pausar o seguir y `finished` (una sola vez) con la puntuación, los ticks
 * jugados y el registro empaquetado que el servidor repite para validarla.
 */
export function mountMinigame(host: HTMLElement, opts: MountOptions): MountedMinigame {
  const entry = getMinigame(opts.gameId);
  if (!entry) {
    opts.onEvent({ type: 'error', message: `Minijuego desconocido: ${opts.gameId}` });
    return { pause() {}, resume() {}, dispose() {} };
  }
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  ensureStyles(doc);

  const runner = createRunner(entry.definition, {
    seed: opts.seed,
    durationSeconds: opts.durationSeconds,
    variant: opts.variant ?? 'standard',
  });
  const view = entry.createView();
  const pet = createPetActor(doc, opts.pet, opts.resolvePetSheet);
  const sfx = createViewSound(opts.sound);

  const root = el('div', `pmg pmg--${entry.id}${opts.reducedMotion ? ' pmg--reduced' : ''}`);
  const hud = el('div', 'pmg-hud');
  const time = el('span');
  const status = el('span');
  status.setAttribute('role', 'status');
  hud.append(time, status);
  const stage = el('div', 'pmg-stage');
  const overlay = el('div', 'pmg-pause');
  overlay.hidden = true;
  const resumeBtn = button('pmg-btn pmg-btn--big', '▶ Seguir', 'Seguir jugando', false);
  overlay.append(el('strong', '', 'En pausa'), resumeBtn);
  root.append(hud, stage);
  host.append(root);
  view.mount(stage, { push: (i) => !paused && runner.push(i), reducedMotion: !!opts.reducedMotion, pet, sfx }, runner.state);
  stage.append(overlay);

  let raf = 0;
  let last = 0;
  let lastScore = -1;
  let lastLeft = -1;
  let done = false;
  let paused = false;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  const durationTicks = Math.round(opts.durationSeconds * TICKS_PER_SECOND);

  const paint = () => {
    view.render(runner.state);
    const left = Math.max(0, Math.ceil((durationTicks - runner.tick) / TICKS_PER_SECOND));
    const timeText = `⏱ ${left} s`;
    if (time.textContent !== timeText) time.textContent = timeText;
    // Los últimos 5 segundos avisan, uno por segundo (no al pintar el primer frame).
    if (left !== lastLeft) {
      if (lastLeft >= 0 && left > 0 && left <= 5 && !runner.over()) sfx.play(MG.timerWarning);
      lastLeft = left;
    }
    const st = view.status(runner.state);
    if (status.textContent !== st) status.textContent = st;
    const score = runner.score();
    if (score !== lastScore) {
      lastScore = score;
      opts.onEvent({ type: 'score', score });
    }
  };

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (pauseTimer) clearTimeout(pauseTimer);
    sfx.stopAll();
    opts.onEvent({
      type: 'finished',
      gameId: entry.id,
      score: runner.score(),
      ticks: runner.tick,
      log: packLog(entry.definition, runner.log),
    });
  };

  const frame = (ts: number) => {
    if (done || paused) return;
    if (last) {
      runner.advance(ts - last);
      pet.advance(ts - last);
    }
    last = ts;
    paint();
    if (runner.over()) return finish();
    raf = requestAnimationFrame(frame);
  };

  const pause = () => {
    if (done || paused) return;
    paused = true;
    cancelAnimationFrame(raf);
    sfx.stopAll();
    sfx.play(MG.pause);
    overlay.hidden = false;
    opts.onEvent({ type: 'paused', paused: true });
    pauseTimer = setTimeout(finish, MAX_PAUSE_MS);
  };
  const resume = () => {
    if (done || !paused) return;
    paused = false;
    overlay.hidden = true;
    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = null;
    last = 0;
    opts.onEvent({ type: 'paused', paused: false });
    raf = requestAnimationFrame(frame);
  };

  resumeBtn.addEventListener('click', resume);
  const onVisibility = () => doc.visibilityState === 'hidden' && pause();
  const autoPause = opts.autoPause !== false;
  if (autoPause) {
    win.addEventListener('blur', pause);
    doc.addEventListener('visibilitychange', onVisibility);
  }

  paint();
  raf = requestAnimationFrame(frame);

  return {
    pause,
    resume,
    dispose() {
      done = true;
      cancelAnimationFrame(raf);
      if (pauseTimer) clearTimeout(pauseTimer);
      if (autoPause) {
        win.removeEventListener('blur', pause);
        doc.removeEventListener('visibilitychange', onVisibility);
      }
      view.dispose();
      sfx.stopAll();
      pet.dispose();
      root.remove();
    },
  };
}
