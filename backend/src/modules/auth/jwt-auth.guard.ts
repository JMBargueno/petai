import { ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_UNVERIFIED_KEY, EMAIL_NOT_VERIFIED, HANDLE_REQUIRED } from './allow-unverified.decorator';

/**
 * Autenticación JWT + bloqueo de cuentas a las que les falta un paso de alta:
 *
 * - EMAIL_VERIFICATION_REQUIRED=true: un usuario con `emailVerifiedAt` vacío recibe
 *   403 `{ code: 'EMAIL_NOT_VERIFIED' }`.
 * - HANDLE_REQUIRED=true: un usuario sin nickname (`handle` null, cuentas anteriores al nickname o
 *   creadas desde apps antiguas) recibe 403 `{ code: 'HANDLE_REQUIRED' }` hasta que lo elija.
 *
 * Las rutas marcadas con `@AllowUnverified()` quedan fuera de ambos bloqueos (perfil, verificación,
 * elegir nickname, cierre de sesión). Es 403 y no 401 a propósito: las apps tratan el 401 como
 * "renovar el token y, si falla, cerrar sesión".
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Optional() private readonly reflector?: Reflector,
    @Optional() private readonly config?: ConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const emailRequired = this.config?.get<string>('EMAIL_VERIFICATION_REQUIRED') === 'true';
    const handleRequired = this.config?.get<string>('HANDLE_REQUIRED') === 'true';
    if (!emailRequired && !handleRequired) return true;

    const user = context.switchToHttp().getRequest()?.user as
      | { emailVerifiedAt?: Date | null; handle?: string | null }
      | undefined;
    if (!user) return true;
    const missingEmail = emailRequired && !user.emailVerifiedAt;
    // Estricto con null: el usuario autenticado siempre trae `handle` (jwt.strategy lo selecciona).
    const missingHandle = handleRequired && user.handle === null;
    if (!missingEmail && !missingHandle) return true;

    const allowed = this.reflector?.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    // Primero el correo: la app muestra la verificación y, después, la pantalla de nickname.
    if (missingEmail) {
      throw new ForbiddenException({
        statusCode: 403,
        code: EMAIL_NOT_VERIFIED,
        message: 'Verifica tu correo electrónico para seguir usando Pockai',
      });
    }
    throw new ForbiddenException({
      statusCode: 403,
      code: HANDLE_REQUIRED,
      message: 'Elige tu nickname para seguir usando Pockai',
    });
  }
}
