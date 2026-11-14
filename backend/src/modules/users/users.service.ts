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
        latitude: true,
        longitude: true,
        birthday: true,
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
   * Solo se aceptan displayName, timezone, latitude, longitude y birthday, validados. El cuerpo
   * NUNCA se pasa tal cual a Prisma: de lo contrario el usuario podría modificar coins, gems,
   * passwordHash, etc. (asignación masiva).
   */
  async updateMe(userId: string, body: unknown) {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const data: {
      displayName?: string;
      timezone?: string;
      latitude?: number | null;
      longitude?: number | null;
      birthday?: string | null;
    } = {};

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

    // Coordenadas opt-in (privacidad): se redondean a 2 decimales y se usan solo para el clima.
    if (input.latitude !== undefined) {
      const lat = this.parseCoordinate(input.latitude, -90, 90, 'latitude');
      data.latitude = lat;
    }
    if (input.longitude !== undefined) {
      const lon = this.parseCoordinate(input.longitude, -180, 180, 'longitude');
      data.longitude = lon;
    }

    if (input.birthday !== undefined) {
      if (input.birthday === null) {
        data.birthday = null;
      } else if (typeof input.birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.birthday)) {
        throw new BadRequestException('birthday debe ser una fecha ISO (YYYY-MM-DD)');
      } else {
        const [y, m, d] = input.birthday.split('-').map((n) => parseInt(n, 10));
        const check = new Date(Date.UTC(y, m - 1, d));
        if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
          throw new BadRequestException('birthday debe ser una fecha válida (YYYY-MM-DD)');
        }
        data.birthday = input.birthday;
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        latitude: true,
        longitude: true,
        birthday: true,
        coins: true,
        gems: true,
        accountXp: true,
      },
    });
  }

  /** Valida y redondea una coordenada; `null` borra el valor (opt-out). */
  private parseCoordinate(value: unknown, min: number, max: number, field: string): number | null {
    if (value === null) return null; // opt-out
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new BadRequestException(`${field} debe ser un número entre ${min} y ${max}`);
    }
    return Math.round(value * 100) / 100;
  }
}
