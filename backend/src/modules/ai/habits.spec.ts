import {
  MAX_DIGEST_CHARS,
  SLOTS,
  deriveHabits,
  emptyProfile,
  mergeDigest,
  parseProfile,
  sanitizeDigest,
} from './habits';

const ALL = { apps: true, pomodoro: true };
const row = (slot: number, minutes: number) => Array.from({ length: SLOTS }, (_, i) => (i === slot ? minutes : 0));

describe('habits', () => {
  describe('sanitizeDigest', () => {
    it('acepta un digest válido e ignora categorías desconocidas', () => {
      const r = sanitizeDigest({ appMinutes: { coding: row(4, 120), banking: row(1, 10) }, pomodoros: [25, 25] }, ALL);
      expect(r).toEqual({ ok: true, digest: { appMinutes: { coding: row(4, 120) }, pomodoros: [25, 25] } });
    });

    it('rechaza tamaño, forma y valores fuera de rango', () => {
      expect(sanitizeDigest({ pad: 'x'.repeat(MAX_DIGEST_CHARS) }, ALL).ok).toBe(false);
      expect(sanitizeDigest({ appMinutes: { coding: [1, 2] } }, ALL).ok).toBe(false);
      expect(sanitizeDigest({ appMinutes: { coding: row(0, 999) } }, ALL).ok).toBe(false);
      expect(sanitizeDigest({ appMinutes: { coding: row(0, -1) } }, ALL).ok).toBe(false);
      expect(sanitizeDigest({ pomodoros: Array(31).fill(25) }, ALL).ok).toBe(false);
      expect(sanitizeDigest({ pomodoros: [0] }, ALL).ok).toBe(false);
      expect(sanitizeDigest([], ALL).ok).toBe(false);
      // más minutos de los que caben en dos días
      const huge = { coding: row(0, 240).map(() => 240), music: row(0, 240).map(() => 240), video: row(0, 240).map(() => 240) };
      expect(sanitizeDigest({ appMinutes: huge }, ALL).ok).toBe(false);
    });

    it('descarta las partes cuya habilidad no está activa', () => {
      const r = sanitizeDigest({ appMinutes: { coding: row(4, 60) }, pomodoros: [25] }, { apps: false, pomodoro: true });
      expect(r).toEqual({ ok: true, digest: { pomodoros: [25] } });
      expect(sanitizeDigest({ appMinutes: { coding: row(4, 60) } }, { apps: false, pomodoro: false })).toEqual({ ok: true, digest: {} });
    });
  });

  describe('perfil de tamaño fijo', () => {
    it('el tamaño no crece tras muchos digests', () => {
      let p = emptyProfile();
      const size0 = JSON.stringify(p).length;
      for (let d = 0; d < 400; d++) {
        p = mergeDigest(p, { appMinutes: { coding: row(d % SLOTS, 200), music: row(2, 30) }, pomodoros: [25, 50, 90] }, 1);
      }
      // solo cambian los dígitos de los números, no la estructura
      expect(JSON.stringify(p).length).toBeLessThan(Math.max(size0 * 2, 2048));
      expect(Object.keys(p.app)).toHaveLength(5);
    });

    it('el decaimiento hace que los hábitos antiguos se olviden', () => {
      let p = mergeDigest(emptyProfile(), { appMinutes: { gaming: row(5, 300) } }, 0);
      expect(deriveHabits(p).map((h) => h.key)).toContain('habit:gaming_time');
      p = mergeDigest(p, {}, 60); // dos meses sin jugar
      expect(deriveHabits(p).map((h) => h.key)).not.toContain('habit:gaming_time');
    });

    it('parseProfile tolera basura y limita las claves silenciadas', () => {
      const p = parseProfile({ app: { coding: 'x', music: row(1, 5) }, pomo: { 25: -3 }, muted: ['habit:a', 7, 'otra'] });
      expect(p.app.coding).toEqual(Array(SLOTS).fill(0));
      expect(p.app.music).toEqual(row(1, 5));
      expect(p.pomo[25]).toBe(0);
      expect(p.muted).toEqual(['habit:a']);
    });
  });

  describe('deriveHabits', () => {
    it('franja dominante, actividad principal y duración de Pomodoro', () => {
      const p = mergeDigest(emptyProfile(), { appMinutes: { coding: row(4, 240), music: row(2, 60) }, pomodoros: [50, 50, 45, 25] }, 0);
      const h = deriveHabits(p);
      const byKey = Object.fromEntries(h.map((x) => [x.key, x.content]));
      expect(byKey['habit:coding_time']).toContain('por la tarde');
      expect(byKey['habit:main_activity']).toContain('programar');
      expect(byKey['habit:pomodoro_length']).toContain('50 minutos');
      expect(byKey['habit:music_time']).toBeUndefined(); // por debajo del umbral
      expect(h.every((x) => x.content.length <= 160)).toBe(true);
    });

    it('sin datos suficientes no inventa hábitos', () => {
      expect(deriveHabits(mergeDigest(emptyProfile(), { appMinutes: { coding: row(4, 30) }, pomodoros: [25] }, 0))).toEqual([]);
    });

    it('respeta los hábitos que el entrenador ha borrado', () => {
      const p = mergeDigest(emptyProfile(), { appMinutes: { coding: row(4, 400) } }, 0);
      p.muted = ['habit:coding_time'];
      expect(deriveHabits(p).map((h) => h.key)).not.toContain('habit:coding_time');
    });
  });
});
