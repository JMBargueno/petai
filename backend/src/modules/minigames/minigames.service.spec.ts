import { Test } from '@nestjs/testing';
import { MinigamesService } from './minigames.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { BondingService } from '../bonding/bonding.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GAME_DEFINITIONS, createRunner, packLog, TICK_MS } from '@pockai/minigames/logic';

const CFG = {
  minigames: {
    sessionTtlSeconds: 300, graceSeconds: 5, cooldownSeconds: 15,
    dailyRewardedSessions: 2, energyCost: 10, minEnergy: 10,
    requireReplay: false, elementAffinityBonus: 0.25,
    games: {
      reflex: {
        name: 'Reflejos', durationSeconds: 30, minDurationSeconds: 10, maxScorePerSecond: 2,
        coinsPerPoint: 0.6, maxCoins: 36, xpPerPoint: 1.5, maxXp: 50, happiness: 12,
      },
      forja_termica: {
        name: 'Forja', element: 'fire', durationSeconds: 45, minDurationSeconds: 15, maxScorePerSecond: 1.5,
        coinsPerPoint: 1, maxCoins: 40, xpPerPoint: 1.5, maxXp: 60, happiness: 12,
        itemDrop: { itemId: 'spicy_berry', minScore: 0, chance: 1 },
      },
    },
  },
};

describe('MinigamesService', () => {
  let service: MinigamesService;
  const prisma: any = {
    minigameSession: {
      count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn(), update: jest.fn(),
    },
    user: { update: jest.fn() },
    pet: { findFirst: jest.fn() },
    inventoryItem: { upsert: jest.fn() },
  };
  const pets: any = { getPetById: jest.fn(), applyActivityReward: jest.fn() };
  const events: any = { emit: jest.fn() };
  const bonding: any = { recordInteraction: jest.fn().mockResolvedValue({ bonding: 2, bondingTier: 'acquainted', tierChanged: null }) };

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        MinigamesService,
        { provide: PrismaService, useValue: prisma },
        { provide: GameDataService, useValue: { getBalance: () => CFG } },
        { provide: PetsService, useValue: pets },
        { provide: BondingService, useValue: bonding },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = mod.get(MinigamesService);
  });

  it('el listado incluye el coste de energía (el cliente avisa si no llega)', () => {
    expect(service.listGames()).toEqual([
      expect.objectContaining({ id: 'reflex', energyCost: 10, element: null }),
      expect.objectContaining({ id: 'forja_termica', element: 'fire' }),
    ]);
  });

  describe('start', () => {
    const okPet = { id: 'p', sleeping: false, energy: 80 };
    beforeEach(() => {
      pets.getPetById.mockResolvedValue(okPet);
      prisma.minigameSession.count.mockResolvedValue(0);
      prisma.minigameSession.findFirst.mockResolvedValue(null);
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 0 });
      prisma.minigameSession.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 's1', startedAt: new Date(), ...data }));
    });

    it('crea una sesión con semilla del servidor', async () => {
      const r = await service.start('u', 'reflex', 'p');
      expect(r.sessionId).toBe('s1');
      expect(r.seed).toBeGreaterThan(0);
      expect(r.durationSeconds).toBe(30);
      expect(r.variant).toBe('standard');
    });

    it('guarda la variante accesible y rechaza variantes desconocidas', async () => {
      const r = await service.start('u', 'reflex', 'p', 'easy');
      expect(r.variant).toBe('easy');
      expect(prisma.minigameSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ variant: 'easy' }) });
      await expect(service.start('u', 'reflex', 'p', 'god-mode')).rejects.toThrow('Variante');
    });

    it('rechaza minijuegos desconocidos, mascota dormida o cansada', async () => {
      await expect(service.start('u', 'nope', 'p')).rejects.toThrow('no encontrado');
      pets.getPetById.mockResolvedValue({ ...okPet, sleeping: true });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('durmiendo');
      pets.getPetById.mockResolvedValue({ ...okPet, energy: 5 });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('cansada');
    });

    it('aplica el límite diario y el cooldown', async () => {
      prisma.minigameSession.count.mockResolvedValue(2);
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('límite diario');
      prisma.minigameSession.count.mockResolvedValue(0);
      prisma.minigameSession.findFirst.mockResolvedValue({ startedAt: new Date() });
      await expect(service.start('u', 'reflex', 'p')).rejects.toThrow('Espera');
    });
  });

  describe('finish', () => {
    const session = (secondsAgo: number) => ({
      id: 's1', userId: 'u', petId: 'p', gameId: 'reflex', finishedAt: null,
      startedAt: new Date(Date.now() - secondsAgo * 1000),
    });
    beforeEach(() => {
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 1 });
      pets.applyActivityReward.mockResolvedValue({ id: 'p' });
    });

    it('recompensa una puntuación plausible, con topes', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      const r = await service.finish('u', 's1', 50);
      expect(r.rewards.coins).toBe(30); // 50*0.6
      expect(r.rewards.xp).toBe(50); // min(50, 75)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ coins: { increment: 30 } }) }));
      expect(pets.applyActivityReward).toHaveBeenCalled();
      // Spec 39: el evento lleva el juego, para misiones y logros por juego.
      expect(events.emit).toHaveBeenCalledWith('minigame:finished', { userId: 'u', petId: 'p', gameId: 'reflex', score: 50 });
    });

    it('limita la recompensa al máximo del juego', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(35));
      const r = await service.finish('u', 's1', 70);
      expect(r.rewards.coins).toBe(36);
    });

    it('rechaza puntuaciones imposibles y partidas demasiado cortas sin recompensar', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      await expect(service.finish('u', 's1', 9999)).rejects.toThrow('imposible');
      prisma.minigameSession.findFirst.mockResolvedValue(session(3));
      await expect(service.finish('u', 's1', 5)).rejects.toThrow('demasiado corta');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(pets.applyActivityReward).not.toHaveBeenCalled();
    });

    it('rechaza sesiones caducadas, ya finalizadas, ajenas y puntuaciones inválidas', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(400));
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('caducado');
      prisma.minigameSession.findFirst.mockResolvedValue({ ...session(30), finishedAt: new Date() });
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('ya fue finalizada');
      prisma.minigameSession.findFirst.mockResolvedValue(null);
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('no encontrada');
      await expect(service.finish('u', 's1', -1)).rejects.toThrow('entero');
      await expect(service.finish('u', 's1', 1.5)).rejects.toThrow('entero');
    });

    it('si otra petición ya cerró la sesión (carrera) no recompensa dos veces', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session(30));
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.finish('u', 's1', 10)).rejects.toThrow('ya fue finalizada');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('validación por repetición (spec 39, fase 3)', () => {
    const SEED = 4242;
    const session = (gameId = 'reflex', secondsAgo = 32, variant = 'standard') => ({
      id: 's1', userId: 'u', petId: 'p', gameId, variant, seed: SEED, finishedAt: null,
      startedAt: new Date(Date.now() - secondsAgo * 1000),
    });

    /** Juega una partida real de Reflejos (acierta cada objetivo al tick siguiente) y devuelve su prueba. */
    function playReflex(variant: 'standard' | 'easy' = 'standard') {
      const def = GAME_DEFINITIONS.reflex;
      const runner = createRunner(def, { seed: SEED, durationSeconds: 30, variant });
      while (!runner.over()) {
        if ((runner.state as any).target) runner.push({ kind: 'hit' });
        runner.advance(TICK_MS);
      }
      return { score: runner.score(), ticks: runner.tick, log: packLog(def, runner.log) };
    }

    beforeEach(() => {
      prisma.minigameSession.updateMany.mockResolvedValue({ count: 1 });
      pets.applyActivityReward.mockResolvedValue({ id: 'p' });
    });

    it('acepta la partida si la repetición da la misma puntuación', async () => {
      const play = playReflex();
      expect(play.score).toBeGreaterThan(0);
      prisma.minigameSession.findFirst.mockResolvedValue(session());
      const r = await service.finish('u', 's1', play.score, { ticks: play.ticks, log: play.log });
      expect(r.verified).toBe(true);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('repite con la variante guardada en la sesión', async () => {
      const play = playReflex('easy');
      prisma.minigameSession.findFirst.mockResolvedValue(session('reflex', 32, 'easy'));
      await expect(service.finish('u', 's1', play.score, { ticks: play.ticks, log: play.log })).resolves.toMatchObject({ verified: true });
      // La misma partida contra una sesión normal no cuadra: la variante no la elige el cliente al final.
      prisma.minigameSession.findFirst.mockResolvedValue(session('reflex', 32, 'standard'));
      await expect(service.finish('u', 's1', play.score, { ticks: play.ticks, log: play.log })).rejects.toThrow('no coincide');
    });

    it('rechaza una puntuación inflada, un registro manipulado o ticks imposibles, sin recompensa', async () => {
      const play = playReflex();
      prisma.minigameSession.findFirst.mockResolvedValue(session());
      await expect(service.finish('u', 's1', play.score + 1, { ticks: play.ticks, log: play.log })).rejects.toThrow('no coincide');
      await expect(service.finish('u', 's1', play.score, { ticks: play.ticks, log: [[0, 'teleport']] })).rejects.toThrow('no válido');
      await expect(service.finish('u', 's1', play.score, { ticks: play.ticks, log: 'basura' })).rejects.toThrow('no válido');
      await expect(service.finish('u', 's1', play.score, { ticks: 999999, log: play.log })).rejects.toThrow('no válido');
      // Más ticks de juego que tiempo real transcurrido: imposible.
      prisma.minigameSession.findFirst.mockResolvedValue(session('reflex', 12));
      await expect(service.finish('u', 's1', 0, { ticks: play.ticks, log: [] })).rejects.toThrow('no válido');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sin registro: se acepta sin verificar (clientes antiguos) salvo que requireReplay esté activo', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session());
      await expect(service.finish('u', 's1', 10)).resolves.toMatchObject({ verified: false });
      (CFG.minigames as any).requireReplay = true;
      try {
        await expect(service.finish('u', 's1', 10)).rejects.toThrow('Falta el registro');
      } finally {
        (CFG.minigames as any).requireReplay = false;
      }
    });

    /** Partida real de la Forja: aviva el fuelle cuando la temperatura baja de la franja. */
    function playForja() {
      const def = GAME_DEFINITIONS.forja_termica;
      const runner = createRunner(def, { seed: SEED, durationSeconds: 45 });
      while (!runner.over()) {
        const s = runner.state as any;
        if (s.temp < s.zone - 4) runner.push({ kind: 'pump' });
        runner.advance(TICK_MS);
      }
      return { score: runner.score(), ticks: runner.tick, log: packLog(def, runner.log) };
    }

    it('las Pruebas exigen siempre el registro (no hay clientes antiguos que las jueguen)', async () => {
      prisma.minigameSession.findFirst.mockResolvedValue(session('forja_termica', 50));
      await expect(service.finish('u', 's1', 8)).rejects.toThrow('Falta el registro');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('afinidad de elemento: +25 % de felicidad si la especie es del elemento del juego', async () => {
      const play = playForja();
      prisma.minigameSession.findFirst.mockResolvedValue(session('forja_termica', 50));
      prisma.pet.findFirst.mockResolvedValue({ species: { element: 'fire' } });
      const r = await service.finish('u', 's1', play.score, play);
      expect(r.verified).toBe(true);
      expect(r.affinity).toBe(true);
      expect(r.rewards.happiness).toBe(15); // 12 × 1,25
      prisma.pet.findFirst.mockResolvedValue({ species: { element: 'water' } });
      const r2 = await service.finish('u', 's1', play.score, play);
      expect(r2.affinity).toBe(false);
      expect(r2.rewards.happiness).toBe(12);
    });

    it('la Forja puede soltar un objeto al inventario (lo decide el servidor)', async () => {
      const play = playForja();
      prisma.minigameSession.findFirst.mockResolvedValue(session('forja_termica', 50));
      const r = await service.finish('u', 's1', play.score, play);
      expect(r.item).toEqual({ itemId: 'spicy_berry', qty: 1 });
      expect(prisma.inventoryItem.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId_itemId: { userId: 'u', itemId: 'spicy_berry' } },
      }));
    });
  });
});
