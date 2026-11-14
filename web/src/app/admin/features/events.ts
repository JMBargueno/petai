import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_TYPES, GameEvent, eventStatus, options } from '../data/models';
import { EVENTS } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

@Component({
  selector: 'app-admin-events',
  imports: [ResourcePage],
  template: `
    <app-resource-page
      heading="Eventos"
      intro="Festividades, temporadas, torneos y raids. El estado se calcula a partir de las fechas."
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [blank]="blank"
      [validate]="validate"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Events {
  protected readonly repo = inject(EVENTS);
  protected readonly nameOf = (event: GameEvent) => event.name;

  protected readonly blank = (): GameEvent => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: `event_${Date.now().toString(36)}`,
      name: '',
      type: 'festival',
      startDate: today,
      endDate: today,
      enabled: true,
      notes: '',
    };
  };

  protected readonly validate = (event: GameEvent) =>
    event.endDate < event.startDate ? 'La fecha de fin no puede ser anterior a la de inicio.' : null;

  protected readonly filter: Filter<GameEvent> = { key: 'type', label: 'Tipo', options: options(EVENT_TYPES) };

  protected readonly columns: Column<GameEvent>[] = [
    { key: 'name', label: 'Evento' },
    { key: 'type', label: 'Tipo', format: (e) => EVENT_TYPES[e.type] },
    { key: 'startDate', label: 'Inicio', type: 'date' },
    { key: 'endDate', label: 'Fin', type: 'date' },
    { key: 'enabled', label: 'Estado', format: (e) => eventStatus(e) },
  ];

  protected readonly fields: Field<GameEvent>[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'type', label: 'Tipo', type: 'select', options: options(EVENT_TYPES), required: true },
    { key: 'startDate', label: 'Inicio', type: 'date', required: true },
    { key: 'endDate', label: 'Fin', type: 'date', required: true },
    { key: 'notes', label: 'Notas', type: 'textarea' },
    { key: 'enabled', label: 'Habilitado', type: 'checkbox' },
  ];
}
