import { Injectable, computed, inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AdminApi, ApiError, SessionUser } from './api';
import { AuditLog } from './data/audit-log';

/** Permiso que da acceso al panel (lo concede el backend según el rol; hoy solo superadmin). */
export const PANEL_PERMISSION = 'admin:access';

/**
 * Sesión del panel contra el backend: login con correo y contraseña y comprobación del rol
 * con `/v1/me`. El backend vuelve a comprobar cada permiso en cada petición; esto solo decide
 * qué se enseña.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuth {
  private readonly api = inject(AdminApi);
  private readonly audit = inject(AuditLog);
  private revalidation: Promise<boolean> | null = null;

  readonly user = computed(() => this.api.session()?.user ?? null);
  readonly authenticated = computed(() => !!this.user()?.permissions.includes(PANEL_PERMISSION));

  can(permission: string): boolean {
    return !!this.user()?.permissions.includes(permission);
  }

  /** Devuelve null si entra, o el mensaje a mostrar si no. */
  async login(email: string, password: string): Promise<string | null> {
    try {
      const tokens = await this.api.request<{ accessToken: string; refreshToken: string }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      this.api.setSession({ ...tokens, user: null });
      const user = await this.fetchMe();
      if (!user.permissions.includes(PANEL_PERMISSION)) {
        await this.logout();
        return 'Tu cuenta no tiene acceso al panel.';
      }
      this.revalidation = Promise.resolve(true);
      this.audit.record('Sesión', 'panel', `Inicio de sesión (${user.email})`);
      return null;
    } catch (e) {
      this.api.setSession(null);
      if (e instanceof ApiError && e.status === 401) return 'Correo o contraseña incorrectos.';
      return e instanceof Error ? e.message : 'Error inesperado';
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
   * Vuelve a leer rol y permisos del servidor (una vez por carga de la app): si el rol cambió o la
   * sesión caducó, el guard lo nota. Sin conexión se mantiene lo guardado; el backend sigue mandando.
   */
  revalidate(): Promise<boolean> {
    this.revalidation ??= this.fetchMe()
      .then(() => this.authenticated())
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          this.api.setSession(null);
          return false;
        }
        this.revalidation = null;
        return this.authenticated();
      });
    return this.revalidation;
  }

  private async fetchMe(): Promise<SessionUser> {
    const me = await this.api.request<SessionUser>('/v1/me');
    const user: SessionUser = {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      role: me.role,
      permissions: me.permissions ?? [],
    };
    const session = this.api.session();
    if (session) this.api.setSession({ ...session, user });
    return user;
  }
}

export const adminGuard: CanMatchFn = async () => {
  const auth = inject(AdminAuth);
  const login = inject(Router).parseUrl('/admin/login');
  if (!auth.authenticated()) return login;
  return (await auth.revalidate()) || login;
};
