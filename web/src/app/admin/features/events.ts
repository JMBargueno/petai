import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_SOURCES, GameEvent, eventStatus, options } from '../data/models';
import { EVENTS } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

@Component({
  selector: 'app-admin-events',
  imports: [ResourcePage],
  template: `
    <app-resource-page
      heading="Eventos"
      intro="Lo que el juego tiene programado: festividades (festivals.json, en el año en curso), temporada actual y próxima (seasons.json), y los últimos torneos y raids. Solo lectura: las festividades y temporadas se cambian en game-data."
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [editable]="false"
      [deletable]="false"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Events {
  protected readonly repo = inject(EVENTS);
  protected readonly nameOf = (event: GameEvent) => event.name;

  protected readonly filter: Filter<GameEvent> = { key: 'source', label: 'Origen', options: options(EVENT_SOURCES) };

  protected readonly columns: Column<GameEvent>[] = [
    { key: 'name', label: 'Evento' },
    { key: 'source', label: 'Origen', format: (e) => EVENT_SOURCES[e.source] ?? e.source },
    { key: 'startDate', label: 'Inicio', type: 'date' },
    { key: 'endDate', label: 'Fin', type: 'date' },
    { key: 'enabled', label: 'Estado', format: (e) => eventStatus(e) },
    { key: 'detail', label: 'Detalle' },
  ];

  protected readonly fields: Field<GameEvent>[] = [];
}
