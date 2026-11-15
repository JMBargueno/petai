import { TournamentService } from './tournament.service';

/**
 * TournamentService.resolveRound — unidad.
 *
 * F-05 (estadísticas reales): cada partida del front se combate con las estadísticas REALES de
 * las mascotas vía `battlesService.fighterFromPet` (antes, stats fijas hacían que el resultado
 * no dependiera de la mascota).
 */
describe('TournamentService.resolveRound (F-05: usa stats reales)', () => {
  it('combate cada match del front con fighterFromPet (no stats fijas)', async () => {
    const prisma: any = {
      tournament: { findFirst: jest.fn().mockResolvedValue({ id: 't', status: 'active' }) },
      tournamentMatch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', round: 1, slot: 0, petAId: 'pa', petBId: 'pb' },
        ]),
      },
      pet: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'pa', species: { element: 'fire', name: 'A' } },
          { id: 'pb', species: { element: 'water', name: 'B' } },
        ]),
      },
    };
    const battlesService: any = { fighterFromPet: jest.fn().mockReturnValue({ petId: 'x' }) };
    const bracketService: any = {
      resolveMatch: jest.fn().mockResolvedValue({ winnerPetId: 'pa' }),
      advanceWinner: jest.fn().mockResolvedValue(undefined),
    };
    const gameData: any = { getBalance: () => ({}) };
    // constructor: (prisma, gameData, petsService, bracketService, wallet, cronLock, cache, battlesService)
    const svc = new TournamentService(
      prisma,
      gameData,
      {} as any,
      bracketService,
      {} as any,
      {} as any,
      {} as any,
      battlesService,
    );

    await svc.resolveRound();

    expect(battlesService.fighterFromPet).toHaveBeenCalledTimes(2);
    const fighterIds = battlesService.fighterFromPet.mock.calls.map((c: any) => c[0].id).sort();
    expect(fighterIds).toEqual(['pa', 'pb']); // las mascotas reales del match
    expect(bracketService.resolveMatch).toHaveBeenCalledTimes(1);
    expect(bracketService.advanceWinner).toHaveBeenCalledTimes(1);
  });
});
