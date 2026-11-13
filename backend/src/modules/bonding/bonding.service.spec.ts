import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BondingService } from './bonding.service';

/** Balance de la feature 006 (misma forma que `balance.json → bonding`). */
const BONDING_BALANCE = {
  interactions: { feed: 2, battle: 3, minigame: 2, chat: 1, clean: 1, sleep: 0.5, evolve: 5 },
  decayRatePerDay: 0.5,
  graceWindowHours: 24,
  decayStartHours: 48,
  tiers: [
    { id: 'acquainted', name: 'Acostumbrado', min: 0 },
    { id: 'companion', name: 'Compañero', min: 30 },
    { id: 'ally', name: 'Aliado', min: 60 },
    { id: 'soulmate', name: 'Alma gemela', min: 80 },
    { id: 'legend', name: 'Leyenda', min: 100 },
  ],
};

describe('BondingService', () => {
  let service: BondingService;
  let prisma: any;
  let gameData: any;
  let realtime: any;
  let tx: any;

  const hoursAgo = (h: number, from = new Date()) => new Date(from.getTime() - h * 3600 * 1000);

  const petRow = (over: Record<string, any> = {}) => ({
    id: 'p1',
    userId: 'u1',
    bonding: 0,
    bondingTier: 'acquainted',
    lastInteractionAt: new Date(),
    intelligence: 0,
    ...over,
  });

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn(),
      pet: { update: jest.fn() },
      bondingEvent: { create: jest.fn() },
    };
    prisma = {
      pet: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      bondingEvent: { findMany: jest.fn(), create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    gameData = { getBalance: jest.fn(() => ({ bonding: BONDING_BALANCE })) };
    realtime = { emitToUser: jest.fn(), emitPetUpdate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BondingService,
        { provide: PrismaService, useValue: prisma },
        { provide: GameDataService, useValue: gameData },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();
    service = module.get(BondingService);
  });

  describe('recordInteraction', () => {
    it('sube el vínculo con el incremento del balance y crea el BondingEvent', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 28, bondingTier: 'acquainted' }]);
      prisma.pet.findUnique.mockResolvedValue(petRow({ bonding: 30 }));

      const result = await service.recordInteraction('p1', 'u1', 'feed');

      expect(result).toEqual({ bonding: 30, bondingTier: 'companion', tierChanged: 'up' });
      // clamp(bonding + feed=2, 0, 100) = 30; recalcula tier; lastInteractionAt = now (FR-014)
      expect(tx.pet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({
            bonding: 30,
            bondingTier: 'companion',
            lastInteractionAt: expect.any(Date),
          }),
        }),
      );
      // Auditoría (SC-003): una BondingEvent con delta y value coherentes
      expect(tx.bondingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ petId: 'p1', delta: 2, reason: 'feed', value: 30 }),
        }),
      );
    });

    it('cruce 29 → 30 emite bonding:tier_up exactamente una vez', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 29, bondingTier: 'acquainted' }]);
      prisma.pet.findUnique.mockResolvedValue(petRow({ bonding: 30 }));

      // chat (+1) lleva 29 → 30: cruce de umbral (escenario de aceptación 4 de la spec)
      await service.recordInteraction('p1', 'u1', 'chat');

      expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
      expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'bonding:tier_up', {
        petId: 'p1',
        oldTier: 'acquainted',
        newTier: 'companion',
        bonding: 30,
      });
    });

    it('sin cruce de tier no emite bonding:tier_up', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 35, bondingTier: 'companion' }]);
      prisma.pet.findUnique.mockResolvedValue(petRow({ bonding: 37 }));

      const result = await service.recordInteraction('p1', 'u1', 'feed');

      expect(result.tierChanged).toBeNull();
      expect(result.bonding).toBe(37);
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    });

    it('capa en 100 (98 + 2 = 100, nunca 100.2) y registra el value real', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 98, bondingTier: 'soulmate' }]);
      prisma.pet.findUnique.mockResolvedValue(petRow({ bonding: 100 }));

      const result = await service.recordInteraction('p1', 'u1', 'feed');

      expect(result.bonding).toBe(100);
      expect(result.bondingTier).toBe('legend');
      expect(tx.bondingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ delta: 2, value: 100, reason: 'feed' }),
        }),
      );
    });

    it('tipo de interacción inválido → 400 (Constitución I)', async () => {
      await expect(service.recordInteraction('p1', 'u1', 'hack')).rejects.toThrow(BadRequestException);
      await expect(service.recordInteraction('p1', 'u1', 'hack')).rejects.toThrow('Tipo de interacción inválido');
      expect(prisma.pet.findFirst).not.toHaveBeenCalled();
    });

    it('pet inexistente o ajeno al usuario → 404', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);
      await expect(service.recordInteraction('p1', 'u2', 'feed')).rejects.toThrow(NotFoundException);
    });

    it('acumula varias interacciones independientes (SC-003)', async () => {
      prisma.pet.findFirst.mockResolvedValue({ id: 'p1' });
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 0, bondingTier: 'acquainted' }]);
      prisma.pet.findUnique.mockResolvedValue(petRow({ bonding: 5 }));

      await service.recordInteraction('p1', 'u1', 'minigame'); // +2
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', bonding: 2, bondingTier: 'acquainted' }]);
      const result = await service.recordInteraction('p1', 'u1', 'battle'); // +3

      expect(result.bonding).toBe(5);
      expect(tx.bondingEvent.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('applyDecay', () => {
    const now = new Date('2026-11-13T12:00:00Z');

    it('ventana de gracia: 20h de inactividad no decae', async () => {
      const result = await service.applyDecay(
        petRow({ bonding: 50, bondingTier: 'ally', lastInteractionAt: hoursAgo(20, now) }),
        now,
      );

      // Sin decaimiento: se devuelve el estado tal cual está persistido
      expect(result).toEqual({ decayed: false, bonding: 50, bondingTier: 'ally', delta: 0 });
      expect(prisma.pet.update).not.toHaveBeenCalled();
      expect(prisma.bondingEvent.create).not.toHaveBeenCalled();
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    });

    it('48h exactas: aún no decae', async () => {
      const result = await service.applyDecay(petRow({ bonding: 50, lastInteractionAt: hoursAgo(48, now) }), now);

      expect(result.decayed).toBe(false);
      expect(prisma.pet.update).not.toHaveBeenCalled();
    });

    it('72h: decae 0.5 puntos y crea BondingEvent(reason="decay")', async () => {
      const result = await service.applyDecay(
        petRow({ bonding: 70, bondingTier: 'ally', lastInteractionAt: hoursAgo(72, now) }),
        now,
      );

      // (72 − 48)/24 × 0.5 = 0.5 → 70 → 69.5
      expect(result).toEqual({ decayed: true, bonding: 69.5, bondingTier: 'ally', delta: -0.5 });
      expect(prisma.pet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({
            bonding: 69.5,
            bondingTier: 'ally',
            // idempotencia: re-fija la base de referencia a `now`
            lastInteractionAt: now,
          }),
        }),
      );
      expect(prisma.bondingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ petId: 'p1', delta: -0.5, reason: 'decay', value: 69.5 }),
        }),
      );
      // |delta| ≤ 1 y sin cruce de tier: no se emite nada (SC-005: sin spam)
      expect(realtime.emitToUser).not.toHaveBeenCalled();
    });

    it('cruce de rango por decaimiento emite bonding:tier_down (60.2 → 59.7)', async () => {
      const result = await service.applyDecay(
        petRow({ bonding: 60.2, bondingTier: 'ally', lastInteractionAt: hoursAgo(72, now) }),
        now,
      );

      expect(result.bondingTier).toBe('companion');
      expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'bonding:tier_down', {
        petId: 'p1',
        oldTier: 'ally',
        newTier: 'companion',
        bonding: 59.7,
      });
      expect(realtime.emitToUser).toHaveBeenCalledTimes(1); // |delta| ≤ 1 → sin bonding:decay
    });

    it('caída > 1 punto emite bonding:decay (100h: 90 → 88.92)', async () => {
      const result = await service.applyDecay(
        petRow({ bonding: 90, bondingTier: 'soulmate', lastInteractionAt: hoursAgo(100, now) }),
        now,
      );

      // 0.5 × (100 − 48)/24 = 1.0833… → 1.08
      expect(result.bonding).toBe(88.92);
      expect(result.delta).toBe(-1.08);
      expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'bonding:decay', {
        petId: 'p1',
        bonding: 88.92,
        delta: -1.08,
      });
      expect(
        realtime.emitToUser.mock.calls.some(([, ev]) => ev === 'bonding:tier_down'),
      ).toBe(false);
    });

    it('piso en 0: decae hasta 0 sin nunca ser negativo', async () => {
      const result = await service.applyDecay(
        petRow({ bonding: 0.3, lastInteractionAt: hoursAgo(72, now) }),
        now,
      );

      expect(result.bonding).toBe(0);
      expect(result.delta).toBe(-0.3);
    });

    it('idempotencia: tras aplicar, la doble lectura no vuelve a decae', async () => {
      await service.applyDecay(petRow({ bonding: 70, lastInteractionAt: hoursAgo(72, now) }), now);

      // La base quedó re-fijada a `now` → la siguiente lectura ve 0h de inactividad
      const second = await service.applyDecay(petRow({ bonding: 69.5, lastInteractionAt: now }), now);
      expect(second.decayed).toBe(false);
      expect(prisma.pet.update).toHaveBeenCalledTimes(1);
      expect(prisma.bondingEvent.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBondingDetail', () => {
    it('devuelve valor, tier, historial, decayInfo y unlocks (SC-003/FR-011/FR-012)', async () => {
      prisma.pet.findFirst.mockResolvedValue(
        petRow({ bonding: 61.25, lastInteractionAt: new Date('2026-11-13T10:00:00Z') }),
      );
      const events = [
        { id: 'e1', delta: 5, reason: 'evolve', value: 61.25, createdAt: new Date('2026-11-13T09:00:00Z') },
        { id: 'e2', delta: -0.75, reason: 'decay', value: 56.25, createdAt: new Date('2026-11-13T08:59:00Z') },
        { id: 'e3', delta: 2, reason: 'feed', value: 57, createdAt: new Date('2026-11-13T08:58:00Z') },
      ];
      prisma.bondingEvent.findMany.mockResolvedValue(events);

      const detail = await service.getBondingDetail('p1', 'u1');

      expect(detail.value).toBe(61.25);
      expect(detail.tier).toBe('ally');
      expect(detail.tierName).toBe('Aliado');
      expect(detail.lastInteractionAt).toBe('2026-11-13T10:00:00.000Z');
      expect(detail.history.items).toHaveLength(3);
      expect(detail.history.items[0]).toMatchObject({ id: 'e1', delta: 5, reason: 'evolve' });
      expect(detail.history.nextCursor).toBeNull();
      expect(detail.decayInfo.decayRatePerDay).toBe(0.5);
      expect(detail.decayInfo.graceWindowHours).toBe(24);
      expect(detail.decayInfo.decayStartHours).toBe(48);
      expect(detail.unlocks).toEqual({
        greeting: true,
        memoryRecall: true,
        emotionalReactions: false,
        patternUnlocked: false,
        sleepNearCursor: false,
      });
    });

    it('limit fuera de rango → 400; cursor inválido → 400', async () => {
      await expect(service.getBondingDetail('p1', 'u1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.getBondingDetail('p1', 'u1', 101)).rejects.toThrow('limit fuera de rango');
      prisma.pet.findFirst.mockResolvedValue(petRow({}));
      await expect(service.getBondingDetail('p1', 'u1', 20, 'no-es-una-fecha')).rejects.toThrow('cursor inválido');
    });

    it('paginación por cursor: nextCursor es el createdAt de la última fila de la página', async () => {
      prisma.pet.findFirst.mockResolvedValue(petRow({}));
      const at = (offsetSec: number) => new Date(Date.UTC(2026, 10, 13, 9, 0, 0) - offsetSec * 1000);
      const rows = [1, 2, 3].map((i) => ({ id: `e${i}`, delta: i, reason: 'feed', value: i, createdAt: at(i) }));
      prisma.bondingEvent.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[2]]);

      const page1 = await service.getBondingDetail('p1', 'u1', 2);
      expect(page1.history.items).toHaveLength(2);
      expect(page1.history.nextCursor).toBe(at(2).toISOString());

      const page2 = await service.getBondingDetail('p1', 'u1', 2, page1.history.nextCursor);
      expect(page2.history.items).toHaveLength(1);
      expect(page2.history.nextCursor).toBeNull();
      expect(prisma.bondingEvent.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { petId: 'p1', createdAt: { lt: expect.any(Date) } } }),
      );
    });

    it('pet inexistente o ajeno → 404', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);
      await expect(service.getBondingDetail('p1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('legend (100) desbloquea patrón exclusivo y dormir cerca; memoryRecall también por inteligencia', async () => {
      prisma.pet.findFirst.mockResolvedValue(petRow({ bonding: 100, intelligence: 0 }));
      prisma.bondingEvent.findMany.mockResolvedValue([]);

      const legend = await service.getBondingDetail('p1', 'u1');
      expect(legend.unlocks).toEqual({
        greeting: true,
        memoryRecall: true,
        emotionalReactions: true,
        patternUnlocked: true,
        sleepNearCursor: true,
      });

      // OR con intelligence >= MEMORY_UNLOCK (200): pet acquainted con alta inteligencia
      prisma.pet.findFirst.mockResolvedValue(petRow({ bonding: 10, intelligence: 200 }));
      const byIntelligence = await service.getBondingDetail('p1', 'u1');
      expect(byIntelligence.unlocks.memoryRecall).toBe(true);
      expect(byIntelligence.unlocks.greeting).toBe(false);
    });
  });

  describe('bondingFields', () => {
    it('mappea valor/tier/nombre/última interacción para GET /pets/:id (T012)', () => {
      const fields = service.bondingFields(
        petRow({ bonding: 30, lastInteractionAt: new Date('2026-11-13T10:00:00Z') }),
      );

      expect(fields).toEqual({
        bonding: 30,
        bondingTier: 'companion',
        bondingTierName: 'Compañero',
        lastInteractionAt: '2026-11-13T10:00:00.000Z',
      });
    });
  });
});
