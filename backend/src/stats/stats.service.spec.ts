import { StatsService, computeProInfo, dayNumber, previousDay, PLAYTIME_MAX_GAP_MS } from './stats.service';

const DAY = 24 * 60 * 60 * 1000;

describe('StatsService', () => {
  describe('dayNumber / previousDay', () => {
    it('calcula el día natural en la zona horaria del usuario', () => {
      const d = new Date('2026-11-17T23:30:00Z');
      expect(dayNumber(d, 'UTC')).toBe(20261117);
      expect(dayNumber(d, 'Europe/Madrid')).toBe(20261118);
      expect(dayNumber(d, 'Zona/Inventada')).toBe(20261117); // fallback a UTC
    });

    it('resta un día cruzando meses y años', () => {
      expect(previousDay(20261117)).toBe(20261116);
      expect(previousDay(20260301)).toBe(20260228);
      expect(previousDay(20270101)).toBe(20261231);
    });
  });

  describe('computeProInfo', () => {
    const now = new Date('2026-11-17T00:00:00Z');
    const base = { cancelAtPeriodEnd: false, graceUntil: null };

    it('cuenta los días de una suscripción activa hasta ahora', () => {
      const info = computeProInfo(
        [{ ...base, status: 'active', createdAt: new Date(now.getTime() - 40 * DAY), updatedAt: now, currentPeriodEnd: new Date(now.getTime() + 10 * DAY) }],
        now,
      );
      expect(info.days).toBe(40);
      expect(info.active).toBe(true);
      expect(info.since?.getTime()).toBe(now.getTime() - 40 * DAY);
    });

    it('no cuenta dos veces suscripciones solapadas (Stripe + Google Play)', () => {
      const info = computeProInfo(
        [
          { ...base, status: 'expired', createdAt: new Date(now.getTime() - 100 * DAY), updatedAt: new Date(now.getTime() - 60 * DAY), currentPeriodEnd: new Date(now.getTime() - 60 * DAY) },
          { ...base, status: 'expired', createdAt: new Date(now.getTime() - 80 * DAY), updatedAt: new Date(now.getTime() - 50 * DAY), currentPeriodEnd: new Date(now.getTime() - 50 * DAY) },
        ],
        now,
      );
      expect(info.days).toBe(50);
      expect(info.active).toBe(false);
      expect(info.since).toBeNull();
    });

    it('sin suscripciones: 0 días', () => {
      expect(computeProInfo([], now)).toEqual({ days: 0, active: false, since: null });
    });
  });

  describe('addPlayTime', () => {
    function build(prev: string | null) {
      const prisma: any = { $transaction: jest.fn(async (ops: any[]) => ops), userStat: { upsert: jest.fn() } };
      const redis: any = {
        key: (k: string) => k,
        run: jest.fn(async (fn: any) => fn({ getset: jest.fn(async () => prev), expire: jest.fn() })),
      };
      const events: any = { emit: jest.fn() };
      return { svc: new StatsService(prisma, redis, events), prisma, events };
    }

    it('suma el hueco desde el último tick si es razonable', async () => {
      const now = 1_000_000;
      const { svc, prisma, events } = build(String(now - 30_000));
      await expect(svc.addPlayTime('u1', now)).resolves.toBe(30);
      expect(prisma.userStat.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { value: { increment: 30 } } }),
      );
      expect(events.emit).toHaveBeenCalledWith('stats:changed', { userId: 'u1', keys: ['play_seconds'] });
    });

    it('no suma nada en el primer tick ni tras una desconexión larga', async () => {
      const now = 1_000_000;
      await expect(build(null).svc.addPlayTime('u1', now)).resolves.toBe(0);
      await expect(build(String(now - PLAYTIME_MAX_GAP_MS - 1)).svc.addPlayTime('u1', now)).resolves.toBe(0);
    });

    it('sin Redis no cuenta tiempo', async () => {
      const svc = new StatsService({} as any, undefined, undefined);
      await expect(svc.addPlayTime('u1')).resolves.toBe(0);
    });
  });

  describe('touchPlayDay', () => {
    function build(lastDay: number | null, streakBefore = 0) {
      const values: Record<string, number> = {};
      if (lastDay !== null) values.last_play_day = lastDay;
      values.streak_current = streakBefore;
      const prisma: any = {
        userStat: {
          findUnique: jest.fn(async ({ where }: any) =>
            where.userId_key.key in values && lastDay !== null ? { value: values[where.userId_key.key] } : null,
          ),
          updateMany: jest.fn(async ({ where, data }: any) => {
            const cur = values[where.key] ?? 0;
            if (where.value !== undefined && typeof where.value === 'number' && cur !== where.value) return { count: 0 };
            if (where.value?.lt !== undefined && !(cur < where.value.lt)) return { count: 0 };
            values[where.key] = data.value;
            return { count: 1 };
          }),
          create: jest.fn(async ({ data }: any) => {
            values[data.key] = data.value;
          }),
          upsert: jest.fn(async ({ where, update, create }: any) => {
            const k = where.userId_key.key;
            if (k in values) {
              if (typeof update.value === 'number') values[k] = update.value;
              else if (update.value?.increment) values[k] += update.value.increment;
            } else values[k] = create.value;
            return { value: values[k] };
          }),
        },
      };
      return { svc: new StatsService(prisma, undefined, { emit: jest.fn() } as any), values };
    }
    const now = new Date('2026-11-17T12:00:00Z');

    it('continúa la racha si el último día fue ayer', async () => {
      const { svc, values } = build(20261116, 4);
      await expect(svc.touchPlayDay('u1', 'UTC', now)).resolves.toBe(true);
      expect(values.streak_current).toBe(5);
      expect(values.streak_best).toBe(5);
      expect(values.last_play_day).toBe(20261117);
    });

    it('reinicia la racha tras saltarse días (y conserva la mejor)', async () => {
      const { svc, values } = build(20261110, 9);
      values.streak_best = 9;
      await svc.touchPlayDay('u1', 'UTC', now);
      expect(values.streak_current).toBe(1);
      expect(values.streak_best).toBe(9);
    });

    it('no hace nada si ya jugó hoy', async () => {
      const { svc, values } = build(20261117, 3);
      await expect(svc.touchPlayDay('u1', 'UTC', now)).resolves.toBe(false);
      expect(values.streak_current).toBe(3);
    });

    it('primer día jugado: racha 1', async () => {
      const { svc, values } = build(null);
      await svc.touchPlayDay('u1', 'UTC', now);
      expect(values.streak_current).toBe(1);
      expect(values.streak_best).toBe(1);
    });
  });
});
