import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { listPetsSchema } from './authz.schemas';
import { normalizePetName, PET_NAME_INVALID_MESSAGE } from '../../common/pet-name';

/** Campos de un pet que expone el panel de administración (AdminPetDto). `owner` proviene de `user`. */
const ADMIN_PET_SELECT = {
  id: true,
  nickname: true,
  speciesId: true,
  rarity: true,
  level: true,
  stage: true,
  shiny: true,
  sick: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
} as const;

/** Convierte el resultado de Prisma (relación `user`) al contrato `owner` de AdminPetDto. */
function toAdminPet<T extends { user: unknown }>(pet: T) {
  const { user, ...rest } = pet;
  return { ...rest, owner: user };
}

/** Gestión de mascotas para el panel de administración: listado paginado y renombre auditado. */
@Injectable()
export class AdminPetsService {
  private readonly logger = new Logger(AdminPetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(rawQuery: unknown) {
    const { page, pageSize, rarity, q } = parseOrBadRequest(listPetsSchema, rawQuery);
    const where = {
      ...(rarity ? { rarity } : {}),
      ...(q
        ? {
            OR: [
              { nickname: { contains: q, mode: 'insensitive' as const } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              { user: { displayName: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pet.findMany({
        where,
        select: ADMIN_PET_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pet.count({ where }),
    ]);
    return { items: items.map(toAdminPet), total, page, pageSize };
  }

  /**
   * Renombra un pet desde el panel de administración. A diferencia de la eclosión, aquí el nickname
   * es obligatorio: vacío o mayor de 16 caracteres → 400. Se audita con `pet_rename` guardando
   * `from` (nombre anterior), `to` (nuevo) y `by` (actorId).
   */
  async rename(actor: { id: string; role?: string }, petId: string, raw: unknown) {
    const nickname = (raw as { nickname?: unknown } | null | undefined)?.nickname;
    const normalized = normalizePetName(nickname);
    if (!('name' in normalized)) throw new BadRequestException(PET_NAME_INVALID_MESSAGE);
    const newNickname = normalized.name;

    const updated = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet) throw new NotFoundException('Pet no encontrado');

      const updatedPet = await tx.pet.update({
        where: { id: petId },
        data: { nickname: newNickname },
        select: ADMIN_PET_SELECT,
      });

      await tx.auditLog.create({
        data: {
          userId: pet.userId,
          event: 'pet_rename',
          metadata: { from: pet.nickname, to: newNickname, by: actor.id },
        },
      });

      return updatedPet;
    });

    this.logger.log(`Pet ${petId} renombrado a "${newNickname}" por ${actor.id}`);
    return toAdminPet(updated);
  }
}