import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminAuth } from '../auth';
import { ELEMENTS, PetEntry, RARITIES, STAGES, SpeciesEntry, options } from '../data/models';
import { PETS, SPECIES } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

/** Longitud máxima del apodo, la misma que valida el backend al eclosionar y al renombrar. */
const MAX_NICKNAME = 16;

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
        [validate]="petValidate"
        [editable]="canRename"
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
  protected readonly canRename = inject(AdminAuth).can('pets:rename');
  protected readonly speciesFields: Field<SpeciesEntry>[] = [];

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
  protected readonly petsIntro = this.canRename
    ? `Mascotas de los jugadores. Desde «Editar» solo se cambia el apodo (máx. ${MAX_NICKNAME} caracteres); el resto es de solo lectura.`
    : 'Mascotas de los jugadores (solo lectura).';
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

  /** Solo el apodo es editable; el dueño se enseña como referencia. */
  protected readonly petFields: Field<PetEntry>[] = [
    { key: 'nickname', label: 'Apodo', type: 'text', required: true },
    { key: 'owner', label: 'Dueño', type: 'text', lockedOnEdit: true },
  ];

  /** El backend solo permite renombre: el apodo es obligatorio y de 1 a 16 caracteres. */
  protected readonly petValidate = (p: PetEntry): string | null => {
    const nickname = p.nickname?.trim() ?? '';
    if (nickname.length === 0) return 'El apodo no puede estar vacío.';
    if (nickname.length > MAX_NICKNAME) return `El apodo no puede superar ${MAX_NICKNAME} caracteres.`;
    return null;
  };

  constructor() {
    void this.speciesRepo
      .list()
      .then((rows) => this.speciesNames.set(new Map(rows.map((s) => [s.id, s.name]))))
      .catch(() => undefined); // Sin nombres se muestra el id; el error ya lo enseña la tabla de especies.
  }
}
