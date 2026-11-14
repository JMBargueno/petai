import {
  isInQuietHours,
  shouldRateLimit,
  shouldDedup,
  resolveTemplate,
  resolveDefaults,
  NOTIFICATION_CATEGORIES,
  CATEGORY_TO_TYPE,
} from './notification-rules';

describe('notification-rules (motor puro)', () => {
  describe('isInQuietHours', () => {
    // Ventana 23:00 → 07:00 (cruza la medianoche).
    const start = 23;
    const end = 7;

    it('dentro de la ventana (03:00 local) → true', () => {
      const d = new Date('2026-06-15T03:00:00Z');
      expect(isInQuietHours(d, 'UTC', start, end)).toBe(true);
    });

    it('justo en el límite inicial (23:00) → true (inclusive)', () => {
      const d = new Date('2026-06-15T23:00:00Z');
      expect(isInQuietHours(d, 'UTC', start, end)).toBe(true);
    });

    it('justo en el límite final (07:00) → false (exclusive)', () => {
      const d = new Date('2026-06-15T07:00:00Z');
      expect(isInQuietHours(d, 'UTC', start, end)).toBe(false);
    });

    it('fuera de la ventana (12:00) → false', () => {
      const d = new Date('2026-06-15T12:00:00Z');
      expect(isInQuietHours(d, 'UTC', start, end)).toBe(false);
    });

    it('respetando la zona horaria del usuario (DST: Europe/Madrid)', () => {
      // 2026-06-15 es verano (CEST, UTC+2). 01:00 UTC = 03:00 local → dentro.
      const summer = new Date('2026-06-15T01:00:00Z');
      expect(isInQuietHours(summer, 'Europe/Madrid', start, end)).toBe(true);
      // Invierno (CET, UTC+1): 2026-01-15 22:00 UTC = 23:00 local → dentro (justo al límite).
      const winter = new Date('2026-01-15T22:00:00Z');
      expect(isInQuietHours(winter, 'Europe/Madrid', start, end)).toBe(true);
      // 2026-01-15 21:00 UTC = 22:00 local → fuera.
      const winter2 = new Date('2026-01-15T21:00:00Z');
      expect(isInQuietHours(winter2, 'Europe/Madrid', start, end)).toBe(false);
    });

    it('ventana que no cruza medianoche (10 → 14)', () => {
      const inside = new Date('2026-06-15T12:00:00Z');
      const outside = new Date('2026-06-15T15:00:00Z');
      expect(isInQuietHours(inside, 'UTC', 10, 14)).toBe(true);
      expect(isInQuietHours(outside, 'UTC', 10, 14)).toBe(false);
    });

    it('zona horaria inválida → respaldado a UTC sin lanzar', () => {
      expect(isInQuietHours(new Date('2026-06-15T03:00:00Z'), 'not/a/zone', start, end)).toBe(true);
    });
  });

  describe('shouldRateLimit', () => {
    it('2 emitidas de 3 → false', () => {
      expect(shouldRateLimit(2, 3)).toBe(false);
    });

    it('3 emitidas de 3 → true (alcanzó el tope)', () => {
      expect(shouldRateLimit(3, 3)).toBe(true);
    });

    it('maxPerDay=0 → true (todo bloqueado)', () => {
      expect(shouldRateLimit(0, 0)).toBe(true);
      expect(shouldRateLimit(5, 0)).toBe(true);
    });

    it('0 emitidas de 3 → false', () => {
      expect(shouldRateLimit(0, 3)).toBe(false);
    });

    it('maxPerDay=10 con 9 → false, 10 → true', () => {
      expect(shouldRateLimit(9, 10)).toBe(false);
      expect(shouldRateLimit(10, 10)).toBe(true);
    });
  });

  describe('shouldDedup', () => {
    const now = 1_000_000;

    it('envío dentro de la ventana (5 min) → true', () => {
      expect(shouldDedup(now - 4 * 60 * 1000, 5 * 60 * 1000, now)).toBe(true);
    });

    it('envío fuera de la ventana → false', () => {
      expect(shouldDedup(now - 6 * 60 * 1000, 5 * 60 * 1000, now)).toBe(false);
    });

    it('sin envío previo (null) → false', () => {
      expect(shouldDedup(null, 5 * 60 * 1000, now)).toBe(false);
      expect(shouldDedup(undefined, 5 * 60 * 1000, now)).toBe(false);
    });

    it('ventana 0 → false (dedup desactivado)', () => {
      expect(shouldDedup(now - 1000, 0, now)).toBe(false);
    });

    it('value no numérico → false', () => {
      // @ts-expect-error intencional: validar robustez del motor
      expect(shouldDedup('abc', 5 * 60 * 1000, now)).toBe(false);
    });
  });

  describe('resolveTemplate', () => {
    const templates = {
      valiente: {
        acquainted: {
          vitals_critical: ['A', 'B'],
          arena: ['X'],
        },
      },
      neutral: {
        companion: {
          vitals_critical: ['N'],
          interaction: ['NI'],
        },
      },
    } as const;

    it('caso exacto (rasgo+tier+categoría)', () => {
      const msg = resolveTemplate(templates as never, 'valiente', 'acquainted', 'vitals_critical', () => 0);
      expect(msg).toBe('A');
    });

    it('rasgo desconocido → fallback neutral (mismo tier)', () => {
      const msg = resolveTemplate(templates as never, 'dulce', 'companion', 'vitals_critical', () => 0);
      expect(msg).toBe('N');
    });

    it('tier desconocido → fallback a cualquier tier disponible', () => {
      // 'valiente' no tiene tier 'legend'; cae a 'acquainted' (único tier de valiente).
      const msg = resolveTemplate(templates as never, 'valiente', 'legend', 'vitals_critical', () => 0);
      expect(msg).toBe('A');
    });

    it('rasgo y tier inexistentes → fallback neutral de cualquier tier', () => {
      const msg = resolveTemplate(templates as never, 'curioso', 'legend', 'interaction', () => 0);
      expect(msg).toBe('NI');
    });

    it('sin plantillas → mensaje genérico de fallback', () => {
      const msg = resolveTemplate(null, 'valiente', 'legend', 'achievement');
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    });

    it('elige de forma determinista con rand inyectado', () => {
      const t = { valiente: { acquainted: { vitals_critical: ['Uno', 'Dos', 'Tres'] } } } as const;
      const pick = (r: number) => resolveTemplate(t as never, 'valiente', 'acquainted', 'vitals_critical', () => r);
      expect(pick(0)).toBe('Uno');
      expect(pick(0.5)).toBe('Dos');
      expect(pick(0.99)).toBe('Tres');
    });
  });

  describe('resolveDefaults', () => {
    it('null → defaults (todas activas, maxPerDay=3)', () => {
      const p = resolveDefaults(null);
      for (const c of NOTIFICATION_CATEGORIES) expect(p[c]).toBe(true);
      expect(p.maxPerDay).toBe(3);
    });

    it('undefined → defaults', () => {
      expect(resolveDefaults(undefined).maxPerDay).toBe(3);
    });

    it('parcial → merge sobre defaults', () => {
      const p = resolveDefaults({ interaction: false, maxPerDay: 5 });
      expect(p.interaction).toBe(false);
      expect(p.vitals_critical).toBe(true); // conserva default
      expect(p.maxPerDay).toBe(5);
    });

    it('maxPerDay fuera de rango → se conserva el default', () => {
      expect(resolveDefaults({ maxPerDay: 100 }).maxPerDay).toBe(3);
      expect(resolveDefaults({ maxPerDay: 0 }).maxPerDay).toBe(3);
    });
  });

  describe('CATEGORY_TO_TYPE', () => {
    it('mapea cada categoría a un tipo válido', () => {
      expect(CATEGORY_TO_TYPE.vitals_critical).toBe('vitals');
      expect(CATEGORY_TO_TYPE.achievement).toBe('mission');
      expect(CATEGORY_TO_TYPE.arena).toBe('battle');
      expect(CATEGORY_TO_TYPE.event).toBe('event');
      expect(CATEGORY_TO_TYPE.interaction).toBe('interaction');
    });
  });
});
