import { InjectionToken, inject } from '@angular/core';
import { AdminApi } from '../api';
import { HttpEventsRepository, HttpItemsRepository, HttpPetsRepository, HttpSpeciesRepository } from './catalog-http';
import type { AdminUser, GameEvent, PetEntry, SpeciesEntry } from './models';
import type { Repository } from './repository-base';
import { HttpUsersRepository } from './users-http';

export type { Repository } from './repository-base';

/** Fuentes de datos del panel: todas contra el backend (`/v1/admin/*`). */
export const ITEMS = new InjectionToken<HttpItemsRepository>('ITEMS', {
  providedIn: 'root',
  factory: () => new HttpItemsRepository(inject(AdminApi)),
});
export const EVENTS = new InjectionToken<Repository<GameEvent>>('EVENTS', {
  providedIn: 'root',
  factory: () => new HttpEventsRepository(inject(AdminApi)),
});
export const USERS = new InjectionToken<Repository<AdminUser>>('USERS', {
  providedIn: 'root',
  factory: () => new HttpUsersRepository(inject(AdminApi)),
});
export const SPECIES = new InjectionToken<Repository<SpeciesEntry>>('SPECIES', {
  providedIn: 'root',
  factory: () => new HttpSpeciesRepository(inject(AdminApi)),
});
export const PETS = new InjectionToken<Repository<PetEntry>>('PETS', {
  providedIn: 'root',
  factory: () => new HttpPetsRepository(inject(AdminApi)),
});
