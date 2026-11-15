import { BracketService } from './bracket.service';

/**
 * BracketService — unidad.
 *
 * F-05 (emparejamiento): el bracket es determinista y los byes no bloquean el avance.
 *   - `buildBracket`: 63 partidas en 6 rondas; con <64 inscritos cada pet queda en su propia
 *     hoja r1 (el resto, byes) y las rondas 2-6 quedan vacías hasta que avanza el ganador.
 *   - `advanceWinner`: el ganador de (round, slot) rellena `floor(slot/2)` de `round+1` como
 *     petA si `slot` es par y petB si es impar; no avanza desde la final.
 */
describe('BracketService (F-05: emparejamiento y avance)', () => {
  function make(prisma: any, balance: any = {}) {
    return new BracketService(prisma, { getBalance: () => balance } as any);
  }

  describe('buildBracket', () => {
    it('crea un bracket de 63 partidas en 6 rondas', async () => {
      const prisma: any = { tournamentMatch: { createMany: jest.fn().mockResolvedValue({ count: 63 }) } };
      const res = await make(prisma).buildBracket('t1', ['p1']);
      expect(res.totalMatches).toBe(63);
      expect(res.totalRounds).toBe(6);
      const data = prisma.tournamentMatch.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(63);
      const byRound = (r: number) => data.filter((m: any) => m.round === r).length;
      expect(byRound(1)).toBe(32);
      expect(byRound(2)).toBe(16);
      expect(byRound(3)).toBe(8);
      expect(byRound(4)).toBe(4);
      expect(byRound(5)).toBe(2);
      expect(byRound(6)).toBe(1); // la final
    });

    it('con <64 inscritos cada pet queda en su propia hoja r1 (bye) y no hay dos en la misma', async () => {
      const prisma: any = { tournamentMatch: { createMany: jest.fn().mockResolvedValue({}) } };
      await make(prisma).buildBracket('t1', ['p1', 'p2', 'p3']);
      const data = prisma.tournamentMatch.createMany.mock.calls[0][0].data;
      const r1 = data.filter((m: any) => m.round === 1);
      const withPet = r1.filter((m: any) => m.petAId || m.petBId);
      expect(withPet).toHaveLength(3); // una hoja por inscrito
      for (const m of withPet) {
        // el otro lado de cada match de pet es un bye (null)
        expect(Boolean(m.petAId) !== Boolean(m.petBId)).toBe(true);
      }
      // los 3 pets están en 3 hojas distintas (ningún pet se repite)
      const pets = r1.flatMap((m: any) => [m.petAId, m.petBId]).filter(Boolean);
      expect(new Set(pets).size).toBe(3);
    });
  });

  describe('advanceWinner', () => {
    it('rellena floor(slot/2) de la siguiente ronda: petA si slot par, petB si impar', async () => {
      const prisma: any = { tournamentMatch: { update: jest.fn().mockResolvedValue({}) } };
      await make(prisma).advanceWinner('t1', 1, 4, 'WIN'); // 4 par → (2,2).petA
      expect(prisma.tournamentMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId_round_slot: { tournamentId: 't1', round: 2, slot: 2 } },
          data: { petAId: 'WIN' },
        }),
      );
      await make(prisma).advanceWinner('t1', 1, 5, 'WIN'); // 5 impar → (2,2).petB
      expect(prisma.tournamentMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tournamentId_round_slot: { tournamentId: 't1', round: 2, slot: 2 } },
          data: { petBId: 'WIN' },
        }),
      );
    });

    it('no avanza desde la final (round 6)', async () => {
      const prisma: any = { tournamentMatch: { update: jest.fn() } };
      await make(prisma).advanceWinner('t1', 6, 0, 'WIN');
      expect(prisma.tournamentMatch.update).not.toHaveBeenCalled();
    });
  });
});
