import { InjectionToken } from '@angular/core';

/** Almacén del navegador donde el mock guarda los cambios. Los tests lo sustituyen por uno en memoria. */
export const MOCK_STORAGE = new InjectionToken<Storage>('MOCK_STORAGE', {
  providedIn: 'root',
  factory: () => localStorage,
});
