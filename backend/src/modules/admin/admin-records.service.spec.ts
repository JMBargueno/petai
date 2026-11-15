import { BadRequestException } from '@nestjs/common';
import { AdminRecordsService } from './admin-records.service';

function build() {
  const prismaMock: any = {
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
  it('el registro resuelve correos y deja null si la cuenta ya no existe', async () => {
    const { service } = build();
    const res = await service.listAudit({});
    expect(res.items.map((i) => i.userEmail)).toEqual(['ana@x.dev', null]);
  });

  it('aplica filtros y paginación', async () => {
    const { service, prismaMock } = build();
    const res = await service.listAudit({ page: '2', pageSize: '10', event: 'login' });
    expect(res).toMatchObject({ page: 2, pageSize: 10, total: 2 });
    expect(prismaMock.auditLog.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10, where: { event: 'login' } });
  });

  it('valida la consulta', async () => {
    const { service } = build();
    await expect(service.listAudit({ userId: 'no-uuid' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listAudit({ pageSize: '1000' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
