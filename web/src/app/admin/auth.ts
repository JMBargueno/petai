import { Injectable, inject, signal } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuditLog } from './data/audit-log';

/**
 * Acceso SIMULADO al panel.
 *
 * Esto no es seguridad: el código de demo viaja dentro del bundle y cualquiera puede leerlo.
 * Sirve para ensayar el flujo de sesión mientras el panel solo maneja datos de ejemplo.
 * Antes de conectar datos reales hay que sustituirlo por autenticación de administrador
 * en el backend (hoy `User` no tiene rol).
 */
export const DEMO_ACCESS_CODE = 'pockai-demo';

const KEY = 'pockai.admin.session';

@Injectable({ providedIn: 'root' })
export class AdminAuth {
  private readonly audit = inject(AuditLog);
  private readonly _authenticated = signal(sessionStorage.getItem(KEY) === '1');
  readonly authenticated = this._authenticated.asReadonly();

  login(code: string): boolean {
    if (code.trim() !== DEMO_ACCESS_CODE) return false;
    sessionStorage.setItem(KEY, '1');
    this._authenticated.set(true);
    this.audit.record('Sesión', 'panel', 'Inicio de sesión');
    return true;
  }

  logout() {
    sessionStorage.removeItem(KEY);
    this._authenticated.set(false);
  }
}

export const adminGuard: CanMatchFn = () =>
  inject(AdminAuth).authenticated() || inject(Router).parseUrl('/admin/login');
