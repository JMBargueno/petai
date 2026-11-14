import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CronLockService } from '../../redis/cron-lock.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { BattlesService } from '../battles/battles.service';
import { simulateBattle } from '../battles/combat/engine';
import { hashSeed } from '../battles/combat/rng';
import { Fighter, Element, SkillDef } from '../battles/combat/types';

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface RaidBalance {
  hpGlobal: number; maxDamagePerAttack: number; energyCost: number;
  maxAttacksPer24h: number; totalGems: number; minParticipationPct: number; statMultiplier: number;
}

@Injectable()
export class RaidService {
  private readonly logger = new Logger(RaidService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    private readonly battlesService: BattlesService,
    private readonly cronLock: CronLockService,
  ) {}

  private get cfg(): RaidBalance {
    const b = this.gameData.getBalance();
    return {
      hpGlobal: b.raids?.hpGlobal ?? 10_000_000,
      maxDamagePerAttack: b.raids?.maxDamagePerAttack ?? 50_000,
      energyCost: b.raids?.energyCost ?? 15,
      maxAttacksPer24h: b.raids?.maxAttacksPer24h ?? 10,
      totalGems: b.raids?.totalGems ?? 5000,
      minParticipationPct: b.raids?.minParticipationPct ?? 0.001,
      statMultiplier: b.raids?.statMultiplier ?? 3,
    };
  }

  async getCurrent(userId: string) {
    const raid = await this.getActiveRaid();
    const userContrib = await this.prisma.raidParticipant.findUnique({
      where: { raidId_userId: { raidId: raid.id, userId } },
    });
    const participantCount = await this.prisma.raidParticipant.count({
      where: { raidId: raid.id, damageDealt: { gt: 0 } },
    });
    return {
      id: raid.id, theme: raid.theme, element: raid.element, level: raid.level,
      hpGlobal: raid.hpGlobal, hpRemaining: raid.hpRemaining,
      hpPercent: Math.round((raid.hpRemaining / raid.hpGlobal) * 10000) / 100,
      status: raid.status, startedAt: raid.startedAt, endsAt: raid.endsAt, participantCount,
      myContribution: userContrib
        ? { damageDealt: userContrib.damageDealt, attacks: userContrib.totalAttacks, percentage: Math.round((userContrib.damageDealt / raid.hpGlobal) * 10000) / 100 }
        : null,
    };
  }

  async attack(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    const raid = await this.getActiveRaid();
    if (raid.status !== 'active') throw new ConflictException('El boss ya fue derrotado');
    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');
    if (pet.energy < this.cfg.energyCost) throw new BadRequestException('La mascota está demasiado cansada');
    const recentBattles = await this.battlesService.battlesInLastDay(userId);
    if (recentBattles >= this.cfg.maxAttacksPer24h) throw new BadRequestException('Límite de combates diario alcanzado');
    const petFighter = this.battlesService.fighterFromPet(pet);
    const bossFighter = this.buildBossFighter(raid);
    const seed = hashSeed(`${raid.id}:${petId}:${Date.now().toString(36)}`);
    const result = simulateBattle(petFighter, bossFighter, seed, this.combatConfig());
    const bossMaxHp = result.log.participants[1].maxHp;
    const bossFinalHp = result.finalHp[1];
    const rawDamage = Math.max(0, bossMaxHp - bossFinalHp);
    const damage = Math.min(rawDamage, this.cfg.maxDamagePerAttack);
    const claimed = await this.prisma.raid.updateMany({
      where: { id: raid.id, status: 'active', hpRemaining: { gte: damage } },
      data: { hpRemaining: { decrement: damage } },
    });
    if (claimed.count === 0) {
      const updated = await this.prisma.raid.findUnique({ where: { id: raid.id } });
      if (!updated || updated.status !== 'active') throw new ConflictException('Boss derrotado');
      throw new ConflictException('Error al aplicar daño');
    }
    await this.prisma.pet.update({ where: { id: petId }, data: { energy: Math.max(0, pet.energy - this.cfg.energyCost) } });
    const existing = await this.prisma.raidParticipant.findUnique({
      where: { raidId_userId: { raidId: raid.id, userId } },
    });
    if (existing) {
      await this.prisma.raidParticipant.update({
        where: { id: existing.id },
        data: { damageDealt: { increment: damage }, totalAttacks: { increment: 1 }, lastAttackAt: new Date(), petId },
      });
    } else {
      await this.prisma.raidParticipant.create({
        data: { raidId: raid.id, userId, petId, damageDealt: damage, totalAttacks: 1, lastAttackAt: new Date() },
      });
    }
    const newHp = await this.prisma.raid.findUnique({ where: { id: raid.id }, select: { hpRemaining: true, status: true } });
    let settled = false;
    if (newHp.hpRemaining <= 0 && newHp.status === 'active') {
      await this.settle(raid.id);
      settled = true;
    }
    return {
      damage, seed, rounds: result.rounds,
      result: result.winner === 0 ? 'pet won' : result.winner === 1 ? 'boss won' : 'draw',
      hpRemaining: Math.max(0, newHp.hpRemaining),
      hpPercent: Math.round((Math.max(0, newHp.hpRemaining) / raid.hpGlobal) * 10000) / 100,
      settled, replay: result.log,
    };
  }

  async leaderboard(userId: string, limit: number) {
    const take = Math.min(Math.max(1, Math.floor(limit) || 100), 100);
    const raid = await this.getActiveRaid();
    const participants = await this.prisma.raidParticipant.findMany({
      where: { raidId: raid.id, damageDealt: { gt: 0 } },
      orderBy: { damageDealt: 'desc' }, take,
      include: {
        pet: { select: { id: true, nickname: true, level: true, rarity: true, species: { select: { element: true, name: true } } } },
        user: { select: { displayName: true, id: true } },
      },
    });
    const totalDamage = participants.reduce((s, p) => s + p.damageDealt, 0);
    return {
      raidId: raid.id, totalDamage, hpRemaining: raid.hpRemaining,
      entries: participants.map((p, i) => ({
        rank: i + 1, userId: p.userId, displayName: p.user.displayName || 'Anónimo',
        petId: p.petId, petName: p.pet?.nickname || p.pet?.species?.name || 'Pet',
        petLevel: p.pet?.level, petElement: p.pet?.species?.element,
        damageDealt: p.damageDealt,
        percentage: totalDamage > 0 ? Math.round((p.damageDealt / totalDamage) * 10000) / 100 : 0,
        attacks: p.totalAttacks, mine: p.userId === userId,
      })),
    };
  }

  async history(userId: string, limit: number) {
    const take = Math.min(Math.max(1, Math.floor(limit) || 10), 50);
    const raids = await this.prisma.raid.findMany({ where: { status: 'settled' }, orderBy: { endedAt: 'desc' }, take });
    return raids.map((r) => ({ id: r.id, theme: r.theme, element: r.element, hpGlobal: r.hpGlobal, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status }));
  }

  private async getActiveRaid() {
    let raid = await this.prisma.raid.findFirst({ where: { status: 'active' }, orderBy: { startedAt: 'desc' } });
    if (!raid) return this.rotate();
    if (new Date() > raid.endsAt && raid.status === 'active') {
      await this.prisma.raid.update({ where: { id: raid.id }, data: { status: 'expired', endedAt: new Date() } });
      return this.rotate();
    }
    return raid;
  }

  private buildBossFighter(raid: any): Fighter {
    const mult = this.cfg.statMultiplier;
    const element = (raid.element || 'fire') as Element;
    const baseStats = { hp: 5000 * mult, atk: 200 * mult, def: 150 * mult, vel: 100 * mult, esp: 150 * mult };
    const bossSkills: SkillDef[] = [
      { id: `boss_${element}_smite`, name: `Smite of ${element}`, element, kind: 'attack', power: 80, accuracy: 95, cooldown: 2, unlockLevel: 1 },
      { id: `boss_${element}_fury`, name: `Fury of ${element}`, element, kind: 'attack', power: 120, accuracy: 80, cooldown: 4, unlockLevel: 1 },
      { id: `boss_${element}_guard`, name: 'Guardian Shell', element: 'neutral', kind: 'guard', power: 0, accuracy: 100, cooldown: 3, unlockLevel: 1 },
      { id: `boss_${element}_heal`, name: 'Elemental Regen', element, kind: 'heal', power: 0, accuracy: 100, cooldown: 5, unlockLevel: 1, healPct: 0.15 },
    ];
    return { name: raid.theme, speciesId: `raid_boss_${element}`, element, level: raid.level ?? 50, stats: baseStats, mood: 1.0, skills: bossSkills, strategy: 'aggressive', isBot: true };
  }

  private combatConfig() {
    const b = this.gameData.getBalance();
    return {
      maxRounds: 30, hpMultiplier: b.combats?.hpMultiplier ?? 1.0, damageScale: b.combats?.damageScale ?? 1.0,
      critChance: b.combats?.critChance ?? 0.1, critMultiplier: b.combats?.critMultiplier ?? 1.5,
      elementAdvantage: b.combats?.elementAdvantage ?? 1.5, elementDisadvantage: b.combats?.elementDisadvantage ?? 0.75,
      burnPctPerTurn: b.combats?.burnPctPerTurn ?? 0.02, guardDefMultiplier: b.combats?.guardDefMultiplier ?? 1.5,
      mood: { minMultiplier: b.combats?.mood?.minMultiplier ?? 0.8, sickMultiplier: b.combats?.mood?.sickMultiplier ?? 0.9 },
    };
  }

  private async settle(raidId: string) {
    const raid = await this.prisma.raid.findUnique({ where: { id: raidId } });
    if (!raid || raid.status === 'settled') return;
    const participants = await this.prisma.raidParticipant.findMany({ where: { raidId, damageDealt: { gt: 0 } } });
    if (participants.length === 0) return;
    const totalDamage = participants.reduce((s, p) => s + p.damageDealt, 0);
    const totalGems = this.cfg.totalGems;
    const payouts = participants.map((p) => ({ userId: p.userId, gems: Math.max(Math.floor(totalGems * (p.damageDealt / totalDamage)), 1) }));
    const cap = Math.floor(totalGems * 0.5);
    const final = payouts.map((p) => ({ ...p, gems: Math.min(p.gems, cap) }));
    // S-14 (SDD §3.3): liquidación atómica — el reclamo por estado y el reparto viven en UNA tx.
    // El guard `status: { not: 'settled' }` deja un único `count === 1`: dos réplicas no reparten 2x.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.raid.updateMany({
        where: { id: raidId, status: { not: 'settled' } },
        data: { status: 'settled', settledAt: new Date(), endedAt: new Date(), hpRemaining: 0 },
      });
      if (claimed.count === 0) return;
      for (const p of final) {
        await tx.user.update({ where: { id: p.userId }, data: { gems: { increment: p.gems } } });
      }
    });
    this.logger.log(`Raid ${raidId} settled: ${final.length} participants`);
  }

  private async rotate() {
    const elements: Element[] = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
    const now = new Date();
    const weekIndex = Math.floor(now.getTime() / WEEK_MS);
    const element = elements[weekIndex % elements.length];
    const themes: Record<string, string> = { fire: 'Inferno Dragon', water: 'Abyssal Leviathan', plant: 'Elder Treant', electric: 'Storm Titan', shadow: 'Umbral Wraith', light: 'Radiant Seraph' };
    const raid = await this.prisma.raid.create({
      data: { element, theme: themes[element], level: 50 + (weekIndex % 20) * 5, hpGlobal: this.cfg.hpGlobal, hpRemaining: this.cfg.hpGlobal, status: 'active', startedAt: now, endsAt: new Date(now.getTime() + DAY_MS) },
    });
    this.logger.log(`New raid ${raid.id}: ${element} — ${raid.theme}`);
    return raid;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronCheck() {
    // C-02 (SDD §3.3): solo una réplica ejecuta el ciclo por ventana (TTL < intervalo).
    const token = await this.cronLock.guard('raid:check', 55_000);
    if (!token) return;
    try {
      const killed = await this.prisma.raid.findMany({ where: { status: 'active', hpRemaining: { lte: 0 } } });
      for (const r of killed) await this.settle(r.id);
      const expired = await this.prisma.raid.findMany({ where: { status: 'active', endsAt: { lte: new Date() } } });
      for (const r of expired) await this.prisma.raid.update({ where: { id: r.id }, data: { status: 'expired', endedAt: new Date() } });
    } catch (err) {
      this.logger.error(`Raid cron error: ${(err as Error).message}`);
    } finally {
      await this.cronLock.release('raid:check', token);
    }
  }
}