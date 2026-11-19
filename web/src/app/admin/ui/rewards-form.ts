import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CHEST_LABELS, CHEST_TYPES, type AccessoryOption, type ChestType, type ItemOption, type Rewards } from '../data/vouchers-http';

const ITEM_GROUPS: { key: ItemOption['availability']; label: string }[] = [
  { key: 'shop', label: 'Tienda' },
  { key: 'drop', label: 'Solo drop' },
  { key: 'hidden', label: 'Ocultos (solo admin)' },
];

/**
 * Campos de un paquete de recompensas (monedas, gemas, días Pro, cofres, objetos y prendas). Lo comparten el
 * alta de vouchers y «Dar recompensa» en Usuarios. Va dentro del `<form>` de quien lo usa.
 */
@Component({
  selector: 'app-rewards-form',
  imports: [FormsModule],
  styleUrl: './resource-page.css',
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    fieldset {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 12px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
    }
    legend {
      padding: 0 4px;
      font-weight: var(--font-weight-bold);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px;
    }
    .accessories {
      display: grid;
      gap: 4px;
      max-block-size: 180px;
      overflow: auto;
      padding: 4px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
    }
    .items {
      display: grid;
      gap: 8px;
      max-block-size: 260px;
      overflow: auto;
      padding: 4px;
      border: 1px solid var(--line-soft);
      border-radius: 8px;
    }
    .items h4 {
      margin: 4px 0 0;
      font-size: 0.875em;
      opacity: 0.8;
    }
    .item-row {
      display: grid;
      grid-template-columns: 1fr 80px;
      align-items: center;
      gap: 8px;
    }
    .hint {
      margin: 0;
      font-size: 0.875em;
      opacity: 0.8;
    }
  `,
  template: `
    <fieldset>
      <legend>Saldo y Pro</legend>
      <div class="grid">
        <div class="field">
          <label [for]="uid + '-coins'">Monedas</label>
          <input class="input" [id]="uid + '-coins'" [name]="uid + '-coins'" type="number" min="0" max="1000000" step="1" [ngModel]="value().coins" (ngModelChange)="set('coins', $event)" />
        </div>
        <div class="field">
          <label [for]="uid + '-gems'">Gemas</label>
          <input class="input" [id]="uid + '-gems'" [name]="uid + '-gems'" type="number" min="0" max="1000000" step="1" [ngModel]="value().gems" (ngModelChange)="set('gems', $event)" />
        </div>
        @if (canGrantPro()) {
          <div class="field">
            <label [for]="uid + '-pro'">Días de Pro</label>
            <input class="input" [id]="uid + '-pro'" [name]="uid + '-pro'" type="number" min="0" max="365" step="1" [ngModel]="value().proDays" (ngModelChange)="set('proDays', $event)" />
          </div>
        }
      </div>
      @if (!canGrantPro()) {
        <p class="hint">Regalar días de Pro está reservado a quien gestiona la facturación.</p>
      }
    </fieldset>

    <fieldset>
      <legend>Cofres</legend>
      <div class="grid">
        @for (t of chestTypes; track t) {
          <div class="field">
            <label [for]="uid + '-chest-' + t">{{ chestLabels[t] }}</label>
            <input class="input" [id]="uid + '-chest-' + t" [name]="uid + '-chest-' + t" type="number" min="0" max="10" step="1" [ngModel]="chestQty(t)" (ngModelChange)="setChest(t, $event)" />
          </div>
        }
      </div>
    </fieldset>

    <fieldset>
      <legend>Objetos ({{ itemCount() }})</legend>
      <div class="items" role="group" aria-label="Objetos">
        @for (g of itemGroups(); track g.key) {
          <h4>{{ g.label }}</h4>
          @for (it of g.items; track it.id) {
            <div class="item-row">
              <label [for]="uid + '-item-' + it.id" [title]="it.description">{{ it.name }} <small>· {{ it.id }}</small></label>
              <input class="input" [id]="uid + '-item-' + it.id" [name]="uid + '-item-' + it.id" type="number" min="0" max="99" step="1" [ngModel]="itemQty(it.id)" (ngModelChange)="setItem(it.id, $event)" />
            </div>
          }
        } @empty {
          <p class="hint">Cargando objetos…</p>
        }
      </div>
    </fieldset>

    <fieldset>
      <legend>Prendas ({{ value().accessories.length }})</legend>
      <label>
        <span class="visually-hidden">Buscar prendas</span>
        <input class="input" type="search" placeholder="Buscar prenda…" [name]="uid + '-acc-q'" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </label>
      <div class="accessories" role="group" aria-label="Prendas">
        @for (a of filtered(); track a.id) {
          <label class="check">
            <input type="checkbox" [checked]="value().accessories.includes(a.id)" (change)="toggleAccessory(a.id, $event)" />
            {{ a.name }} <small>· {{ a.slot }} · {{ a.rarity }}</small>
          </label>
        } @empty {
          <p class="hint">{{ accessories().length ? 'Ninguna coincide' : 'Cargando prendas…' }}</p>
        }
      </div>
    </fieldset>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RewardsForm {
  private static nextUid = 0;
  protected readonly uid = `rewards-${RewardsForm.nextUid++}`;

  readonly value = model.required<Rewards>();
  readonly accessories = input<AccessoryOption[]>([]);
  /** Consumibles de foods.json (spec 41): también los de solo drop y los ocultos. */
  readonly items = input<ItemOption[]>([]);
  readonly canGrantPro = input(false);

  protected readonly chestTypes = CHEST_TYPES;
  protected readonly chestLabels = CHEST_LABELS;
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.accessories();
    return q ? list.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q)) : list;
  });

  protected readonly itemGroups = computed(() =>
    ITEM_GROUPS.map((g) => ({ ...g, items: this.items().filter((i) => (i.availability ?? 'shop') === g.key) })).filter((g) => g.items.length),
  );
  protected readonly itemCount = computed(() => (this.value().items ?? []).reduce((n, i) => n + i.qty, 0));

  protected itemQty(id: string) {
    return (this.value().items ?? []).find((i) => i.id === id)?.qty ?? 0;
  }

  protected setItem(id: string, raw: unknown) {
    const qty = Math.min(99, toInt(raw));
    this.value.update((v) => {
      const rest = (v.items ?? []).filter((i) => i.id !== id);
      return { ...v, items: qty > 0 ? [...rest, { id, qty }] : rest };
    });
  }

  protected set(key: 'coins' | 'gems' | 'proDays', raw: unknown) {
    this.value.update((v) => ({ ...v, [key]: toInt(raw) }));
  }

  protected chestQty(type: ChestType) {
    return this.value().chests.find((c) => c.type === type)?.qty ?? 0;
  }

  protected setChest(type: ChestType, raw: unknown) {
    const qty = toInt(raw);
    this.value.update((v) => ({
      ...v,
      chests: CHEST_TYPES.map((t) => ({ type: t, qty: t === type ? qty : (v.chests.find((c) => c.type === t)?.qty ?? 0) })).filter((c) => c.qty > 0),
    }));
  }

  protected toggleAccessory(id: string, event: Event) {
    const on = (event.target as HTMLInputElement).checked;
    this.value.update((v) => ({
      ...v,
      accessories: on ? [...new Set([...v.accessories, id])] : v.accessories.filter((a) => a !== id),
    }));
  }
}

function toInt(raw: unknown) {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
