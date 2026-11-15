import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { GameDataService } from '../game-data/game-data.service';
import { leagueFor, League } from '../battles/combat/ranking';

interface LeagueSettleReward {
  gems: number;
  coins: number;
  title: string;
}

/**
 * Premios de fin de temporada de la ARENA por liga/ELO (spec-11 leagueSettle, "pendiente desde la
 * Fase 4"). Al cerrar una temporada, para cada usuario con al menos un pet se calcula la liga de su
 * mejor pet (máximo ELO) usando `balance.combats.leagues` y se entrega el reward de esa liga
 * (gemas/monedas vía WalletService + un título). Idempotente por (usuario, temporada): un solo
 * registro `SeasonLeagueSettlement` impide repartir dos veces.
 */
@Injectable()
export class ArenaSettleService {
  private readonly logger = new Logger(ArenaSettleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly gameData: GameDataService,
  ) {}

  async settleSeason(seasonId: string): Promise<{ settled: number }> {
    const balance = this.gameData.getBalance();
    const leagues = (balance?.combats?.leagues ?? []) as League[];
    const settle = (balance?.combats?.leagueSettle ?? {}) as Record<string, Partial<LeagueSettleReward>>;
    if (leagues.length === 0) return { settled: 0 };

    const users = await this.prisma.user.findMany({
      where: { pets: { some: {} } },
      select: { id: true },
    });

    let settled = 0;
    for (const { id: userId } of users) {
      const did = await this.settleUser(userId, seasonId, leagues, settle);
      if (did) settled++;
    }

    this.logger.log(`Arena settle ${seasonId}: ${settled} jugadores recompensados por liga`);
    return { settled };
  }

  private async settleUser(
    userId: string,
    seasonId: string,
    leagues: League[],
    settle: Record<string, Partial<LeagueSettleReward>>,
  ): Promise<boolean> {
    // Idempotencia: ya liquidado para esta temporada → no repartir de nuevo.
    const existing = await this.prisma.seasonLeagueSettlement.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    if (existing) return false;

    // Mejor pet por ELO (la liga competitiva del jugador).
    const best = await this.prisma.pet.findFirst({
      where: { userId },
      orderBy: { elo: 'desc' },
      select: { elo: true },
    });
    if (!best) return false;

    const league = leagueFor(best.elo, leagues);
    const r = settle[league.id];
    const gems = Math.max(0, Math.floor(r?.gems ?? 0));
    const coins = Math.max(0, Math.floor(r?.coins ?? 0));
    const title = r?.title ?? league.name;

    // Un solo uso atómico: premios (WalletService) + título + registro de liquidación.
    await this.prisma.$transaction(async (tx) => {
      if (gems > 0) await this.wallet.credit(tx, userId, 'gems', gems);
      if (coins > 0) await this.wallet.credit(tx, userId, 'coins', coins);
      await tx.user.update({ where: { id: userId }, data: { title } });
      await tx.seasonLeagueSettlement.create({
        data: {
          userId,
          seasonId,
          leagueId: league.id,
          title,
          gemsAwarded: gems,
          coinsAwarded: coins,
          bestElo: best.elo,
        },
      });
    });
    return true;
  }

  /** Resultado del settle de arena para un usuario en una temporada (o null si no hay). */
  async getResult(userId: string, seasonId: string) {
    return this.prisma.seasonLeagueSettlement.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
  }
}
