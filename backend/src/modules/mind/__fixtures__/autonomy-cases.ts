/**
 * Casos con los que se congeló la vida autónoma antes de la spec 37 §4.6 (actividades nuevas).
 * `autonomy-baseline.json` guarda lo que `simulate` devolvía entonces para cada uno; el test de
 * determinismo comprueba que, sin las actividades nuevas habilitadas, sigue devolviendo lo mismo.
 */
import type { SimInput } from '../autonomy.engine';
import type { Dims } from '../mind.types';

const dims = (over: Partial<Dims> = {}): Dims => ({ curiosity: 50, sociability: 50, bravery: 50, affection: 50, temper: 50, ...over });

const FRIENDS = [
  { petId: 'f1', name: 'Brasa', ownerId: 'u1', ownerName: 'Ana' },
  { petId: 'f2', name: 'Lumo', ownerId: 'u2', ownerName: 'Luis' },
  { petId: 'f3', name: 'Zarpa', ownerId: 'u3', ownerName: 'Eva' },
];

const base = (over: Partial<SimInput>): SimInput => ({
  petId: 'pet-1',
  dims: dims(),
  inHabitat: false,
  sleeping: false,
  sick: false,
  energy: 80,
  from: 480_000,
  to: 480_047,
  friends: FRIENDS,
  daily: undefined,
  itemNames: { apple: 'Manzana', sun_seed: 'Semilla solar' },
  ...over,
});

export const AUTONOMY_CASES: Record<string, SimInput> = {
  neutral: base({}),
  curiosa: base({ petId: 'pet-2', dims: dims({ curiosity: 95, bravery: 80 }) }),
  sociable: base({ petId: 'pet-3', dims: dims({ sociability: 95 }) }),
  tranquila_en_casa: base({ petId: 'pet-4', dims: dims({ temper: 5 }), inHabitat: true }),
  sin_amigos: base({ petId: 'pet-5', friends: [] }),
  cansada: base({ petId: 'pet-6', energy: 10 }),
  enferma: base({ petId: 'pet-7', sick: true }),
  dormida: base({ petId: 'pet-8', sleeping: true }),
  con_topes_gastados: base({ petId: 'pet-9', daily: { day: '2026-11-18', items: 2, happiness: 12, energy: 30, encounters: 3 } }),
};

export const AUTONOMY_TODAY = '2026-11-18';
