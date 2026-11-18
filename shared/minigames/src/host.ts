import { createRunner } from './core/runner';
import type { GameVariant } from './core/types';
import { TICKS_PER_SECOND } from './core/types';
import type { MinigameEvent } from './protocol';
import { getMinigame } from './registry';
import { ensureStyles } from './styles';
import { el } from './views/types';

export interface MountOptions {
  gameId: string;
  seed: number;
  durationSeconds: number;
  variant?: GameVariant;
  reducedMotion?: boolean;
  onEvent: (event: MinigameEvent) => void;
}

export interface MountedMinigame {
  dispose(): void;
}

/**
 * Monta un minijuego en `host` y lo ejecuta hasta que termina. Emite `score` cuando cambia la
 * puntuación y `finished` (una sola vez) con la puntuación y el registro de entradas.
 */
export function mountMinigame(host: HTMLElement, opts: MountOptions): MountedMinigame {
  const entry = getMinigame(opts.gameId);
  if (!entry) {
    opts.onEvent({ type: 'error', message: `Minijuego desconocido: ${opts.gameId}` });
    return { dispose() {} };
  }
  ensureStyles(host.ownerDocument);

  const runner = createRunner(entry.definition, {
    seed: opts.seed,
    durationSeconds: opts.durationSeconds,
    variant: opts.variant ?? 'standard',
  });
  const view = entry.createView();

  const root = el('div', `pmg pmg--${entry.id}${opts.reducedMotion ? ' pmg--reduced' : ''}`);
  const hud = el('div', 'pmg-hud');
  const time = el('span');
  const status = el('span');
  status.setAttribute('role', 'status');
  hud.append(time, status);
  root.append(hud);
  host.append(root);
  view.mount(root, { push: (i) => runner.push(i), reducedMotion: !!opts.reducedMotion });

  let raf = 0;
  let last = 0;
  let lastScore = -1;
  let done = false;
  const durationTicks = Math.round(opts.durationSeconds * TICKS_PER_SECOND);

  const paint = () => {
    view.render(runner.state);
    const left = Math.max(0, Math.ceil((durationTicks - runner.tick) / TICKS_PER_SECOND));
    const timeText = `⏱ ${left} s`;
    if (time.textContent !== timeText) time.textContent = timeText;
    const st = view.status(runner.state);
    if (status.textContent !== st) status.textContent = st;
    const score = runner.score();
    if (score !== lastScore) {
      lastScore = score;
      opts.onEvent({ type: 'score', score });
    }
  };

  const frame = (ts: number) => {
    if (done) return;
    if (last) runner.advance(ts - last);
    last = ts;
    paint();
    if (runner.over()) {
      done = true;
      opts.onEvent({ type: 'finished', gameId: entry.id, score: runner.score(), ticks: runner.tick, inputLog: [...runner.log] });
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  paint();
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      done = true;
      cancelAnimationFrame(raf);
      view.dispose();
      root.remove();
    },
  };
}
