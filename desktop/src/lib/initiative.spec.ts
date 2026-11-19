import { describe, expect, it } from 'vitest';
import { createInitiativeLoop, levelHint, talkFactorLabel, LEVEL_LABEL, TALK_LEVELS, type InitiativeReply } from './initiative';

/** Reloj de mentira: los temporizadores se disparan a mano. */
function harness(replies: (InitiativeReply | null | Error)[]) {
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  const asked: boolean[] = [];
  const said: string[] = [];
  let seq = 0;
  const loop = createInitiativeLoop(
    {
      ask: async (back) => {
        asked.push(back);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return next ?? null;
      },
      say: (text) => said.push(text),
      setTimer: (fn, ms) => {
        const t = { fn, ms, id: ++seq };
        timers.push(t);
        return t.id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    },
    { firstDelayMs: 1000, minMs: 60_000, maxMs: 600_000, errorMs: 300_000 },
  );
  const fire = async () => {
    const t = timers.shift()!;
    t.fn();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { loop, timers, asked, said, fire };
}
const reply = (text: string | null, retryInMs = 120_000): InitiativeReply => ({ phrase: text ? { id: 'x', kind: 'idle', text } : null, retryInMs, level: 'normal', feeling: null });

describe('iniciativa en el escritorio: cuándo se pregunta al servidor', () => {
  it('no pregunta nada más abrir: espera un poco, y luego cuando diga el servidor', async () => {
    const h = harness([reply('Hola.', 120_000), reply(null, 900_000)]);
    h.loop.start();
    expect(h.asked).toEqual([]);
    expect(h.timers[0].ms).toBe(1000);
    await h.fire();
    expect(h.said).toEqual(['Hola.']);
    expect(h.timers[0].ms).toBe(120_000);
    await h.fire();
    // Sin frase no dice nada, y la espera se acota al máximo
    expect(h.said).toEqual(['Hola.']);
    expect(h.timers[0].ms).toBe(600_000);
  });

  it('una espera absurda del servidor se acota por abajo', async () => {
    const h = harness([reply(null, 5)]);
    h.loop.start();
    await h.fire();
    expect(h.timers[0].ms).toBe(60_000);
  });

  it('sin red no insiste: espera y vuelve a intentarlo', async () => {
    const h = harness([new Error('sin red'), null, reply('Ya estoy.')]);
    h.loop.start();
    await h.fire();
    expect(h.timers[0].ms).toBe(300_000);
    await h.fire();
    expect(h.timers[0].ms).toBe(300_000);
    await h.fire();
    expect(h.said).toEqual(['Ya estoy.']);
  });

  it('al volver su entrenador pregunta ya, avisando de la vuelta', async () => {
    const h = harness([reply('¡Has vuelto!')]);
    h.loop.start();
    let fallback = 0;
    await h.loop.ownerBack(() => fallback++);
    expect(h.asked).toEqual([true]);
    expect(h.said).toEqual(['¡Has vuelto!']);
    expect(fallback).toBe(0);
    // Y deja un solo temporizador pendiente, con la espera que dijo el servidor
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].ms).toBe(120_000);
  });

  it('si el servidor no contesta al volver, se usa la bienvenida local', async () => {
    const h = harness([new Error('sin red')]);
    h.loop.start();
    let fallback = 0;
    await h.loop.ownerBack(() => fallback++);
    expect(fallback).toBe(1);
    expect(h.said).toEqual([]);
  });

  it('parado no pregunta: la vuelta va directa a la bienvenida local', async () => {
    const h = harness([reply('no debería')]);
    let fallback = 0;
    await h.loop.ownerBack(() => fallback++);
    expect(h.asked).toEqual([]);
    expect(fallback).toBe(1);
    h.loop.start();
    h.loop.stop();
    expect(h.timers).toHaveLength(0);
  });

  it('arrancarlo dos veces no duplica las preguntas', () => {
    const h = harness([]);
    h.loop.start();
    h.loop.start();
    expect(h.timers).toHaveLength(1);
  });
});

describe('iniciativa en el escritorio: textos del ajuste', () => {
  it('hay tres niveles con su nombre', () => {
    expect(TALK_LEVELS.map((l) => LEVEL_LABEL[l])).toEqual(['Solo al volver', 'Discreto', 'Hablador']);
  });

  it('explica cada nivel con los números ya ajustados al carácter del Pockai', () => {
    expect(levelHint({ id: 'normal', desktopMinutes: 17, mobilePerDay: 2, onlyOnReturn: false })).toContain('cada 17 min');
    expect(levelHint({ id: 'quiet', desktopMinutes: 17, mobilePerDay: 1, onlyOnReturn: true })).toContain('cuando vuelves');
    expect(levelHint(undefined)).toBe('');
    expect(talkFactorLabel(1.4)).toContain('más a menudo');
    expect(talkFactorLabel(0.7)).toContain('menos a menudo');
    expect(talkFactorLabel(1)).toBe('');
  });
});
