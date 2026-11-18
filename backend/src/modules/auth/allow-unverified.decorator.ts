import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverifiedEmail';

/**
 * Permite la ruta (o el controlador) a cuentas con el correo sin verificar aunque
 * EMAIL_VERIFICATION_REQUIRED=true: perfil (`GET /me`), verificación, reenvío y cierre de sesión.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

/** Código de error que reciben las apps para mostrar la pantalla de verificación. */
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/** Código de error con HANDLE_REQUIRED=true: la cuenta debe elegir su nickname (POST /me/handle). */
export const HANDLE_REQUIRED = 'HANDLE_REQUIRED';
