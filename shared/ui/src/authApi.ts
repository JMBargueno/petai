/**
 * Cómo entran y se dan de alta las vistas de acceso (`AuthView`, `VerifyEmailView`,
 * `ChooseHandleView`). Son flujos de varios pasos que esperan la respuesta del servidor, así que,
 * como el chat (`chatApi`), reciben un puerto con las llamadas en vez de avisar por eventos. Cada app
 * lo rellena con lo suyo: el núcleo en Android, la API del escritorio en el escritorio.
 */

export interface RegisterInput {
  email: string;
  password: string;
  /** Normalizado (minúsculas, sin «@») y ya comprobado como libre. */
  handle: string;
  displayName?: string;
  inviteCode?: string;
}

export interface HandleCheck {
  handle: string;
  available: boolean;
  reason?: string;
}

export interface AuthApi {
  login(email: string, password: string): Promise<unknown>;
  register(input: RegisterInput): Promise<unknown>;
  /** Si el alta exige un código de invitación. */
  registrationConfig(): Promise<{ inviteRequired: boolean }>;
  /** Recuperar contraseña, paso 1: manda un código al correo (si la cuenta existe). */
  requestPasswordReset(email: string): Promise<unknown>;
  /** Paso 2: con el código cambia la contraseña y abre sesión. */
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<unknown>;
  checkHandle(handle: string): Promise<HandleCheck>;
  verifyEmail(code: string): Promise<unknown>;
  resendVerification(): Promise<unknown>;
  /** «Ya lo he verificado con el enlace»: vuelve a preguntar al servidor. */
  isEmailVerified(): Promise<boolean>;
  setHandle(handle: string): Promise<unknown>;
  /** El texto que se le enseña al jugador para un error. */
  errorText(error: unknown, fallback: string): string;
}

/** El código de 6 dígitos de los correos (verificar, recuperar contraseña). */
export const isAuthCode = (code: string) => /^[0-9]{6}$/.test(code.trim());

/** Cuenta atrás para volver a pedir un código. Devuelve una función que la para. */
export function cooldown(seconds: number, tick: (left: number) => void): () => void {
  let left = seconds;
  tick(left);
  const timer = setInterval(() => {
    left -= 1;
    tick(Math.max(left, 0));
    if (left <= 0) clearInterval(timer);
  }, 1000);
  return () => clearInterval(timer);
}
