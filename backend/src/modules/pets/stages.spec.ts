import { stageForLevel } from './stages';

describe('stageForLevel', () => {
  it('sigue los umbrales por defecto (juvenil 10, adulto 25) y nunca da la forma final', () => {
    expect(stageForLevel(1)).toBe('baby');
    expect(stageForLevel(9)).toBe('baby');
    expect(stageForLevel(10)).toBe('juvenile');
    expect(stageForLevel(24)).toBe('juvenile');
    expect(stageForLevel(25)).toBe('adult');
    expect(stageForLevel(100)).toBe('adult');
  });

  it('acepta los umbrales de balance.leveling.stages', () => {
    expect(stageForLevel(5, { baby: 1, juvenile: 5, adult: 8, final: 50 })).toBe('juvenile');
    expect(stageForLevel(8, { baby: 1, juvenile: 5, adult: 8, final: 50 })).toBe('adult');
  });
});
