import * as fs from 'fs';
import * as path from 'path';
import { boostedRecovery, buffValue, computeActiveBuffs, reducedDecay } from './habitat-buffs';

const habitats = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/habitats.json'), 'utf8'),
);

describe('habitat-buffs (spec 10, cálculo puro con el game-data real)', () => {
  it('sin muebles no hay buffs', () => {
    expect(computeActiveBuffs([], habitats)).toEqual({});
  });

  it('un mueble de cada tipo suma exactamente cada tope (HAB-BUFFS)', () => {
    const all = habitats.furniture.map((f: any) => f.id);
    const buffs = computeActiveBuffs(all, habitats);
    expect(buffs.hygiene_decay_reduction).toBeCloseTo(habitats.buffCaps.hygiene_decay_reduction_max, 10);
    expect(buffs.happiness_decay_reduction).toBeCloseTo(habitats.buffCaps.happiness_decay_reduction_max, 10);
    expect(buffs.energy_recovery_boost).toBeCloseTo(habitats.buffCaps.energy_recovery_boost_max, 10);
    expect(buffs.combat_mood_bonus).toBeCloseTo(habitats.buffCaps.combat_mood_bonus_max, 10);
  });

  it('recorta al tope de buffCaps (claves con sufijo _max) cuando se repiten muebles', () => {
    // 3 × soft_bed = 0.45 de energy_recovery_boost (tope 0.4); 2 × final_garden + 2 × garden_pond = 0.44 de higiene (tope 0.4)
    const buffs = computeActiveBuffs(
      ['soft_bed', 'soft_bed', 'soft_bed', 'final_garden', 'final_garden', 'garden_pond', 'garden_pond'],
      habitats,
    );
    expect(buffs.energy_recovery_boost).toBe(0.4);
    expect(buffs.hygiene_decay_reduction).toBe(0.4);
    // happiness: 2 × 0.08 = 0.16, por debajo del tope 0.3 → sin recortar
    expect(buffs.happiness_decay_reduction).toBeCloseTo(0.16, 10);
    // 3 × final_throne = 0.18 de combat_mood_bonus (tope 0.1)
    expect(computeActiveBuffs(['final_throne', 'final_throne', 'final_throne'], habitats).combat_mood_bonus).toBe(0.1);
  });

  it('ignora muebles desconocidos y muebles sin buffs', () => {
    expect(computeActiveBuffs(['no_existe', 'wall_shelf', 'flower_pot'], habitats)).toEqual({});
  });

  it('reducedDecay / boostedRecovery aplican el porcentaje y sin buff dejan el valor igual', () => {
    expect(reducedDecay(2.5, {}, 'hygiene_decay_reduction')).toBe(2.5);
    expect(reducedDecay(2.5, { hygiene_decay_reduction: 0.4 }, 'hygiene_decay_reduction')).toBeCloseTo(1.5, 10);
    expect(boostedRecovery(20, undefined, 'energy_recovery_boost')).toBe(20);
    expect(boostedRecovery(20, { energy_recovery_boost: 0.2 }, 'energy_recovery_boost')).toBeCloseTo(24, 10);
  });

  it('buffValue acota a [0, 1]: un dato corrupto nunca invierte el efecto', () => {
    expect(buffValue({ hygiene_decay_reduction: -0.5 }, 'hygiene_decay_reduction')).toBe(0);
    expect(buffValue({ hygiene_decay_reduction: 3 }, 'hygiene_decay_reduction')).toBe(1);
    expect(buffValue({ hygiene_decay_reduction: NaN }, 'hygiene_decay_reduction')).toBe(0);
  });
});
