import { Test } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * WalletService — unidad.
 *
 * Primitiva económica compartida (C-01 / SDD §3.3): cobro (`debit`) y abono (`credit`)
 * atómicos de `coins`/`gems`. El débito es race-safe: la comprobación de saldo y el
 * decremento son una única `updateMany ... WHERE saldo >= importe`; si no hay saldo,
 * `count` = 0 y devuelve `{ ok: false }` (el llamante revierte su transacción).
 */
describe('WalletService', () => {
  let service: WalletService;
  const prisma: any = {
    user: { updateMany: jest.fn(), update: jest.fn() },
    userStat: { upsert: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(WalletService);
  });

  describe('debit', () => {
    it('deduce de forma atómica si hay saldo suficiente (ok=true)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      const r = await service.debit(prisma, 'u', 'coins', 50);
      expect(r.ok).toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u', coins: { gte: 50 } },
          data: { coins: { decrement: 50 } },
        }),
      );
    });

    it('reporta ok=false cuando no hay saldo (count=0) sin lanzar error', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      const r = await service.debit(prisma, 'u', 'coins', 50);
      expect(r.ok).toBe(false);
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    });

    it('opera sobre gems', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      await service.debit(prisma, 'u', 'gems', 10);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u', gems: { gte: 10 } },
          data: { gems: { decrement: 10 } },
        }),
      );
    });

    it('rechaza importes inválidos (no enteros o <= 0) sin tocar BD', async () => {
      await expect(service.debit(prisma, 'u', 'coins', 0)).rejects.toThrow('inválido');
      await expect(service.debit(prisma, 'u', 'coins', -5)).rejects.toThrow('inválido');
      await expect(service.debit(prisma, 'u', 'coins', 1.5)).rejects.toThrow('inválido');
      await expect(service.debit(prisma, 'u', 'gems', 2.2)).rejects.toThrow('inválido');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('credit', () => {
    it('abona a coins (increment atómico)', async () => {
      prisma.user.update.mockResolvedValue({});
      await service.credit(prisma, 'u', 'coins', 30);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u' },
          data: { coins: { increment: 30 } },
        }),
      );
    });

    it('abona a gems (increment atómico)', async () => {
      prisma.user.update.mockResolvedValue({});
      await service.credit(prisma, 'u', 'gems', 12);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u' },
          data: { gems: { increment: 12 } },
        }),
      );
    });

    it('rechaza importes inválidos (no enteros o <= 0) sin tocar BD', async () => {
      await expect(service.credit(prisma, 'u', 'coins', 0)).rejects.toThrow('inválido');
      await expect(service.credit(prisma, 'u', 'coins', -1)).rejects.toThrow('inválido');
      await expect(service.credit(prisma, 'u', 'coins', 2.2)).rejects.toThrow('inválido');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
