import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DISPLAY_NAME,
  isHandleValid,
  isUniqueViolationOn,
  legacyEmailDisplayName,
  normalizeHandle,
} from '../../common/user-handle';
import { parseOrBadRequest, setHandleSchema } from '../auth/dto/auth.schemas';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidTimeZone } from '../pets/sleep-cycle';
import { resolveDefaults, NotificationPrefs } from '../notifications/notification-rules';
import { parseNotificationPrefs } from '../notifications/dto/notification-prefs.dto';
import { permissionsFor } from '../authz/permissions';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        handle: true,
        timezone: true,
        birthday: true,
        coins: true,
        gems: true,
        accountXp: true,
        achievementsPublic: true,
        notificationPrefs: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Notificaciones (feature 007): `null` se mantiene null (el cliente aplica defaults); si existe,
    // se devuelve el objeto completo con defaults resueltos (contrato de api-contract.md).
    const notificationPrefs =
      user.notificationPrefs != null ? resolveDefaults(user.notificationPrefs as Partial<NotificationPrefs>) : null;

    // Permisos efectivos del rol: los clientes (panel admin) deciden qué mostrar sin duplicar la tabla de roles.
    const { emailVerifiedAt, ...rest } = user;
    // emailVerified=false: las apps muestran la pantalla de verificación (y la API responde 403 al resto).
    return { ...rest, emailVerified: emailVerifiedAt != null, notificationPrefs, permissions: permissionsFor(user.role) };
  }

  /**
   * Solo se aceptan displayName, timezone y birthday (y preferencias), validados. El cuerpo
   * NUNCA se pasa tal cual a Prisma: de lo contrario el usuario podría modificar coins, gems,
   * passwordHash, etc. (asignación masiva).
   */
  async updateMe(userId: string, body: unknown) {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const data: {
      displayName?: string;
      timezone?: string;
      birthday?: string | null;
      achievementsPublic?: boolean;
      notificationPrefs?: Prisma.InputJsonValue | null;
    } = {};

    // El nickname es inmutable: no se edita aquí (se fija una sola vez con POST /me/handle).
    if (input.handle !== undefined) {
      throw new BadRequestException('El nickname no se puede cambiar');
    }

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

    // `latitude`/`longitude` ya no se guardan: la ubicación se queda en el dispositivo (solo
    // sirve para pedir el clima desde la app). Los escritorios antiguos aún las mandan: se
    // ignoran sin error para no romperles el arranque.

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

    // Opt-in de visibilidad pública de logros (feature 008).
    if (input.achievementsPublic !== undefined) {
      if (typeof input.achievementsPublic !== 'boolean') {
        throw new BadRequestException('achievementsPublic debe ser un booleano');
      }
      data.achievementsPublic = input.achievementsPublic;
    }

    // Preferencias de notificaciones (feature 007): merge parcial — solo se sobreescriben los campos
    // presentes; el resto conserva el valor anterior (o defaults si aún no hay prefs).
    if (input.notificationPrefs !== undefined) {
      let parsed;
      try {
        parsed = parseNotificationPrefs(input.notificationPrefs);
      } catch (err: any) {
        throw new BadRequestException(err?.message ?? 'notificationPrefs inválido');
      }
      if (Object.keys(parsed).length > 0) {
        const existing = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { notificationPrefs: true },
        });
        const base = resolveDefaults((existing?.notificationPrefs ?? null) as Partial<NotificationPrefs>);
        data.notificationPrefs = { ...base, ...parsed };
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        handle: true,
        timezone: true,
        birthday: true,
        coins: true,
        gems: true,
        accountXp: true,
        achievementsPublic: true,
        notificationPrefs: true,
      },
    });

    // Al activar la visibilidad pública (transición privado → público) se alimenta el logro social
    // `social_opener` (feature 008, pregunta abierta #4 del spec).
    if (data.achievementsPublic === true) {
      this.events.emitAsync('social:public_profile', { userId }).catch(() => {
        /* noop: el tracking de logros nunca debe romper la petición */
      });
    }

    return updated;
  }

  /**
   * Fija el nickname de una cuenta que aún no lo tiene. Solo funciona una vez: el `where handle: null`
   * hace la operación atómica (dos peticiones a la vez no pueden fijar dos nicknames distintos) y,
   * además, un trigger de la base de datos impide cambiarlo después.
   */
  async setHandle(userId: string, raw: unknown) {
    const { handle } = parseOrBadRequest(setHandleSchema, raw);
    let count: number;
    try {
      ({ count } = await this.prisma.user.updateMany({ where: { id: userId, handle: null }, data: { handle } }));
    } catch (err) {
      if (isUniqueViolationOn(err, 'handle')) throw new ConflictException('Ese nickname ya está en uso');
      throw err;
    }
    if (count === 0) {
      const exists = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Usuario no encontrado');
      throw new ConflictException('Tu nickname ya está fijado y no se puede cambiar');
    }
    // Cuentas antiguas: el nombre por defecto era la parte local del correo (dato privado). Al
    // elegir nickname se sustituye por él, salvo que el jugador ya hubiera puesto otro nombre.
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
    if (me && (!me.displayName || me.displayName === legacyEmailDisplayName(me.email) || me.displayName === DEFAULT_DISPLAY_NAME)) {
      await this.prisma.user.update({ where: { id: userId }, data: { displayName: handle } });
    }
    return this.getMe(userId);
  }

  /** Perfil público mínimo de un jugador por su nickname (buscar a alguien antes de añadirlo). */
  async findByHandle(raw: unknown) {
    const handle = normalizeHandle(raw);
    if (!isHandleValid(handle)) throw new NotFoundException('No hay ningún jugador con ese nickname');
    const user = await this.prisma.user.findUnique({
      where: { handle },
      select: { id: true, handle: true, displayName: true, title: true, accountXp: true },
    });
    if (!user) throw new NotFoundException('No hay ningún jugador con ese nickname');
    return user;
  }
}
