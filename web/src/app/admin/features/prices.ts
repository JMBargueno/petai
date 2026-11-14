import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogItem, ITEM_KINDS, options } from '../data/models';
import { ITEMS } from '../data/repository';
import { Column, Field, Filter, ResourcePage } from '../ui/resource-page';

type Currency = 'priceCoins' | 'priceGems';

@Component({
  selector: 'app-admin-prices',
  imports: [ResourcePage, FormsModule],
  template: `
    <app-resource-page
      #page
      heading="Precios"
      intro="Catálogo de la tienda. Los precios en monedas y gemas se editan en la propia celda."
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [blank]="blank"
    >
      <form toolbar class="bulk" ngNativeValidate (ngSubmit)="applyBulk(page)">
        <label>
          <span class="visually-hidden">Porcentaje de ajuste</span>
          <input
            class="input"
            type="number"
            name="percent"
            min="-90"
            max="500"
            required
            placeholder="± %"
            [ngModel]="percent()"
            (ngModelChange)="percent.set($event)"
          />
        </label>
        <label>
          <span class="visually-hidden">Moneda a ajustar</span>
          <select class="input" name="currency" [ngModel]="currency()" (ngModelChange)="currency.set($event)">
            <option value="priceCoins">Monedas</option>
            <option value="priceGems">Gemas</option>
          </select>
        </label>
        <button class="btn" type="submit">Ajustar visibles</button>
      </form>
    </app-resource-page>
    <p class="note" role="status">{{ result() }}</p>
  `,
  styles: `
    .bulk {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-inline-start: auto;
    }
    .bulk .input {
      inline-size: 120px;
      border-radius: var(--radius-pills);
    }
    .note {
      margin: 12px 0 0;
      font-weight: var(--font-weight-bold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Prices {
  protected readonly repo = inject(ITEMS);
  protected readonly percent = signal<number | null>(null);
  protected readonly currency = signal<Currency>('priceCoins');
  protected readonly result = signal('');

  protected readonly nameOf = (item: CatalogItem) => item.name;
  protected readonly blank = (): CatalogItem => ({
    id: `item_${Date.now().toString(36)}`,
    name: '',
    kind: 'food',
    description: '',
    priceCoins: 0,
    priceGems: 0,
    active: true,
  });

  protected readonly filter: Filter<CatalogItem> = { key: 'kind', label: 'Tipo', options: options(ITEM_KINDS) };

  protected readonly columns: Column<CatalogItem>[] = [
    { key: 'name', label: 'Ítem' },
    { key: 'kind', label: 'Tipo', format: (i) => ITEM_KINDS[i.kind] },
    { key: 'priceCoins', label: 'Monedas', type: 'number', editable: true },
    { key: 'priceGems', label: 'Gemas', type: 'number', editable: true },
    { key: 'active', label: 'En venta', type: 'bool' },
  ];

  protected readonly fields: Field<CatalogItem>[] = [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'id', label: 'Identificador', type: 'text', required: true, lockedOnEdit: true },
    { key: 'kind', label: 'Tipo', type: 'select', options: options(ITEM_KINDS), required: true },
    { key: 'description', label: 'Descripción', type: 'textarea' },
    { key: 'priceCoins', label: 'Precio en monedas', type: 'number', min: 0, required: true },
    { key: 'priceGems', label: 'Precio en gemas', type: 'number', min: 0, required: true },
    { key: 'active', label: 'En venta', type: 'checkbox' },
  ];

  /** Aplica el porcentaje a la moneda elegida en todas las filas que pasan el filtro actual. */
  protected async applyBulk(page: ResourcePage<CatalogItem>) {
    const percent = this.percent();
    if (percent === null) return;
    const key = this.currency();
    const targets = page.visibleRows().filter((item) => item[key] > 0);
    for (const item of targets) {
      const price = Math.max(0, Math.round(item[key] * (1 + percent / 100)));
      await page.store.update(item.id, { [key]: price } as Partial<CatalogItem>);
    }
    const unit = key === 'priceCoins' ? 'monedas' : 'gemas';
    this.result.set(`Ajuste del ${percent} % en ${unit} aplicado a ${targets.length} ítems.`);
    this.percent.set(null);
  }
}
