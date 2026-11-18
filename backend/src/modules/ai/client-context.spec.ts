import { buildLocationBlock, sanitizeClientContext } from './client-context';

const pet = (skills: Record<string, boolean>, extra: any = {}) => ({
  bonding: 100,
  intelligence: 600,
  desktopSkills: skills,
  ...extra,
});

describe('client-context', () => {
  it('descarta la app en foco si context_awareness no está activa (no se fía del cliente)', () => {
    expect(sanitizeClientContext({ appCategory: 'coding' }, pet({}))).toBeNull(); // apagada por defecto
    expect(sanitizeClientContext({ appCategory: 'coding' }, pet({ context_awareness: true }))).toEqual({ appCategory: 'coding' });
    // bloqueada por vínculo aunque el cliente la marque
    expect(sanitizeClientContext({ appCategory: 'coding' }, pet({ context_awareness: true }, { bonding: 10 }))).toBeNull();
  });

  it('solo acepta valores de listas cerradas y números acotados', () => {
    const c = sanitizeClientContext(
      {
        appCategory: 'Visual Studio Code - secreto.ts',
        pose: 'flying',
        pomodoro: { phase: 'work', minutesLeft: 9999, sessionsToday: -3 },
        extra: 'x',
      },
      pet({ context_awareness: true }),
    );
    expect(c).toEqual({ pomodoro: { phase: 'work', minutesLeft: 180, sessionsToday: 0 } });
    expect(sanitizeClientContext('hola', pet({}))).toBeNull();
    expect(sanitizeClientContext([1], pet({}))).toBeNull();
  });

  it('posado en ventana solo con window_perching activa', () => {
    expect(sanitizeClientContext({ pose: 'perched' }, pet({}))).toBeNull();
    expect(sanitizeClientContext({ pose: 'perched' }, pet({ window_perching: true }))).toEqual({ pose: 'perched' });
    expect(sanitizeClientContext({ pose: 'climbing' }, pet({}))).toEqual({ pose: 'climbing' });
  });

  it('el Pomodoro solo con su habilidad activa', () => {
    expect(sanitizeClientContext({ pomodoro: { phase: 'work' } }, pet({ pomodoro_companion: false }))).toBeNull();
  });

  it('bloque de ubicación: casita, pantalla, app y Pomodoro', () => {
    expect(buildLocationBlock({ inHabitat: true }, { pose: 'climbing' })).toContain('casita');
    const b = buildLocationBlock(
      { inHabitat: false },
      { pose: 'perched', appCategory: 'music', pomodoro: { phase: 'work', minutesLeft: 12, sessionsToday: 2 } },
    );
    expect(b).toContain('posado sobre la barra');
    expect(b).toContain('escuchando música');
    expect(b).toContain('quedan 12 min');
    expect(b).toContain('2 sesiones');
    expect(buildLocationBlock({ inHabitat: false }, null)).toBe('');
  });
});
