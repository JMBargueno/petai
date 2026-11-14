import { Injectable, inject, signal } from '@angular/core';
import { MOCK_STORAGE } from './storage';

export interface AuditEntry {
  at: string;
  action: 'Alta' | 'Cambio' | 'Baja' | 'Sesión' | 'Sistema';
  resource: string;
  detail: string;
}

const KEY = 'pockai.admin.registro';
const MAX_ENTRIES = 200;

/** Historial de lo que se hace en el panel. Local al navegador, igual que el resto del mock. */
@Injectable({ providedIn: 'root' })
export class AuditLog {
  private readonly storage = inject(MOCK_STORAGE);
  private readonly _entries = signal<AuditEntry[]>(this.load());
  readonly entries = this._entries.asReadonly();

  record(action: AuditEntry['action'], resource: string, detail: string) {
    const entry: AuditEntry = { at: new Date().toISOString(), action, resource, detail };
    this._entries.update((list) => [entry, ...list].slice(0, MAX_ENTRIES));
    this.storage.setItem(KEY, JSON.stringify(this._entries()));
  }

  clear() {
    this._entries.set([]);
    this.storage.removeItem(KEY);
  }

  private load(): AuditEntry[] {
    try {
      return JSON.parse(this.storage.getItem(KEY) ?? '[]') as AuditEntry[];
    } catch {
      return [];
    }
  }
}
