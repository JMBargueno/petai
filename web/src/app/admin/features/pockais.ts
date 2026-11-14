import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ELEMENTS, PetEntry, RARITIES, STAGES, SpeciesEntry, options } from '../data/models';
import { PETS, SPECIES } from '../data/repository';
import { seedSpecies } from '../data/seed';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

const stat = (key: 'hp' | 'atk' | 'def' | 'vel' | 'esp', label: string): Field<SpeciesEntry> => ({
  key,
  label,
  type: 'number',
  min: 1,
  max: 255,
  required: true,
});

@Component({
  selector: 'app-admin-pockais',
  imports: [ResourcePage],
  template: `
    <h1 class="visually-hidden">Pockais</h1>
    <div class="stack">
      <app-resource-page
        heading="Especies"
        intro="Catálogo de especies y sus estadísticas base."
        [headingLevel]="2"
        [repo]="speciesRepo"
        [columns]="speciesColumns"
        [fields]="speciesFields"
        [nameOf]="speciesName"
        [blank]="blankSpecies"
      />
      <app-resource-page
        heading="Mascotas de jugadores"
        intro="Pockais eclosionados (datos generados)."
        [headingLevel]="2"
        [repo]="petsRepo"
        [columns]="petColumns"
        [fields]="petFields"
        [filter]="petFilter"
        [nameOf]="petName"
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

  // Especies
  protected readonly speciesName = (s: SpeciesEntry) => s.name;
  protected readonly blankSpecies = (): SpeciesEntry => ({
    id: '',
    name: '',
    description: '',
    element: 'fire',
    rarity: 'normal',
    hp: 50,
    atk: 50,
    def: 50,
    vel: 50,
    esp: 50,
    favoriteFood: '',
    spriteKey: '',
  });

  protected readonly speciesColumns: Column<SpeciesEntry>[] = [
    { key: 'name', label: 'Especie' },
    { key: 'element', label: 'Elemento', format: (s) => ELEMENTS[s.element] ?? s.element },
    { key: 'rarity', label: 'Rareza', format: (s) => RARITIES[s.rarity] ?? s.rarity },
    { key: 'hp', label: 'Vida', type: 'number' },
    { key: 'atk', label: 'Ataque', type: 'number' },
    { key: 'def', label: 'Defensa', type: 'number' },
    { key: 'vel', label: 'Velocidad', type: 'number' },
    { key: 'esp', label: 'Espíritu', type: 'number' },
  ];

  protected readonly speciesFields: Field<SpeciesEntry>[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'id', label: 'Identificador', type: 'text', required: true, lockedOnEdit: true },
    { key: 'description', label: 'Descripción', type: 'textarea' },
    { key: 'element', label: 'Elemento', type: 'select', options: options(ELEMENTS), required: true },
    { key: 'rarity', label: 'Rareza', type: 'select', options: options(RARITIES), required: true },
    stat('hp', 'Vida'),
    stat('atk', 'Ataque'),
    stat('def', 'Defensa'),
    stat('vel', 'Velocidad'),
    stat('esp', 'Espíritu'),
    { key: 'favoriteFood', label: 'Comida favorita (id)', type: 'text' },
    { key: 'spriteKey', label: 'Clave de sprite', type: 'text' },
  ];

  // Mascotas
  private readonly speciesNames = new Map(seedSpecies().map((s) => [s.id, s.name]));
  protected readonly petName = (p: PetEntry) => p.nickname;
  protected readonly petFilter: Filter<PetEntry> = { key: 'rarity', label: 'Rareza', options: options(RARITIES) };

  protected readonly petColumns: Column<PetEntry>[] = [
    { key: 'nickname', label: 'Apodo' },
    { key: 'speciesId', label: 'Especie', format: (p) => this.speciesNames.get(p.speciesId) ?? p.speciesId },
    { key: 'owner', label: 'Dueño' },
    { key: 'rarity', label: 'Rareza', format: (p) => RARITIES[p.rarity] ?? p.rarity },
    { key: 'level', label: 'Nivel', type: 'number' },
    { key: 'stage', label: 'Etapa', format: (p) => STAGES[p.stage] },
    { key: 'shiny', label: 'Shiny', type: 'bool' },
    { key: 'sick', label: 'Enfermo', type: 'bool' },
  ];

  protected readonly petFields: Field<PetEntry>[] = [
    { key: 'nickname', label: 'Apodo', type: 'text', required: true },
    { key: 'owner', label: 'Dueño', type: 'email', lockedOnEdit: true },
    { key: 'level', label: 'Nivel', type: 'number', min: 1, max: 100, required: true },
    { key: 'stage', label: 'Etapa', type: 'select', options: options(STAGES), required: true },
    { key: 'rarity', label: 'Rareza', type: 'select', options: options(RARITIES), required: true },
    { key: 'shiny', label: 'Shiny', type: 'checkbox' },
    { key: 'sick', label: 'Enfermo', type: 'checkbox' },
  ];
}
