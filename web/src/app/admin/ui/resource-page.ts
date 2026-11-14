import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Entity } from '../data/models';
import type { Repository } from '../data/repository';
import { ResourceStore } from '../data/resource-store';

export interface Option {
  value: string;
  label: string;
}

export interface Column<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'bool';
  /** Texto a mostrar cuando no basta con el valor en bruto. */
  format?: (row: T) => string;
  /** Solo columnas numéricas: se edita directamente en la celda. */
  editable?: boolean;
}

export interface Field<T> {
  key: keyof T & string;
  label: string;
  type: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'date' | 'checkbox';
  options?: Option[];
  required?: boolean;
  min?: number;
  max?: number;
  /** No editable una vez creado (identificadores). */
  lockedOnEdit?: boolean;
}

export interface Filter<T> {
  key: keyof T & string;
  label: string;
  options: Option[];
}

type SortDirection = 'ascending' | 'descending';

let nextUid = 0;
/** Por encima de este tamaño no se anima la reordenación (demasiados elementos a la vez). */
const MAX_ANIMATED_ROWS = 60;
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' });

/**
 * Pantalla genérica de un recurso: búsqueda, filtro, tabla ordenable, alta/edición y borrado.
 * Cada sección del panel la configura con columnas y campos; no sabe de dónde vienen los datos.
 */
@Component({
  selector: 'app-resource-page',
  imports: [FormsModule],
  templateUrl: './resource-page.html',
  styleUrl: './resource-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourcePage<T extends Entity> implements OnInit {
  readonly heading = input.required<string>();
  readonly intro = input('');
  readonly headingLevel = input<1 | 2>(1);
  readonly repo = input.required<Repository<T>>();
  readonly columns = input.required<Column<T>[]>();
  readonly fields = input.required<Field<T>[]>();
  readonly nameOf = input.required<(row: T) => string>();
  /** Fábrica de un registro vacío. Sin ella no se ofrece «Nuevo». */
  readonly blank = input<(() => T) | null>(null);
  readonly filter = input<Filter<T> | null>(null);
  readonly deletable = input(true);
  /** Validación propia del recurso; devuelve el mensaje de error o null. */
  readonly validate = input<((entity: T) => string | null) | null>(null);

  store!: ResourceStore<T>;

  protected readonly uid = `resource-${nextUid++}`;
  protected readonly query = signal('');
  protected readonly filterValue = signal('');
  protected readonly sort = signal<{ key: string; dir: SortDirection } | null>(null);
  protected readonly status = signal('');
  protected readonly draft = signal<Record<string, unknown> | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly pendingDelete = signal<T | null>(null);

  private readonly injector = inject(Injector);
  private readonly editDialog = viewChild.required<ElementRef<HTMLDialogElement>>('editDialog');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  /** Filas tras aplicar búsqueda, filtro y orden. Público para acciones en lote de la sección. */
  readonly visibleRows = computed(() => {
    const columns = this.columns();
    const query = this.query().trim().toLowerCase();
    const filter = this.filter();
    const filterValue = this.filterValue();
    const sort = this.sort();

    let rows = this.store.rows();
    if (filter && filterValue) rows = rows.filter((r) => String(r[filter.key]) === filterValue);
    if (query) {
      rows = rows.filter((r) => columns.some((c) => this.cell(r, c).toLowerCase().includes(query)));
    }
    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      const factor = sort.dir === 'ascending' ? 1 : -1;
      // Se ordena por el valor en bruto (números como números), no por el texto formateado.
      rows = [...rows].sort((a, b) => {
        const x = a[sort.key as keyof T];
        const y = b[sort.key as keyof T];
        const numeric = column?.type === 'number' || column?.type === 'bool';
        return factor * (numeric ? Number(x) - Number(y) : collator.compare(String(x), String(y)));
      });
    }
    return rows;
  });

  ngOnInit() {
    this.store = new ResourceStore(this.repo());
    void this.store.load();
  }

  protected cell(row: T, column: Column<T>): string {
    if (column.format) return column.format(row);
    const value = row[column.key];
    if (column.type === 'bool') return value ? 'Sí' : 'No';
    if (column.type === 'date' && value) return dateFormat.format(new Date(String(value)));
    return String(value ?? '');
  }

  /** Nombre de transición por fila: así, al reordenar, cada una viaja a su nuevo sitio. */
  protected rowTransitionName(row: T): string | null {
    if (this.store.rows().length > MAX_ANIMATED_ROWS) return null;
    return `${this.uid}-${row.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  /** Aplica un cambio de orden o filtro dentro de una view transition, si se puede. */
  protected reorder(change: () => void) {
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || calm || this.store.rows().length > MAX_ANIMATED_ROWS) {
      change();
      return;
    }
    doc.startViewTransition(() => {
      change();
      // La transición captura el estado nuevo cuando Angular ya ha pintado las filas.
      return new Promise<void>((done) => afterNextRender(() => done(), { injector: this.injector }));
    });
  }

  protected onFilter(value: string) {
    this.reorder(() => this.filterValue.set(value));
  }

  protected toggleSort(column: Column<T>) {
    const current = this.sort();
    const dir: SortDirection =
      current?.key === column.key && current.dir === 'ascending' ? 'descending' : 'ascending';
    this.reorder(() => this.sort.set({ key: column.key, dir }));
    const direction = dir === 'ascending' ? 'ascendente' : 'descendente';
    this.status.set(`Ordenado por ${column.label}, ${direction}, ${this.visibleRows().length} filas`);
  }

  protected async inlineEdit(row: T, column: Column<T>, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = Math.max(0, Math.round(input.valueAsNumber));
    if (Number.isNaN(value) || value === row[column.key]) {
      input.value = String(row[column.key]);
      return;
    }
    const ok = await this.store.update(row.id, { [column.key]: value } as Partial<T>);
    if (ok) this.status.set(`${column.label} de ${this.nameOf()(row)}: ${value}`);
  }

  protected openCreate() {
    const blank = this.blank();
    if (blank) this.open(blank(), null);
  }

  protected openEdit(row: T) {
    this.open(row, row.id);
  }

  private open(entity: T, id: string | null) {
    const draft = { ...entity } as unknown as Record<string, unknown>;
    this.editingId.set(id);
    this.formError.set(null);
    this.draft.set(draft);
    // El formulario se pinta con el borrador; se abre después para que `autofocus` encuentre el campo.
    afterNextRender(() => this.editDialog().nativeElement.showModal(), { injector: this.injector });
  }

  protected setField(key: string, value: unknown) {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected async save() {
    const entity = this.draft() as unknown as T;
    const error = this.validate()?.(entity) ?? null;
    this.formError.set(error);
    if (error) return;

    const id = this.editingId();
    const ok = id ? await this.store.update(id, entity) : await this.store.create(entity);
    if (!ok) {
      this.formError.set(this.store.error());
      return;
    }
    this.status.set(`Guardado: ${this.nameOf()(entity)}`);
    this.editDialog().nativeElement.close();
  }

  protected askDelete(row: T) {
    this.pendingDelete.set(row);
    this.deleteDialog().nativeElement.showModal();
  }

  protected async onDeleteClose(dialog: HTMLDialogElement) {
    const confirmed = dialog.returnValue === 'delete';
    dialog.returnValue = ''; // Esc no fija valor: sin esto se colaría el de la vez anterior.
    const row = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!confirmed || !row) return;
    if (await this.store.remove(row.id)) this.status.set(`Borrado: ${this.nameOf()(row)}`);
  }
}
