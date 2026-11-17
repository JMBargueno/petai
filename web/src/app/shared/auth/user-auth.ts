import { Injectable, computed, inject } from '@angular/core';
import { ApiClient, ApiError, SessionUser } from './api';

/** Permiso que da acceso al panel (superadmin, admin y moderator). */
export const PANEL_PERMISSION = 'admin:access';

export interface RegisterInput {
  email: string;
  password: string;
  handle: string;
  inviteCode?: string;
}

export interface HandleCheck {
  handle: string;
  available: boolean;
  reason?: string;
}

type Tokens = { accessToken: string; refreshToken: string };

/**
 * Cuenta del visitante en la web: login, registro, verificación del correo y recuperación de la
 * contraseña. Comparte sesión con el panel de administración (ApiClient). El backend vuelve a
 * comprobar todo en cada petición: esto solo decide qué se enseña.
 */
@Injectable({ providedIn: 'root' })
export class UserAuth {
  private readonly api = inject(ApiClient);
  private revalidation: Promise<SessionUser | null> | null = null;

  readonly user = computed(() => this.api.session()?.user ?? null);
  readonly loggedIn = computed(() => !!this.api.session());
  readonly verified = computed(() => !!this.user()?.emailVerified);
  readonly isAdmin = computed(() => !!this.user()?.permissions.includes(PANEL_PERMISSION));

  /** Devuelve null si entra, o el mensaje a mostrar si no. */
  async login(email: string, password: string): Promise<string | null> {
    try {
      const tokens = await this.api.request<Tokens>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      this.api.setSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: null });
      await this.fetchMe();
      this.revalidation = Promise.resolve(this.user());
      return null;
    } catch (e) {
      this.api.setSession(null);
      if (e instanceof ApiError && e.status === 401) return $localize`:@@auth.login.invalid:Correo o contraseña incorrectos.`;
      return messageOf(e);
    }
  }

  /** Crea la cuenta y deja la sesión abierta (sin verificar). Devuelve null o el mensaje de error. */
  async register(input: RegisterInput): Promise<string | null> {
    const body: Record<string, string> = {
      email: input.email.trim(),
      password: input.password,
      handle: input.handle.trim(),
    };
    const invite = input.inviteCode?.trim();
    if (invite) body['inviteCode'] = invite;
    try {
      const tokens = await this.api.request<Tokens>('/v1/auth/register', { method: 'POST', body: JSON.stringify(body) });
      this.api.setSession({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: null });
      await this.fetchMe();
      this.revalidation = Promise.resolve(this.user());
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) return $localize`:@@auth.register.taken:Ya existe una cuenta con ese correo o nickname.`;
      return messageOf(e);
    }
  }

  async logout() {
    const refreshToken = this.api.session()?.refreshToken;
    this.api.setSession(null);
    this.revalidation = null;
    if (refreshToken) {
      await this.api
        .request('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false)
        .catch(() => undefined);
    }
  }

  /**
   * Vuelve a leer la cuenta del servidor (una vez por carga de la app): rol, permisos y verificación.
   * Si la sesión ya no vale, se cierra. Sin conexión se mantiene lo guardado.
   */
  revalidate(): Promise<SessionUser | null> {
    if (!this.api.session()) return Promise.resolve(null);
    this.revalidation ??= this.fetchMe().catch((e) => {
      if (e instanceof ApiError && e.status === 401) {
        this.api.setSession(null);
        return null;
      }
      this.revalidation = null;
      return this.user();
    });
    return this.revalidation;
  }

  /** Lee `/v1/me` y lo guarda en la sesión. */
  async fetchMe(): Promise<SessionUser> {
    const me = await this.api.request<SessionUser>('/v1/me');
    const user: SessionUser = {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      role: me.role,
      permissions: me.permissions ?? [],
      handle: me.handle ?? null,
      emailVerified: !!me.emailVerified,
    };
    const session = this.api.session();
    if (session) this.api.setSession({ ...session, user });
    return user;
  }

  /** Reenvía el correo de verificación a la cuenta con sesión. */
  async resendVerification(): Promise<string | null> {
    try {
      await this.api.request('/v1/auth/verify-email/resend', { method: 'POST' });
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) return $localize`:@@auth.tooMany:Demasiados intentos. Espera unos minutos y vuelve a probar.`;
      return messageOf(e);
    }
  }

  /** Verifica el correo con el código de 6 dígitos del email. */
  async confirmVerification(code: string): Promise<string | null> {
    try {
      await this.api.request('/v1/auth/verify-email/confirm', { method: 'POST', body: JSON.stringify({ code: code.trim() }) });
      await this.fetchMe();
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) return $localize`:@@auth.verify.badCode:El código no es correcto o ha caducado.`;
      if (e instanceof ApiError && e.status === 429) return $localize`:@@auth.tooMany:Demasiados intentos. Espera unos minutos y vuelve a probar.`;
      return messageOf(e);
    }
  }

  /** Pide el código para cambiar la contraseña (el backend no revela si el correo existe). */
  async requestPasswordReset(email: string): Promise<string | null> {
    try {
      await this.api.request('/v1/auth/reset/request', { method: 'POST', body: JSON.stringify({ email: email.trim() }) }, false);
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) return $localize`:@@auth.tooMany:Demasiados intentos. Espera unos minutos y vuelve a probar.`;
      return messageOf(e);
    }
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<string | null> {
    try {
      await this.api.request(
        '/v1/auth/reset/confirm',
        { method: 'POST', body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword }) },
        false,
      );
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) return $localize`:@@auth.reset.badCode:El código no es correcto o ha caducado.`;
      if (e instanceof ApiError && e.status === 429) return $localize`:@@auth.tooMany:Demasiados intentos. Espera unos minutos y vuelve a probar.`;
      return messageOf(e);
    }
  }

  checkHandle(handle: string): Promise<HandleCheck> {
    return this.api.request<HandleCheck>(`/v1/auth/handle-available?handle=${encodeURIComponent(handle.trim())}`, {}, false);
  }

  /** URL firmada del instalador de escritorio (requiere sesión con el correo verificado). */
  async downloadUrl(platform: 'windows' | 'macos'): Promise<string> {
    const res = await this.api.request<{ url: string }>(`/v1/desktop/download/${platform}`);
    return res.url;
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : $localize`:@@auth.unexpected:Error inesperado`;
}
