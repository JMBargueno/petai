import { BadRequestException } from '@nestjs/common';
import { AdminRecordsService } from './admin-records.service';

function build() {
  const prismaMock: any = {
    pet: {
      findMany: jest.fn(async () => [{ id: 'p1', nickname: 'Chispa', speciesId: 'ignisaur', rarity: 'rare', level: 3, stage: 'baby', shiny: false, sick: false, createdAt: new Date(), user: { email: 'ana@x.dev' } }]),
      count: jest.fn(async () => 1),
    },
    auditLog: {
      findMany: jest.fn(async () => [
        { id: 'a1', userId: 'u1', event: 'login', ip: null, metadata: null, createdAt: new Date() },
        { id: 'a2', userId: 'gone', event: 'account_deleted', ip: null, metadata: null, createdAt: new Date() },
      ]),
      count: jest.fn(async () => 2),
    },
    user: { findMany: jest.fn(async () => [{ id: 'u1', email: 'ana@x.dev' }]) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return { service: new AdminRecordsService(prismaMock), prismaMock };
}

describe('AdminRecordsService', () => {
  it('lista mascotas con el correo del dueño y aplica filtros y paginación', async () => {
    const { service, prismaMock } = build();
    const res = await service.listPets({ page: '2', pageSize: '10', q: 'chis', rarity: 'rare' });
    expect(res).toMatchObject({ total: 1, page: 2, pageSize: 10 });
    expect(res.items[0]).toMatchObject({ nickname: 'Chispa', owner: 'ana@x.dev' });
    expect(res.items[0]).not.toHaveProperty('user');
    const q = prismaMock.pet.findMany.mock.calls[0][0];
    expect(q).toMatchObject({ skip: 10, take: 10, where: { rarity: 'rare' } });
    expect(q.where.OR).toHaveLength(2);
  });

  it('el registro resuelve correos y deja null si la cuenta ya no existe', async () => {
    const { service } = build();
    const res = await service.listAudit({});
    expect(res.items.map((i) => i.userEmail)).toEqual(['ana@x.dev', null]);
  });

  it('valida la consulta', async () => {
    const { service } = build();
    await expect(service.listAudit({ userId: 'no-uuid' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listPets({ pageSize: '1000' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
