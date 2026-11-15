import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

describe('AdminUsersService.adjustBalance', () => {
  let service: AdminUsersService;
  const actor = { id: 'admin-1' };

  const mockPrisma = {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (arg: any) => arg(mockPrisma));
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'a1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: { logoutAll: jest.fn() } },
      ],
    }).compile();
    service = module.get(AdminUsersService);
  });

  it('fija el saldo y registra la auditoría con el valor anterior y el nuevo', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', coins: 100, gems: 5 });
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', coins: 500, gems: 5 });

    const res = await service.adjustBalance(actor, 'u1', { coins: 500 });

    expect(res).toEqual({ id: 'u1', coins: 500, gems: 5 });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { coins: 500, gems: 5 } }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        event: 'balance_adjust',
        metadata: { from: { coins: 100, gems: 5 }, to: { coins: 500, gems: 5 }, by: 'admin-1' },
      },
    });
  });

  it('no escribe ni audita si el saldo no cambia', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', coins: 100, gems: 5 });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', coins: 100, gems: 5 });

    await service.adjustBalance(actor, 'u1', { coins: 100, gems: 5 });

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([{ coins: -1 }, { gems: 1.5 }, { coins: 2_000_000_000 }, {}, { coins: '10' }])('rechaza %j', async (body) => {
    await expect(service.adjustBalance(actor, 'u1', body)).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el usuario no existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(service.adjustBalance(actor, 'nope', { gems: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
