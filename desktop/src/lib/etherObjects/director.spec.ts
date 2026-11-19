import { describe, expect, it } from 'vitest';
import { EtherDirector, errandFor, type Errand, type EtherWant } from './director';

/** Director con un ejecutor manual: cada recado espera a que el test lo termine. */
function setup(opts: { rushWindowMs?: number } = {}) {
  let clock = 0;
  const runs: Array<{ e: Errand; done: () => void }> = [];
  const rushes: Array<{ from: EtherWant; to: EtherWant }> = [];
  const shown: EtherWant[] = [];
  const d = new EtherDirector(
    {
      run: (e) => new Promise<void>((resolve) => runs.push({ e, done: resolve })),
      rush: (_id, from, to) => rushes.push({ from, to }),
      shown: (_id, w) => shown.push(w),
      now: () => clock,
    },
    opts.rushWindowMs ?? 900,
  );
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { d, runs, rushes, shown, tick, advance: (ms: number) => (clock += ms) };
}

describe('errandFor', () => {
  it('saca, toca o devuelve según lo que se ve y lo que se pide', () => {
    expect(errandFor(null, 'running')).toBe('summon');
    expect(errandFor('running', 'paused')).toBe('tap');
    expect(errandFor('paused', null)).toBe('banish');
    expect(errandFor('paused', 'paused')).toBeNull();
    expect(errandFor(null, null)).toBeNull();
  });
});

describe('EtherDirector', () => {
  it('iniciar → pausar → detener, con calma: un recado cada vez y en orden', async () => {
    const { d, runs, rushes, shown, tick, advance } = setup();
    d.setDesired('clock', 'running');
    expect(runs.map((r) => r.e.kind)).toEqual(['summon']);
    runs[0].done();
    await tick();
    expect(d.displayed('clock')).toBe('running');
    advance(5000);
    d.setDesired('clock', 'paused');
    expect(runs[1].e).toMatchObject({ kind: 'tap', from: 'running', to: 'paused' });
    runs[1].done();
    await tick();
    advance(5000);
    d.setDesired('clock', null);
    expect(runs[2].e.kind).toBe('banish');
    runs[2].done();
    await tick();
    expect(d.displayed('clock')).toBeNull();
    expect(rushes).toEqual([]);
    expect(shown).toEqual(['running', 'paused', null]);
  });

  it('iniciar y detener al momento: aborta la salida y el reloj parpadea de vuelta al Éter', async () => {
    const { d, runs, rushes, tick } = setup();
    d.setDesired('clock', 'running');
    d.setDesired('clock', null);
    expect(runs[0].e.aborted).toBe(true);
    expect(rushes).toEqual([{ from: 'running', to: null }]);
    expect(d.displayed('clock')).toBeNull();
    // Cuando el recado abortado termina, no pisa nada ni lanza otro
    runs[0].done();
    await tick();
    expect(runs).toHaveLength(1);
    expect(d.displayed('clock')).toBeNull();
  });

  it('detener e iniciar de nuevo al momento: el reloj se queda, con parpadeo para recolocarlo', async () => {
    const { d, runs, rushes, tick, advance } = setup();
    d.setDesired('clock', 'running');
    runs[0].done();
    await tick();
    advance(5000);
    d.setDesired('clock', null);
    expect(runs[1].e.kind).toBe('banish');
    d.setDesired('clock', 'running');
    expect(runs[1].e.aborted).toBe(true);
    expect(rushes).toEqual([{ from: 'running', to: 'running' }]);
    expect(d.displayed('clock')).toBe('running');
  });

  it('pausar → reanudar → pausar deprisa: va de golpe y no encola recados', async () => {
    const { d, runs, rushes, tick, advance } = setup();
    d.setDesired('clock', 'running');
    runs[0].done();
    await tick();
    advance(5000);
    d.setDesired('clock', 'paused');
    d.setDesired('clock', 'running');
    d.setDesired('clock', 'paused');
    expect(runs).toHaveLength(2);
    expect(rushes).toEqual([
      { from: 'running', to: 'running' },
      { from: 'running', to: 'paused' },
    ]);
    expect(d.displayed('clock')).toBe('paused');
    // Pasada la ventana, vuelve a ir el Pockai
    advance(2000);
    d.setDesired('clock', 'running');
    expect(runs).toHaveLength(3);
    expect(runs[2].e.kind).toBe('tap');
  });

  it('markShown adelanta lo que se ve (la hebra tocó) sin esperar al final', async () => {
    const { d, runs, shown, tick } = setup();
    d.setDesired('clock', 'running');
    d.markShown(runs[0].e);
    expect(d.displayed('clock')).toBe('running');
    runs[0].done();
    await tick();
    expect(shown).toEqual(['running']);
  });

  it('si el ejecutor falla, el estado se da por alcanzado igualmente', async () => {
    const d = new EtherDirector({ run: () => Promise.reject(new Error('x')), rush: () => {}, shown: () => {} });
    d.setDesired('clock', 'running');
    await new Promise((r) => setTimeout(r, 0));
    expect(d.displayed('clock')).toBe('running');
    expect(d.inFlight('clock')).toBeNull();
  });

  it('cada objeto lleva sus recados por separado', () => {
    const { d, runs } = setup();
    d.setDesired('a', 'on');
    d.setDesired('b', 'on');
    expect(runs.map((r) => r.e.objectId)).toEqual(['a', 'b']);
    expect(runs.every((r) => !r.e.aborted)).toBe(true);
  });
});
