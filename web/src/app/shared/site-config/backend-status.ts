import { Injectable } from '@angular/core';

/** Lo que una llamada a la API ha observado sobre el backend. */
export type BackendSignal = 'offline' | 'maintenance';

/**
 * Canal entre el cliente HTTP y `SiteConfigService` (sin que se importen entre sí): cuando una
 * petición no llega al servidor o recibe un 503 `MAINTENANCE`, se avisa para volver a comprobar el
 * estado y, si toca, tapar la web con la pantalla de mantenimiento.
 */
@Injectable({ providedIn: 'root' })
export class BackendStatus {
  private readonly listeners = new Set<(signal: BackendSignal) => void>();

  report(signal: BackendSignal) {
    for (const fn of this.listeners) fn(signal);
  }

  /** Devuelve la función para dejar de escuchar. */
  listen(fn: (signal: BackendSignal) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
