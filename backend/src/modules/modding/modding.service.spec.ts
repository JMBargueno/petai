import { ConflictException } from '@nestjs/common';
import { ModdingService } from './modding.service';

function build() {
  const prismaMock = {
    mod: { findUnique: jest.fn(), update: jest.fn() },
    modReport: { findFirst: jest.fn(), create: jest.fn() },
  };
  const service = new ModdingService(prismaMock as never, {} as never, {} as never);
  return { service, prismaMock };
}

describe('ModdingService.report (S-17)', () => {
  it('rechaza el segundo reporte del mismo usuario y no crea nada', async () => {
    const { service, prismaMock } = build();
    prismaMock.mod.findUnique.mockResolvedValue({ id: 'mod-1', status: 'published' });
    prismaMock.modReport.findFirst.mockResolvedValue({ id: 'r1' }); // ya lo reportó
    await expect(service.report('u1', 'mod-1', 'inapropiado')).rejects.toThrow(ConflictException);
    expect(prismaMock.modReport.create).not.toHaveBeenCalled();
    expect(prismaMock.mod.update).not.toHaveBeenCalled();
  });

  it('acepta el primer reporte (findFirst → null)', async () => {
    const { service, prismaMock } = build();
    prismaMock.mod.findUnique.mockResolvedValue({ id: 'mod-1', status: 'published' });
    prismaMock.modReport.findFirst.mockResolvedValue(null);
    prismaMock.modReport.create.mockResolvedValue({ id: 'r1' });
    prismaMock.mod.update.mockResolvedValue({ id: 'mod-1', reportCount: 1, status: 'published' });
    const res = await service.report('u1', 'mod-1', 'inapropiado');
    expect(res.reportId).toBe('r1');
    expect(prismaMock.modReport.create).toHaveBeenCalledTimes(1);
  });
});