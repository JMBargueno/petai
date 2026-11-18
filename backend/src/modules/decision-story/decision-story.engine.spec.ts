import { StoriesConfig, StoryScene } from '../game-data/story-data.schemas';
import { addDays, computeCanon, localDate, localHour, publicScene, resolveOutcome, shuffleChoices } from './decision-story.engine';

const choice = (label: string, score: number) => ({ label, consequence: `c-${label}`, canonLine: `Hicieron ${label}.`, approach: 'brave', score });
const scene = (id: string, scores: number[]): StoryScene => ({
  locationId: id,
  narration: 'n',
  event: { kind: 'omen', text: 'e' },
  choices: scores.map((s, i) => choice(`${id}${i}`, s)),
});
const scenes = [scene('a', [2, 1, 0]), scene('b', [0, 2]), scene('c', [1, 2, 0])];
const cfg = { outcome: { winAt: 0.7, partialAt: 0.4 } } as StoriesConfig;

describe('decision-story.engine', () => {
  it('fecha y hora locales del bucket', () => {
    // 00:30 UTC del 2 de marzo = 01:30 en Madrid (invierno) y 19:30 del día 1 en Nueva York
    const now = new Date('2026-03-02T00:30:00Z');
    expect(localDate(now, 'Europe/Madrid')).toBe('2026-03-02');
    expect(localHour(now, 'Europe/Madrid')).toBe(1);
    expect(localDate(now, 'America/New_York')).toBe('2026-03-01');
    expect(localHour(now, 'America/New_York')).toBe(19);
    expect(localHour(new Date('2026-03-01T23:10:00Z'), 'Europe/Madrid')).toBe(0);
    expect(localDate(now, 'Zona/Inventada')).toBe('2026-03-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  describe('computeCanon', () => {
    it('gana la opción más votada de cada escena y el resumen une sus líneas', () => {
      const tallies = [
        { sceneIndex: 0, optionIndex: 2, count: 9 },
        { sceneIndex: 0, optionIndex: 0, count: 3 },
        { sceneIndex: 1, optionIndex: 0, count: 6 },
        { sceneIndex: 2, optionIndex: 1, count: 8 },
      ];
      const canon = computeCanon(scenes, tallies, 5);
      expect(canon.options).toEqual([2, 0, 1]);
      expect(canon.votes).toEqual([12, 6, 8]);
      expect(canon.summary).toBe('Hicieron a2. Hicieron b0. Hicieron c1.');
    });

    it('en empate gana el índice menor', () => {
      const tallies = [
        { sceneIndex: 0, optionIndex: 1, count: 4 },
        { sceneIndex: 0, optionIndex: 2, count: 4 },
      ];
      expect(computeCanon([scenes[0]], tallies, 5).options).toEqual([1]);
    });

    it('con pocos votos decide la opción de mayor score', () => {
      const tallies = [{ sceneIndex: 1, optionIndex: 0, count: 2 }];
      expect(computeCanon(scenes, tallies, 5).options).toEqual([0, 1, 1]);
    });
  });

  it('resolveOutcome: media de la calidad de las respuestas', () => {
    expect(resolveOutcome(scenes, [0, 1, 1], cfg)).toEqual({ score: 1, outcome: 'win' });
    expect(resolveOutcome(scenes, [0, 1, 0], cfg)).toMatchObject({ outcome: 'win' }); // 5/6
    expect(resolveOutcome(scenes, [1, 1, 0], cfg)).toMatchObject({ outcome: 'partial' }); // 4/6
    expect(resolveOutcome(scenes, [2, 0, 2], cfg)).toEqual({ score: 0, outcome: 'lose' });
  });

  it('publicScene no filtra score, consecuencia ni línea de canon', () => {
    const pub = publicScene(scenes[0], 0);
    expect(pub.choices).toEqual([
      { label: 'a0', approach: 'brave' },
      { label: 'a1', approach: 'brave' },
      { label: 'a2', approach: 'brave' },
    ]);
    expect(JSON.stringify(pub)).not.toMatch(/score|consequence|canonLine/);
  });

  it('shuffleChoices es determinista y conserva las opciones', () => {
    const a = shuffleChoices(scenes, '2026-03-02#1');
    const b = shuffleChoices(scenes, '2026-03-02#1');
    expect(a).toEqual(b);
    a.forEach((s, i) => expect(s.choices.map((c) => c.label).sort()).toEqual(scenes[i].choices.map((c) => c.label).sort()));
    // Con suficientes semillas, alguna cambia el orden de la primera escena
    const orders = new Set(['x', 'y', 'z', 'w', 'v', 'u'].map((seed) => shuffleChoices(scenes, seed)[0].choices.map((c) => c.label).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});
