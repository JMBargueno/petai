import * as fs from 'fs';
import * as path from 'path';
import { MindService } from './mind.service';
import { neutralDims } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const NOW = new Date('2026-11-18T12:00:00Z');

/**
 * Prisma de pega con una sola mascota. `$transaction` ejecuta el callback con un `tx` que anota
 * el orden de las operaciones, para comprobar que la fila se bloquea antes de leerla.
 */
function setup(personality: any) {
  const row = { id: 'pet-1', speciesId: 'ignisaur', visualSeed: 7, personality };
  const ops: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async (sql: any) => {
      ops.push(`raw:${sql.strings.join('?')}`);
      return [{ id: row.id }];
    }),
    pet: {
      findUnique: jest.fn(async () => {
        ops.push('read');
        return { ...row };
      }),
      update: jest.fn(async ({ data }: any) => {
        ops.push('write');
        row.personality = data.personality;
        return row;
      }),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  const gameData = { getBalance: () => balance, getSpecies: () => [{ id: 'ignisaur' }] };
  const svc = new MindService(prisma as any, gameData as any);
  return { svc, row, ops, tx, prisma };
}

describe('MindService (spec 37 §1.1): escrituras en Pet.personality', () => {
  it('applyExperience bloquea la fila antes de leerla', async () => {
    const s = setup({ dims: neutralDims() });
    await s.svc.applyExperience('pet-1', ['fed'], NOW);
    expect(s.ops[0]).toContain('FOR UPDATE');
    expect(s.ops[0]).toContain('"Pet"');
    expect(s.ops.indexOf('read')).toBeGreaterThan(0);
  });

  it('patchStored bloquea la fila antes de leerla', async () => {
    const s = setup({ dims: neutralDims() });
    await s.svc.patchStored('pet-1', { lastNeglectDay: '2026-11-18' } as any);
    expect(s.ops[0]).toContain('FOR UPDATE');
    expect(s.row.personality.lastNeglectDay).toBe('2026-11-18');
  });

  it('aplica la deriva y un parche adicional en una sola escritura', async () => {
    const s = setup({ dims: neutralDims(), genes: [{ type: 'veloz' }] });
    await s.svc.applyExperience('pet-1', ['fed'], NOW, { autonomy: { day: '2026-11-18' }, lastNeglectDay: '2026-11-18' } as any);
    expect(s.tx.pet.update).toHaveBeenCalledTimes(1);
    expect(s.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(s.row.personality.autonomy).toEqual({ day: '2026-11-18' });
    expect(s.row.personality.lastNeglectDay).toBe('2026-11-18');
    // Fusiona: no pierde claves ajenas ni las derivadas
    expect(s.row.personality.genes).toEqual([{ type: 'veloz' }]);
    expect(s.row.personality.trait).toBeDefined();
    expect(s.row.personality.dims.affection).toBeGreaterThan(50);
  });

  it('con parche y sin eventos guarda el parche; sin nada no abre transacción', async () => {
    const s = setup({ dims: neutralDims() });
    await s.svc.applyExperience('pet-1', [], NOW, { lastNeglectDay: 'x' } as any);
    expect(s.row.personality.lastNeglectDay).toBe('x');
    const empty = setup({ dims: neutralDims() });
    expect(await empty.svc.applyExperience('pet-1', [], NOW)).toBeNull();
    expect(empty.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('N experiencias seguidas suman lo mismo que aplicarlas de una vez', async () => {
    const serial = setup({ dims: neutralDims() });
    for (let i = 0; i < 5; i++) await serial.svc.applyExperience('pet-1', ['chat'], NOW);
    const batch = setup({ dims: neutralDims() });
    await batch.svc.applyExperience('pet-1', ['chat', 'chat', 'chat', 'chat', 'chat'], NOW);
    expect(serial.row.personality.dims).toEqual(batch.row.personality.dims);
  });
});
