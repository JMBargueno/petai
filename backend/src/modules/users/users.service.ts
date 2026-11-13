import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidTimeZone } from '../pets/sleep-cycle';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        coins: true,
        gems: true,
        accountXp: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Solo se aceptan displayName y timezone, validados. El cuerpo NUNCA se pasa
   * tal cual a Prisma: de lo contrario el usuario podría modificar coins, gems,
   * passwordHash, etc. (asignación masiva).
   */
  async updateMe(userId: string, body: unknown) {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const data: { displayName?: string; timezone?: string } = {};

    if (input.displayName !== undefined) {
      if (typeof input.displayName !== 'string') {
        throw new BadRequestException('displayName debe ser un texto');
      }
      const name = input.displayName.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (name.length < 1 || name.length > 50) {
        throw new BadRequestException('displayName debe tener entre 1 y 50 caracteres');
      }
      data.displayName = name;
    }

    if (input.timezone !== undefined) {
      if (typeof input.timezone !== 'string' || !isValidTimeZone(input.timezone)) {
        throw new BadRequestException('timezone debe ser un identificador IANA válido (p. ej. Europe/Madrid)');
      }
      data.timezone = input.timezone;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        coins: true,
        gems: true,
        accountXp: true,
      },
    });
  }
}
