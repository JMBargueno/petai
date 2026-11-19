import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { PetsService } from '../pets/pets.service';
import { BattlesService } from '../battles/battles.service';
import { BracketService } from './bracket.service';
import { WalletService } from '../wallet/wallet.service';
import { CronLockService } from '../../redis/cron-lock.service';
import { RedisCacheService } from '../../redis/redis-cache.service';

const BRACKET_SIZE = 64;
const DIAMOND_ELO = 1700;
const ENTRY_FEE = 50;
const TOTAL_PRIZE = 3000;
// R-04: vida de la caché de lecturas calientes (5–30 s) para `getCurrent`.
const CURRENT_TTL_SECONDS = 10;

@Injectable()
export class TournamentService {
  private readonly logger = new Logger(TournamentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly petsService: PetsService,
    private readonly bracketService: BracketService,
    private readonly wallet: WalletService,
    private readonly cronLock: CronLockService,
    private readonly cache: RedisCacheService,
    private readonly battlesService: BattlesService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  async getCurrent(userId: string) {
    // R-04: datos que cambian poco → caché de vida corta para no hacer 2-4 consultas por llamada.
    return this.cache.getOrSet(`tournament:current:${userId}`, CURRENT_TTL_SECONDS, () => this.getCurrentComputed(userId));
  }

  private async getCurrentComputed(userId: string) {
    let tournament = await this.prisma.tournament.findFirst({
      where: { status: { in: ['entry', 'bracket', 'active'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!tournament) tournament = await this.createTournament();
    const entryCount = await this.prisma.tournamentEntry.count({ where: { tournamentId: tournament.id } });
    const userEntry = await this.prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });
    return {
      id: tournament.id, status: tournament.status, entryFee: tournament.entryFee,
      totalPrizePool: tournament.totalPrizePool, entryDeadline: tournament.entryDeadline,
      startedAt: tournament.startedAt, endsAt: tournament.endsAt, entryCount,
      bracketSize: BRACKET_SIZE, hasEntered: !!userEntry, myPlacement: userEntry?.placement ?? null,
    };
  }

  async enter(userId: string, petId: string) {
    if (!petId || typeof petId !== 'string') throw new BadRequestException('petId es obligatorio');
    const tournament = await this.prisma.tournament.findFirst({ where: { status: 'entry' }, orderBy: { createdAt: 'desc' } });
    if (!tournament) throw new ConflictException('No hay torneo abierto para inscripción');
    if (new Date() > tournament.entryDeadline) throw new ConflictException('La inscripción ha cerrado');
    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.elo < DIAMOND_ELO) throw new BadRequestException(`Se requiere ELO ≥${DIAMOND_ELO} (liga Diamond)`);
    const existing = await this.prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });
    if (existing) throw new ConflictException('Ya estás inscrito en este torneo');
    // S-05 (SDD §3.3): cobro atómico race-safe (C-01); si no hay saldo no se crea la inscripción.
    await this.prisma.$transaction(async (tx) => {
      const { ok } = await this.wallet.debit(tx, userId, 'gems', ENTRY_FEE);
      if (!ok) throw new BadRequestException('Gemas insuficientes para la cuota');
      await tx.tournamentEntry.create({ data: { tournamentId: tournament.id, userId, petId, elo: pet.elo } });
    });
    this.logger.log(`User ${userId} entered tournament ${tournament.id}`);
    return { tournamentId: tournament.id, petId, elo: pet.elo, feePaid: ENTRY_FEE };
  }

  async getBracket() {
    const tournament = await this.prisma.tournament.findFirst({
      where: { status: { in: ['bracket', 'active', 'finished'] } }, orderBy: { createdAt: 'desc' },
    });
    if (!tournament) throw new NotFoundException('No hay torneo activo');
    return this.bracketService.getBracketView(tournament.id);
  }

  async standings(userId: string, limit?: number, offset?: number) {
    const tournament = await this.prisma.tournament.findFirst({
      where: { status: { in: ['bracket', 'active', 'finished'] } }, orderBy: { createdAt: 'desc' },
    });
    if (!tournament) return { tournamentId: null, status: null, total: 0, limit: 0, offset: 0, entries: [], me: null };

    // R-04: paginación (skip/take) para no cargar todas las inscripciones con su mascota a la vez.
    const cfg = this.gameData.getBalance().publicApi?.standings ?? {};
    const pageLimit = Math.min(Math.max(1, Math.floor(limit) || (cfg.defaultLimit ?? 50)), Math.max(1, cfg.maxLimit ?? 200));
    const pageOffset = Math.max(0, Math.floor(offset) || 0);

    const total = await this.prisma.tournamentEntry.count({ where: { tournamentId: tournament.id } });
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { elo: 'desc' },
      skip: pageOffset,
      take: pageLimit,
      include: { pet: { select: { id: true, nickname: true, elo: true, level: true, species: { select: { element: true, name: true } } } } },
    });
    const me = await this.prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });
    const meRank = me
      ? 1 + (await this.prisma.tournamentEntry.count({ where: { tournamentId: tournament.id, elo: { gt: me.elo } } }))
      : 0;
    return {
      tournamentId: tournament.id, status: tournament.status, total, limit: pageLimit, offset: pageOffset,
      entries: entries.map((e, i) => ({
        rank: pageOffset + i + 1, userId: e.userId, petId: e.petId,
        petName: e.pet?.nickname || 'Pet', elo: e.elo, placement: e.placement, mine: e.userId === userId,
      })),
      me: me ? { rank: meRank, placement: me.placement } : null,
    };
  }

  private async createTournament() {
    const now = new Date();
    const tournament = await this.prisma.tournament.create({
      data: {
        status: 'entry', entryFee: ENTRY_FEE, totalPrizePool: TOTAL_PRIZE,
        entryDeadline: new Date(now.getTime() + 2 * 24 * 3600 * 1000),
        endsAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
      },
    });
    this.logger.log(`Tournament ${tournament.id} created`);
    return tournament;
  }

  async seed() {
    const tournament = await this.prisma.tournament.findFirst({
      where: { status: 'entry', entryDeadline: { lte: new Date() } }, orderBy: { createdAt: 'desc' },
    });
    if (!tournament) return;
    await this.prisma.tournament.update({ where: { id: tournament.id }, data: { status: 'bracket', startedAt: new Date() } });
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { tournamentId: tournament.id }, orderBy: { elo: 'desc' }, take: BRACKET_SIZE,
    });
    const petIds = entries.map((e) => e.petId);
    await this.bracketService.buildBracket(tournament.id, petIds);
    this.logger.log(`Tournament ${tournament.id} seeded with ${entries.length} entries`);
  }

  async resolveRound() {
    const tournament = await this.prisma.tournament.findFirst({ where: { status: 'bracket' }, orderBy: { createdAt: 'desc' } });
    if (!tournament) return;
    const pending = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId: tournament.id, status: 'pending' },
      orderBy: [{ round: 'asc' }, { slot: 'asc' }],
    });
    if (pending.length === 0) {
      const allResolved = await this.prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, status: 'resolved' } });
      const total = await this.prisma.tournamentMatch.count({ where: { tournamentId: tournament.id } });
      if (allResolved === total) await this.payOut(tournament.id);
      return;
    }
    // Avanza un front por llamada (la ronda más baja pendiente). Las partidas vacías/bye no
    // bloquean el front, así el campeón llega siempre a la final y el torneo termina (F-05).
    const minRound = pending[0].round;
    const frontier = pending.filter((m) => m.round === minRound);
    const petIds = Array.from(new Set(frontier.flatMap((m) => [m.petAId, m.petBId]).filter((x): x is string => !!x)));
    const pets = petIds.length
      ? await this.prisma.pet.findMany({ where: { id: { in: petIds } }, include: { species: true } })
      : [];
    const petById = new Map(pets.map((p) => [p.id, p]));
    // Bonus de ánimo del hábitat (spec 10) de todo el frente con una sola consulta
    const moodBonuses = await this.battlesService.combatMoodBonuses(pets.map((p) => p.id));
    // …y los buffs de comida de la Cocina (spec 15)
    const statBuffs = await this.battlesService.combatStatBuffs(pets.map((p) => p.id));

    for (const match of frontier) {
      const a = match.petAId, b = match.petBId;
      if (a && b) {
        const petA = petById.get(a), petB = petById.get(b);
        if (!petA || !petB) continue;
        const fighterA = this.battlesService.fighterFromPet(petA, moodBonuses.get(petA.id) ?? 0, statBuffs.get(petA.id));
        const fighterB = this.battlesService.fighterFromPet(petB, moodBonuses.get(petB.id) ?? 0, statBuffs.get(petB.id));
        const { winnerPetId } = await this.bracketService.resolveMatch(tournament.id, match.id, fighterA, fighterB);
        for (const p of [petA, petB]) {
          this.realtime?.emitPetAction(p.userId, p.id, p.id === winnerPetId ? 'tournament_win' : 'tournament_loss', { round: match.round });
        }
        await this.bracketService.advanceWinner(tournament.id, match.round, match.slot, winnerPetId);
      } else if (a || b) {
        const winnerPetId = a ?? b!;
        await this.bracketService.markBye(match.id, winnerPetId);
        await this.bracketService.advanceWinner(tournament.id, match.round, match.slot, winnerPetId);
      } else {
        await this.bracketService.markVoid(match.id);
      }
    }
  }

  private async payOut(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.status === 'finished') return;
    const final = await this.prisma.tournamentMatch.findFirst({ where: { tournamentId, round: 6, status: 'resolved' } });
    if (!final) return;
    // S-14 (SDD §3.3): pago atómico — reclamo por estado + premio del ganador en UNA tx.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tournament.updateMany({
        where: { id: tournamentId, status: { not: 'finished' } },
        data: { status: 'finished', endedAt: new Date() },
      });
      if (claimed.count === 0) return;
      if (final.winnerId) {
        const winnerEntry = await tx.tournamentEntry.findFirst({ where: { tournamentId, petId: final.winnerId } });
        if (winnerEntry) {
          await tx.user.update({ where: { id: winnerEntry.userId }, data: { gems: { increment: 1000 } } });
          await tx.tournamentEntry.update({ where: { id: winnerEntry.id }, data: { placement: 1 } });
        }
      }
    });
    this.logger.log(`Tournament ${tournamentId} finished, prizes distributed`);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    // C-02 (SDD §3.3): solo una réplica resuelve/rotor por ventana.
    const token = await this.cronLock.guard('tournament:resolve', 240_000);
    if (!token) return;
    try {
      await this.seed();
      await this.resolveRound();
    } catch (err) {
      this.logger.error(`Tournament cron error: ${(err as Error).message}`);
    } finally {
      await this.cronLock.release('tournament:resolve', token);
    }
  }
}