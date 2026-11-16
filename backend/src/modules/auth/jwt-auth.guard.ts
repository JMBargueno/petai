import { ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_UNVERIFIED_KEY, EMAIL_NOT_VERIFIED } from './allow-unverified.decorator';

/**
 * Autenticación JWT + bloqueo de cuentas sin verificar.
 *
 * Con EMAIL_VERIFICATION_REQUIRED=true, un usuario con `emailVerifiedAt` vacío recibe
 * 403 `{ code: 'EMAIL_NOT_VERIFIED' }` en todas las rutas salvo las marcadas con `@AllowUnverified()`.
 * Es 403 y no 401 a propósito: las apps tratan el 401 como "renovar el token y, si falla, cerrar sesión".
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
    if (this.config?.get<string>('EMAIL_VERIFICATION_REQUIRED') !== 'true') return true;

    const user = context.switchToHttp().getRequest()?.user as { emailVerifiedAt?: Date | null } | undefined;
    if (!user || user.emailVerifiedAt) return true;

    const allowed = this.reflector?.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    throw new ForbiddenException({
      statusCode: 403,
      code: EMAIL_NOT_VERIFIED,
      message: 'Verifica tu correo electrónico para seguir usando Pockai',
    });
  }
}
