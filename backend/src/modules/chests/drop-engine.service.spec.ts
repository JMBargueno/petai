import {
  DropEngineService,
  DropEntry,
  ChestTierWeights,
  ChestDropTable,
  tierRank,
} from './drop-engine.service';

/**
 * Tests unitarios del motor de drops (T023 / SC-001 / SC-002). El motor es puro: se instancia
 * directamente sin Nest. Usa `crypto.randomInt` por defecto; algunas pruebas inyectan un `rng` para
 * verificar comportamientos deterministas.
 */
describe('DropEngineService', () => {
  const engine = new DropEngineService();

  const dropTable: ChestDropTable = {
    dropTable: [
      { itemId: 'apple', tier: 'common', qtyMin: 1, qtyMax: 4 },
      { itemId: 'spicy_berry', tier: 'common', qtyMin: 1, qtyMax: 3 },
      { itemId: 'sweet_coral', tier: 'common', qtyMin: 1, qtyMax: 3 },
      { itemId: 'sun_seed', tier: 'uncommon', qtyMin: 1, qtyMax: 2 },
      { itemId: 'cake', tier: 'uncommon', qtyMin: 1, qtyMax: 2 },
      { itemId: 'healthy_salad', tier: 'rare', qtyMin: 1, qtyMax: 1 },
      { itemId: 'medicine', tier: 'epic', qtyMin: 1, qtyMax: 1 },
      { itemId: 'evolution_stone', tier: 'legendary', qtyMin: 1, qtyMax: 1 },
    ],
  };
  const weights: ChestTierWeights = { common: 60, uncommon: 24, rare: 9, epic: 4, legendary: 3 };
  const qtyRange = (e: DropEntry): [number, number] => [e.qtyMin, e.qtyMax];
  const knownIds = new Set(dropTable.dropTable.map((d) => d.itemId));

  it('resuelve un drop válido (itemId conocido, tier y qty en rango)', () => {
    const r = engine.resolveDrop(dropTable, weights, qtyRange);
    expect(knownIds.has(r.itemId)).toBe(true);
    expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(r.tier);
    expect(r.qty).toBeGreaterThanOrEqual(1);
    expect(r.guaranteed).toBe(false);
    expect(r.meetsMinTier).toBe(false); // sin pityState
  });

  it('SC-002: count >= threshold y minTier=rare ⇒ 100% de drops son tier >= rare (10 000 corridas)', () => {
    const threshold = 10;
    let worst = Infinity;
    for (let i = 0; i < 10_000; i++) {
      const r = engine.resolveDrop(dropTable, weights, qtyRange, {
        count: threshold,
        threshold,
        minTier: 'rare',
      });
      worst = Math.min(worst, tierRank(r.tier));
    }
    expect(worst).toBeGreaterThanOrEqual(tierRank('rare'));
  });

  it('por debajo del umbral (count = threshold-1) NO fuerza: permite tiers < minTier', () => {
    let sawLower = false;
    for (let i = 0; i < 5000; i++) {
      const r = engine.resolveDrop(dropTable, weights, qtyRange, {
        count: 9,
        threshold: 10,
        minTier: 'rare',
      });
      if (tierRank(r.tier) < tierRank('rare')) {
        sawLower = true;
        break;
      }
    }
    expect(sawLower).toBe(true);
  });

  it('un drop natural >= minTier marca meetsMinTier (para resetear el pity)', () => {
    // rng que siempre devuelve el último índice: tier legendario (último en orden canónico).
    const rng = (max: number) => max - 1;
    const r = engine.resolveDrop(
      dropTable,
      weights,
      qtyRange,
      { count: 2, threshold: 10, minTier: 'rare' },
      rng,
    );
    expect(r.tier).toBe('legendary');
    expect(r.meetsMinTier).toBe(true);
  });

  it('con garantía activa marca guaranteed=true al forzar el re-roll', () => {
    // rng que fuerza el primer tier (common) en la selección natural; la garantía debe re-roll a >= rare.
    const calls: number[] = [];
    const rng = (max: number) => {
      calls.push(max);
      return 0; // siempre el primero
    };
    const r = engine.resolveDrop(
      dropTable,
      weights,
      qtyRange,
      { count: 10, threshold: 10, minTier: 'rare' },
      rng,
    );
    // El primer roll da common (rank 0 < rare rank 2) → se fuerza un tier >= rare.
    expect(r.guaranteed).toBe(true);
    expect(tierRank(r.tier)).toBeGreaterThanOrEqual(tierRank('rare'));
    // Se ejecutaron dos rollos (natural + forzado): al menos una llamada al roll de tier.
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});