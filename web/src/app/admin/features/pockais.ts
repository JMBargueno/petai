import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAX_PETS } from '../data/catalog-http';
import { ELEMENTS, PetEntry, RARITIES, STAGES, SpeciesEntry, options } from '../data/models';
import { PETS, SPECIES } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

@Component({
  selector: 'app-admin-pockais',
  imports: [ResourcePage],
  template: `
    <h1 class="visually-hidden">Pockais</h1>
    <div class="stack">
      <app-resource-page
        heading="Especies"
        intro="Especies que usa el juego (species.json) y sus estadísticas base. Solo lectura: se cambian en game-data."
        [headingLevel]="2"
        [repo]="speciesRepo"
        [columns]="speciesColumns"
        [fields]="speciesFields"
        [nameOf]="speciesName"
        [editable]="false"
        [deletable]="false"
      />
      <app-resource-page
        heading="Mascotas de jugadores"
        [intro]="petsIntro"
        [headingLevel]="2"
        [repo]="petsRepo"
        [columns]="petColumns"
        [fields]="petFields"
        [filter]="petFilter"
        [nameOf]="petName"
        [editable]="false"
        [deletable]="false"
      />
    </div>
  `,
  styles: `
    .stack {
      display: grid;
      gap: 48px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pockais {
  protected readonly speciesRepo = inject(SPECIES);
  protected readonly petsRepo = inject(PETS);
  protected readonly speciesFields: Field<SpeciesEntry>[] = [];
  protected readonly petFields: Field<PetEntry>[] = [];

  // Especies
  protected readonly speciesName = (s: SpeciesEntry) => s.name;
  protected readonly speciesColumns: Column<SpeciesEntry>[] = [
    { key: 'name', label: 'Especie' },
    { key: 'element', label: 'Elemento', format: (s) => ELEMENTS[s.element] ?? s.element },
    { key: 'rarity', label: 'Rareza', format: (s) => RARITIES[s.rarity] ?? s.rarity },
    { key: 'hp', label: 'Vida', type: 'number' },
    { key: 'atk', label: 'Ataque', type: 'number' },
    { key: 'def', label: 'Defensa', type: 'number' },
    { key: 'vel', label: 'Velocidad', type: 'number' },
    { key: 'esp', label: 'Espíritu', type: 'number' },
    { key: 'favoriteFood', label: 'Comida favorita' },
  ];

  // Mascotas
  protected readonly petsIntro = `Pockais de los jugadores, de solo lectura (las ${MAX_PETS} más recientes).`;
  /** Nombre de cada especie para la columna de mascotas; se rellena al cargar las especies. */
  private readonly speciesNames = signal(new Map<string, string>());
  protected readonly petName = (p: PetEntry) => p.nickname;
  protected readonly petFilter: Filter<PetEntry> = { key: 'rarity', label: 'Rareza', options: options(RARITIES) };

  protected readonly petColumns: Column<PetEntry>[] = [
    { key: 'nickname', label: 'Apodo' },
    { key: 'speciesId', label: 'Especie', format: (p) => this.speciesNames().get(p.speciesId) ?? p.speciesId },
    { key: 'owner', label: 'Dueño' },
    { key: 'rarity', label: 'Rareza', format: (p) => RARITIES[p.rarity] ?? p.rarity },
    { key: 'level', label: 'Nivel', type: 'number' },
    { key: 'stage', label: 'Etapa', format: (p) => STAGES[p.stage] ?? p.stage },
    { key: 'shiny', label: 'Shiny', type: 'bool' },
    { key: 'sick', label: 'Enfermo', type: 'bool' },
    { key: 'createdAt', label: 'Eclosión', type: 'date' },
  ];

  constructor() {
    void this.speciesRepo
      .list()
      .then((rows) => this.speciesNames.set(new Map(rows.map((s) => [s.id, s.name]))))
      .catch(() => undefined); // Sin nombres se muestra el id; el error ya lo enseña la tabla de especies.
  }
}
