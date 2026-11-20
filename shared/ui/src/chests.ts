// Los precios son los mismos datos de equilibrio que usa el servidor para cobrar.
import balance from '../../game-data/balance.json';

export type ChestPayment = 'coins' | 'gems';

const PRICES = (balance as any).chests as Record<string, { prices?: { coins?: number; gems?: number } }>;

/** Precio de un cofre en una moneda, o `null` si no se vende así. */
export function chestPrice(type: string, method: ChestPayment): number | null {
  return PRICES?.[type]?.prices?.[method] ?? null;
}

const CHEST_LABEL: Record<string, string> = {
  bronze: 'Bronce', silver: 'Plata', gold: 'Oro', diamond: 'Diamante', mythic: 'Mítico',
};

/** Nombre de un tipo de cofre: «Bronce», «Oro»… */
export function chestLabel(type: string): string {
  return CHEST_LABEL[type] ?? type;
}

/** Aviso tras comprar un cofre, igual en todas las apps. */
export function chestBoughtText(type: string): string {
  return `Cofre de ${chestLabel(type).toLowerCase()} comprado. Lo tienes arriba, en «Mis cofres».`;
}
