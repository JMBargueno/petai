import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminPetsService } from './admin-pets.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminPetsService', () => {
  let service: AdminPetsService;

  const rawPetRow = {
    id: 'pet-1',
    nickname: 'Firulais',
    speciesId: 'ignisaur',
    rarity: 'normal',
    level: 3,
    stage: 'baby',
    shiny: false,
    sick: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: { id: 'owner-1', email: 'ana@petai.app', displayName: 'Ana' },
  };

  const mockPrismaService = {
    pet: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    // Soporta ambos formatos usados por el servicio: callback (renombre) y array (listado).
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mockPrismaService) : Promise.all(arg))),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    // resetAllMocks() borra la implementación de $transaction: se reestablece aquí para soportar
    // tanto el formato callback (renombre) como el de array (listado).
    mockPrismaService.$transaction.mockImplementation(
      async (arg: any) => (typeof arg === 'function' ? arg(mockPrismaService) : Promise.all(arg)),
    );
    mockPrismaService.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminPetsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<AdminPetsService>(AdminPetsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('mapea la paginación y convierte la relación user en owner', async () => {
      mockPrismaService.pet.findMany.mockResolvedValue([rawPetRow]);
      mockPrismaService.pet.count.mockResolvedValue(42);

      const result = await service.list({});

      expect(result).toEqual({
        items: [
          {
            id: 'pet-1',
            nickname: 'Firulais',
            speciesId: 'ignisaur',
            rarity: 'normal',
            level: 3,
            stage: 'baby',
            shiny: false,
            sick: false,
            createdAt: rawPetRow.createdAt,
            owner: { id: 'owner-1', email: 'ana@petai.app', displayName: 'Ana' },
          },
        ],
        total: 42,
        page: 1,
        pageSize: 50,
      });
      expect(mockPrismaService.pet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, skip: 0, take: 50 }),
      );
    });

    it('aplica los filtros de rareza y búsqueda (nickname o dueño)', async () => {
      mockPrismaService.pet.findMany.mockResolvedValue([]);
      mockPrismaService.pet.count.mockResolvedValue(0);

      await service.list({ rarity: 'legendary', q: 'Ana', page: '2', pageSize: '10' });

      expect(mockPrismaService.pet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            rarity: 'legendary',
            OR: [
              { nickname: { contains: 'Ana', mode: 'insensitive' } },
              { user: { email: { contains: 'Ana', mode: 'insensitive' } } },
              { user: { displayName: { contains: 'Ana', mode: 'insensitive' } } },
            ],
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('rename', () => {
    const actor = { id: 'actor-1', role: 'admin' };

    it('renombra el pet, lo audita y devuelve el AdminPetDto actualizado', async () => {
      mockPrismaService.pet.findUnique.mockResolvedValue({ id: 'pet-1', userId: 'owner-1', nickname: 'Firulais' });
      const updated = { ...rawPetRow, nickname: 'Mimi' };
      mockPrismaService.pet.update.mockResolvedValue(updated);

      const result = await service.rename(actor, 'pet-1', { nickname: 'Mimi' });

      expect(result).toMatchObject({ id: 'pet-1', nickname: 'Mimi', owner: expect.objectContaining({ email: 'ana@petai.app' }) });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'owner-1',
          event: 'pet_rename',
          metadata: { from: 'Firulais', to: 'Mimi', by: 'actor-1' },
        },
      });
    });

    it('rechaza con 400 si el nickname supera los 16 caracteres', async () => {
      await expect(service.rename(actor, 'pet-1', { nickname: 'x'.repeat(17) })).rejects.toThrow(
        'El nombre debe tener entre 1 y 16 caracteres',
      );
      expect(mockPrismaService.pet.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza con 400 si el nickname está vacío u omite el campo', async () => {
      await expect(service.rename(actor, 'pet-1', { nickname: '   ' })).rejects.toThrow(
        'El nombre debe tener entre 1 y 16 caracteres',
      );
      await expect(service.rename(actor, 'pet-1', {})).rejects.toThrow('El nombre debe tener entre 1 y 16 caracteres');
    });

    it('devuelve 404 si el pet no existe', async () => {
      mockPrismaService.pet.findUnique.mockResolvedValue(null);
      await expect(service.rename(actor, 'no-existe', { nickname: 'Mimi' })).rejects.toThrow(NotFoundException);
    });
  });
});