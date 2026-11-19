import { combatBias, isValidDims } from '../mind/personality.engine';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { HabitatService } from '../habitat/habitat.service';
import { buffValue } from '../habitat/habitat-buffs';
import { BondingService } from '../bonding/bonding.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { LeaderboardService, BoardScope } from './leaderboard.service';
import { ExclusiveLockService } from '../../redis/exclusive-lock.service';
import { RedisCacheService } from '../../redis/redis-cache.service';
import { generateBot } from './combat/bots';
import { simulateBattle } from './combat/engine';
import { applyElo, leagueFor, pickOpponent } from './combat/ranking';
import { createRng } from './combat/rng';
import {
  allocatedPoints,
  effectiveStats,
  equippedSkills,
  moodMultiplier,
  unlockedSkills,
  validateAllocation,
  validateEquip,
} from './combat/stats';
import { BattleLog, CombatConfig, Element, Fighter, SkillDef, Strategy } from './combat/types';
import { ActivityDropsService } from '../inventory/activity-drops.service';

const STRATEGIES: Strategy[] = ['aggressive', 'defensive', 'balanced'];
const DAY_MS = 24 * 3600 * 1000;
const RECENT_OPPONENT_MS = 3600 * 1000;
const CANDIDATE_POOL = 100;

type Outcome = 'win' | 'draw' | 'loss';

@Injectable()
export class BattlesService {
  private readonly logger = new Logger(BattlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    private readonly leaderboard: LeaderboardService,
    private readonly realtime: RealtimeGateway,
    private readonly bonding: BondingService,
    private readonly eventEmitter: EventEmitter2,
    private readonly exclusiveLock: ExclusiveLockService,
    private readonly cache: RedisCacheService,
    // Buffs de muebles (spec 10): opcional para no romper tests que construyen el servicio a mano
    @Optional() private readonly habitat?: HabitatService,
    // Drops de actividades (spec 41)
    @Optional() private readonly activityDrops?: ActivityDropsService,
  ) {}

  private get cfg(): CombatConfig & Record<string, any> {
    return this.gameData.getBalance().combats;
  }
  private get catalog(): SkillDef[] {
    return this.gameData.getSkills();
  }

  // ---------- Luchadores ----------

  /**
   * Bonus de ánimo en combate (`combat_mood_bonus`, spec 10) de cada mascota, ya recortado al
   * tope, con UNA consulta para todas. Las que no tienen muebles (o sin HabitatService) dan 0.
   */
  async combatMoodBonuses(petIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.habitat || petIds.length === 0) return out;
    const buffs = await this.habitat.getActiveBuffsForPets(petIds);
    for (const [id, b] of buffs) out.set(id, buffValue(b, 'combat_mood_bonus'));
    return out;
  }

  /** @param moodBonus `combat_mood_bonus` del hábitat de la mascota (ver `combatMoodBonuses`). */
  fighterFromPet(pet: any, moodBonus = 0): Fighter {
    const element = pet.species.element as Element;
    return {
      name: pet.nickname || pet.species.name,
      speciesId: pet.species.id,
      stage: pet.stage ?? 'baby',
      element,
      level: pet.level,
      stats: effectiveStats(pet),
      mood: moodMultiplier(pet, this.cfg, moodBonus),
      skills: equippedSkills(pet, element, this.catalog),
      strategy: STRATEGIES.includes(pet.strategy) ? pet.strategy : 'balanced',
      isBot: false,
      petId: pet.id,
      ownerId: pet.userId,
      // Spec 36: la valentía y el temperamento sesgan las decisiones (no las stats)
      ...(this.personalityBias(pet) ? { personality: this.personalityBias(pet) } : {}),
    };
  }

  private personalityBias(pet: any) {
    const cfg = this.gameData.getBalance().personality;
    const dims = (pet.personality as any)?.dims;
    return cfg && isValidDims(dims) ? combatBias(dims, cfg) : undefined;
  }

  private async ownPet(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    // getPetById aplica el tick perezoso: energía y ánimo al día antes de combatir
    return this.petsService.getPetById(userId, petId);
  }

  // ---------- Perfil de combate ----------

  async battlesInLastDay(userId: string): Promise<number> {
    return this.prisma.battle.count({
      where: { attackerPet: { userId }, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
  }

  private fightBlocker(pet: any, usedToday: number): string | null {
    if (pet.level < this.cfg.minLevel) return `La arena requiere nivel ${this.cfg.minLevel}`;
    if (pet.sleeping) return 'La mascota está durmiendo';
    if (pet.energy < this.cfg.energyCostPerBattle) return `Necesita al menos ${this.cfg.energyCostPerBattle} de energía`;
    if (usedToday >= this.cfg.dailyFreeBattles) return 'Has alcanzado el límite diario de peleas';
    return null;
  }

  async combatProfile(userId: string, petId: string) {
    const pet = await this.ownPet(userId, petId);
    const element = pet.species.element as Element;
    const used = await this.battlesInLastDay(userId);
    const equipped = equippedSkills(pet, element, this.catalog);
    const blocker = this.fightBlocker(pet, used);
    const moodBonus = (await this.combatMoodBonuses([pet.id])).get(pet.id) ?? 0;
    return {
      petId: pet.id,
      name: pet.nickname,
      element,
      level: pet.level,
      stats: effectiveStats(pet),
      allocated: allocatedPoints(pet),
      statPoints: pet.statPoints,
      // El mismo ánimo que usará el combate, con el bonus de los muebles incluido
      mood: moodMultiplier(pet, this.cfg, moodBonus),
      strategy: pet.strategy,
      elo: pet.elo,
      league: leagueFor(pet.elo, this.cfg.leagues),
      unlockedSkills: unlockedSkills(this.catalog, element, pet.level).map((s) => s.id),
      equippedSkills: equipped.map((s) => s.id),
      battlesToday: used,
      dailyLimit: this.cfg.dailyFreeBattles,
      energyCost: this.cfg.energyCostPerBattle,
      canFight: blocker === null,
      reason: blocker,
    };
  }

  async allocateStats(userId: string, petId: string, raw: unknown) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    const check = validateAllocation(raw, pet.statPoints);
    if (check.ok === false) throw new BadRequestException(check.error);

    const current = allocatedPoints(pet);
    const next = { ...current };
    for (const [k, v] of Object.entries(check.points)) next[k as keyof typeof next] += v as number;

    // Cierre optimista: solo se aplica si los puntos disponibles no cambiaron entre medias
    const res = await this.prisma.pet.updateMany({
      where: { id: petId, userId, statPoints: pet.statPoints },
      data: {
        statPoints: { decrement: check.total },
        combatStats: { ...(pet.combatStats as any), allocated: next },
      },
    });
    if (res.count === 0) throw new ConflictException('Los puntos cambiaron mientras se repartían; inténtalo de nuevo');
    return this.combatProfile(userId, petId);
  }

  async equipSkills(userId: string, petId: string, raw: unknown) {
    const pet = await this.petsService.getPetById(userId, petId);
    const check = validateEquip(raw, pet.species.element as Element, pet.level, this.catalog);
    if (check.ok === false) throw new BadRequestException(check.error);
    await this.prisma.pet.update({ where: { id: petId }, data: { skills: check.ids } });
    return this.combatProfile(userId, petId);
  }

  // ---------- Pelea ----------

  async matchmake(userId: string, petId: string) {
    // Un combate a la vez por usuario (guard distribuido, R-02): evita carreras sobre energía,
    // límite diario y ELO, y lo respeta entre réplicas vía Redis.
    return this.exclusiveLock.runExclusive('battle', userId, () => this.fight(userId, petId));
  }

  private async fight(userId: string, petId: string) {
    const pet = await this.ownPet(userId, petId);
    const cfg = this.cfg;
    const used = await this.battlesInLastDay(userId);
    const blocker = this.fightBlocker(pet, used);
    if (blocker) {
      throw used >= cfg.dailyFreeBattles && pet.energy >= cfg.energyCostPerBattle && !pet.sleeping
        ? new HttpException(blocker, HttpStatus.TOO_MANY_REQUESTS)
        : new BadRequestException(blocker);
    }

    const seed = randomInt(1, 2 ** 31 - 1);
    const rng = createRng(seed);

    // Candidatos reales con ELO cercano (se evita repetir rival en la última hora si hay alternativa)
    const recent = await this.prisma.battle.findMany({
      where: { attackerPetId: pet.id, createdAt: { gte: new Date(Date.now() - RECENT_OPPONENT_MS) }, defenderPetId: { not: null } },
      select: { defenderPetId: true },
    });
    const recentIds = new Set(recent.map((r) => r.defenderPetId as string));
    const rows = await this.prisma.pet.findMany({
      where: {
        userId: { not: userId },
        elo: { gte: pet.elo - cfg.elo.maxWindow, lte: pet.elo + cfg.elo.maxWindow },
      },
      include: { species: true, user: { select: { displayName: true } } },
      take: CANDIDATE_POOL,
    });
    const fresh = rows.filter((r) => !recentIds.has(r.id));
    const candidates = (fresh.length > 0 ? fresh : rows).map((r) => ({ petId: r.id, elo: r.elo, row: r }));
    const chosen = pickOpponent(candidates, pet.elo, cfg.elo, rng);

    // El hábitat del rival también cuenta: una sola consulta para los dos
    const moodBonuses = await this.combatMoodBonuses(chosen ? [pet.id, chosen.row.id] : [pet.id]);
    const attacker = this.fighterFromPet(pet, moodBonuses.get(pet.id) ?? 0);
    let defender: Fighter;
    let defenderRow: (typeof rows)[number] | null = null;
    if (chosen) {
      defenderRow = chosen.row;
      defender = this.fighterFromPet(chosen.row, moodBonuses.get(chosen.row.id) ?? 0);
    } else {
      // Sin rival cercano: bot determinista derivado de la semilla del combate
      defender = generateBot((seed ^ 0x9e3779b9) >>> 0, pet.level, this.gameData.getSpecies(), this.catalog, cfg);
    }

    const result = simulateBattle(attacker, defender, seed, cfg);
    const outcome: Outcome = result.winner === 0 ? 'win' : result.winner === null ? 'draw' : 'loss';

    // ELO solo entre jugadores reales; los bots no puntúan en el ranking
    let eloBefore = pet.elo;
    let eloAfter = pet.elo;
    let defenderEloAfter = defenderRow?.elo ?? 0;
    if (defenderRow) {
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      const e = applyElo(pet.elo, defenderRow.elo, score, cfg.elo);
      eloAfter = e.newA;
      defenderEloAfter = e.newB;
    }
    const eloDelta = eloAfter - eloBefore;
    const defenderEloDelta = defenderRow ? defenderEloAfter - defenderRow.elo : 0;

    const battle = await this.prisma.$transaction(async (tx) => {
      if (defenderRow) {
        // Se suma la variación en vez de escribir un valor calculado con una lectura anterior: si otro
        // combate toca a la misma mascota a la vez, ninguna de las dos variaciones se pierde.
        const a = await tx.pet.update({ where: { id: pet.id }, data: { elo: { increment: eloDelta } }, select: { elo: true } });
        const d = await tx.pet.update({ where: { id: defenderRow.id }, data: { elo: { increment: defenderEloDelta } }, select: { elo: true } });
        eloAfter = a.elo;
        defenderEloAfter = d.elo;
        eloBefore = eloAfter - eloDelta;
      }
      return tx.battle.create({
        data: {
          attackerPetId: pet.id,
          defenderPetId: defenderRow?.id ?? null,
          seed,
          winnerPetId: result.winner === 0 ? pet.id : result.winner === 1 ? defenderRow?.id ?? null : null,
          log: result.log as any,
          eloDelta,
        },
      });
    });

    // Recompensas (los bots dan menos para que no compense farmearlos)
    const base = cfg.rewards[outcome];
    const mult = defenderRow ? 1 : cfg.rewards.botMultiplier;
    const rewards = {
      xp: Math.round(base.xp * mult),
      coins: Math.round(base.coins * mult),
      happiness: base.happiness,
      energyCost: cfg.energyCostPerBattle,
    };
    const updatedPet = await this.petsService.applyActivityReward(userId, pet.id, {
      xp: rewards.xp,
      happiness: rewards.happiness,
      energyCost: rewards.energyCost,
    });
    if (rewards.coins > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { coins: { increment: rewards.coins } } });
    }

    // Vínculo (feature 006): cualquier pelea terminada (victoria, empate o derrota) sube el bonding (+3)
    await this.bonding.recordInteraction(pet.id, userId, 'battle');

    // Misiones y logros de combate: cualquier pelea terminada cuenta; `won` suma a los de victorias.
    this.eventEmitter.emit('battle:finished', { userId, petId: pet.id, won: outcome === 'win' });

    // Notificación con personalidad (feature 007): victoria/derrota en la arena (el empate no notifica).
    if (outcome === 'win') {
      this.eventEmitter.emit('pet:battle-won', { userId, petId: pet.id, won: true });
      this.realtime.emitPetAction(userId, pet.id, 'battle_won');
    } else if (outcome === 'loss') {
      this.eventEmitter.emit('pet:battle-lost', { userId, petId: pet.id, won: false });
      this.realtime.emitPetAction(userId, pet.id, 'battle_lost');
    }

    // Clasificaciones (no lanzan si Redis falla)
    await this.leaderboard.record([
      { petId: pet.id, elo: eloAfter, weeklyPoints: this.leaderboard.weeklyPointsFor(outcome) },
      ...(defenderRow ? [{ petId: defenderRow.id, elo: defenderEloAfter }] : []),
    ]);

    // Aviso al defensor (WebSocket); el resultado también queda en su historial
    if (defenderRow) {
      this.realtime.emitToUser(defenderRow.userId, 'battle:defended', {
        battleId: battle.id,
        defenderPetId: defenderRow.id,
        defenderPetName: defenderRow.nickname,
        attackerName: attacker.name,
        attackerOwner: (await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } }))?.displayName ?? null,
        won: result.winner === 1,
        draw: result.winner === null,
        eloDelta: -eloDelta,
        elo: defenderEloAfter,
      });
      this.realtime.emitPetAction(defenderRow.userId, defenderRow.id, 'battle_defended', {
        won: result.winner === 1,
        draw: result.winner === null,
        attackerName: attacker.name,
      });
    }

    const bonusItem = outcome === 'win' ? ((await this.activityDrops?.roll(userId, 'battleWin')) ?? null) : null;
    const league = leagueFor(eloAfter, cfg.leagues);
    return {
      bonusItem,
      battleId: battle.id,
      seed,
      result: { outcome, winner: result.winner, rounds: result.rounds },
      opponent: {
        name: defender.name,
        speciesId: defender.speciesId,
        stage: defender.stage ?? 'baby',
        element: defender.element,
        level: defender.level,
        isBot: defender.isBot,
        ownerName: defenderRow?.user.displayName ?? null,
      },
      elo: { before: eloBefore, after: eloAfter, delta: eloDelta, league },
      rewards,
      replay: result.log,
      pet: updatedPet,
    };
  }

  // ---------- Historial y repeticiones ----------

  private perspective(b: any, userId: string) {
    const role: 'attacker' | 'defender' | null =
      b.attackerPet?.userId === userId ? 'attacker' : b.defenderPet?.userId === userId ? 'defender' : null;
    if (!role) return null;
    const winner = (b.log as BattleLog).events.at(-1) as any;
    const w: 0 | 1 | null = winner?.winner ?? null;
    const mine = role === 'attacker' ? 0 : 1;
    const outcome: Outcome = w === null ? 'draw' : w === mine ? 'win' : 'loss';
    return { role, outcome, eloDelta: role === 'attacker' ? b.eloDelta : -b.eloDelta };
  }

  async history(userId: string, limit = 20) {
    const take = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
    const rows = await this.prisma.battle.findMany({
      where: { OR: [{ attackerPet: { userId } }, { defenderPet: { userId } }] },
      orderBy: { createdAt: 'desc' },
      take,
      include: { attackerPet: { select: { userId: true } }, defenderPet: { select: { userId: true } } },
    });
    return rows.flatMap((b) => {
      const p = this.perspective(b, userId);
      if (!p) return [];
      const [pa, pd] = (b.log as unknown as BattleLog).participants;
      const me = p.role === 'attacker' ? pa : pd;
      const foe = p.role === 'attacker' ? pd : pa;
      return [{
        id: b.id,
        createdAt: b.createdAt,
        role: p.role,
        outcome: p.outcome,
        eloDelta: p.eloDelta,
        rounds: ((b.log as unknown as BattleLog).events.at(-1) as any)?.rounds ?? null,
        me: { name: me.name, level: me.level, element: me.element },
        opponent: { name: foe.name, level: foe.level, element: foe.element, isBot: foe.isBot },
      }];
    });
  }

  /** Detalle y repetición: solo los dos participantes (para otros se responde 404). */
  async getBattle(userId: string, battleId: string) {
    const b = await this.prisma.battle.findUnique({
      where: { id: battleId },
      include: { attackerPet: { select: { userId: true } }, defenderPet: { select: { userId: true } } },
    });
    const p = b ? this.perspective(b, userId) : null;
    if (!b || !p) throw new NotFoundException('Pelea no encontrada');
    return {
      id: b.id,
      seed: b.seed,
      createdAt: b.createdAt,
      role: p.role,
      outcome: p.outcome,
      eloDelta: p.eloDelta,
      replay: b.log,
    };
  }

  // ---------- Clasificación ----------

  async leaderboardView(userId: string, scope: BoardScope, limit: number, petId?: string) {
    if (scope !== 'global' && scope !== 'weekly') throw new BadRequestException('scope debe ser global o weekly');
    const rows = await this.leaderboard.top(scope, limit);
    // R-04: caché de lectura (TTL 10s) — el detalle de las top N pets es global y cambia solo
    // tras batallas; múltiples lecturas en ese intervalo sirven desde Redis.
    const cacheKey = `lb:details:${scope}:${limit}`;
    const pets = await this.cache.getOrSet(cacheKey, 10, () =>
      this.prisma.pet.findMany({
        where: { id: { in: rows.map((r) => r.petId) } },
        include: { species: true, user: { select: { displayName: true } } },
      }),
    );
    const byId = new Map(pets.map((p) => [p.id, p]));
    const entries = rows.flatMap((r) => {
      const p = byId.get(r.petId);
      if (!p) return [];
      return [{
        rank: r.rank,
        petId: p.id,
        name: p.nickname,
        owner: p.user.displayName,
        speciesId: p.speciesId,
        level: p.level,
        elo: p.elo,
        league: leagueFor(p.elo, this.cfg.leagues).id,
        score: r.score,
        mine: p.userId === userId,
      }];
    });

    let me: { rank: number; score: number } | null = null;
    if (petId) {
      const own = await this.prisma.pet.findFirst({ where: { id: petId, userId }, select: { id: true } });
      if (own) me = await this.leaderboard.rankOf(scope, petId);
    }
    return { scope, entries, me };
  }

  leagues() {
    const c = this.cfg;
    return { leagues: c.leagues, dailyFreeBattles: c.dailyFreeBattles, energyCost: c.energyCostPerBattle, minLevel: c.minLevel, rewards: c.rewards };
  }
}
