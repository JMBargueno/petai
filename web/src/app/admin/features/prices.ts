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
      intro="Catálogo real de la tienda. Los precios en monedas y gemas se editan en la propia celda y se aplican al instante en la app. Los objetos se definen en foods.json."
      [repo]="repo"
      [columns]="columns"
      [fields]="fields"
      [filter]="filter"
      [nameOf]="nameOf"
      [editable]="false"
      [deletable]="false"
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

  protected readonly filter: Filter<CatalogItem> = { key: 'kind', label: 'Tipo', options: options(ITEM_KINDS) };

  protected readonly columns: Column<CatalogItem>[] = [
    { key: 'name', label: 'Ítem' },
    { key: 'kind', label: 'Tipo', format: (i) => ITEM_KINDS[i.kind] ?? i.kind },
    { key: 'id', label: 'Identificador' },
    { key: 'priceCoins', label: 'Monedas', type: 'number', editable: true },
    { key: 'priceGems', label: 'Gemas', type: 'number', editable: true },
  ];

  /** Sin formulario: solo se editan los precios, en la celda. */
  protected readonly fields: Field<CatalogItem>[] = [];

  /** Aplica el porcentaje a la moneda elegida en todas las filas que pasan el filtro actual (una sola petición). */
  protected async applyBulk(page: ResourcePage<CatalogItem>) {
    const percent = Math.trunc(this.percent() ?? 0);
    if (!percent) return;
    const key = this.currency();
    const targets = page.visibleRows().filter((item) => item[key] > 0);
    const unit = key === 'priceCoins' ? 'monedas' : 'gemas';
    if (!targets.length) {
      this.result.set(`Ningún ítem visible tiene precio en ${unit}.`);
      return;
    }
    try {
      const { changed } = await this.repo.bulkAdjust(
        targets.map((item) => item.id),
        percent,
        key,
      );
      await page.store.load();
      this.result.set(`Ajuste del ${percent} % en ${unit}: ${changed} de ${targets.length} ítems cambiados.`);
      this.percent.set(null);
    } catch (e) {
      this.result.set(e instanceof Error ? e.message : 'Error inesperado');
    }
  }
}
