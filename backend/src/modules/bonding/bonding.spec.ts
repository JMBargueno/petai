import {
  BONDING_TIER_ORDER,
  BondingTier,
  clampBonding,
  decayAmount,
  hoursBetween,
  interactionIncrement,
  isBondingTierAtLeast,
  round2,
  tierForValue,
  tierNameForValue,
} from './bonding';

/** Los tiers del contrato de la feature 006 (balance.bonding.tiers). */
const TIERS: BondingTier[] = [
  { id: 'acquainted', name: 'Acostumbrado', min: 0 },
  { id: 'companion', name: 'Compañero', min: 30 },
  { id: 'ally', name: 'Aliado', min: 60 },
  { id: 'soulmate', name: 'Alma gemela', min: 80 },
  { id: 'legend', name: 'Leyenda', min: 100 },
];

const CFG = { decayRatePerDay: 0.5, graceWindowHours: 24, decayStartHours: 48 };

describe('bonding (motor puro)', () => {
  describe('tierForValue', () => {
    // Cada frontera: el valor exacto al umbral entra en el rango superior
    it.each([
      [0, 'acquainted'],
      [29, 'acquainted'],
      [29.99, 'acquainted'],
      [30, 'companion'],
      [59, 'companion'],
      [60, 'ally'],
      [79, 'ally'],
      [80, 'soulmate'],
      [99, 'soulmate'],
      [100, 'legend'],
    ])('tierForValue(%i) = %s', (value, expected) => {
      expect(tierForValue(value, TIERS)).toBe(expected);
    });

    it('devuelve "acquainted" con tiers vacíos o undefined', () => {
      expect(tierForValue(50, [])).toBe('acquainted');
      expect(tierForValue(50, undefined as any)).toBe('acquainted');
    });

    it('no exige orden explícito: toma el min mayor que no supere el valor', () => {
      const shuffled = [...TIERS].reverse();
      expect(tierForValue(75, shuffled)).toBe('ally');
    });
  });

  describe('tierNameForValue', () => {
    it('devuelve el nombre display español del tier', () => {
      expect(tierNameForValue(30, TIERS)).toBe('Compañero');
      expect(tierNameForValue(100, TIERS)).toBe('Leyenda');
      expect(tierNameForValue(10, TIERS)).toBe('Acostumbrado');
    });

    it('devuelve "" con tiers vacíos', () => {
      expect(tierNameForValue(30, [])).toBe('');
    });
  });

  describe('clampBonding', () => {
    it('capa en 100', () => {
      expect(clampBonding(100.2)).toBe(100);
      expect(clampBonding(999)).toBe(100);
    });

    it('piso en 0', () => {
      expect(clampBonding(-0.5)).toBe(0);
      expect(clampBonding(-100)).toBe(0);
    });

    it('deja intacto el intervalo [0,100]', () => {
      expect(clampBonding(0)).toBe(0);
      expect(clampBonding(50.5)).toBe(50.5);
      expect(clampBonding(100)).toBe(100);
    });

    it('NaN se trata como 0', () => {
      expect(clampBonding(Number.NaN)).toBe(0);
    });
  });

  describe('decayAmount', () => {
    it('0 decaimiento en la ventana de gracia (< 24h)', () => {
      expect(decayAmount(0, CFG)).toBe(0);
      expect(decayAmount(1, CFG)).toBe(0);
      expect(decayAmount(23.99, CFG)).toBe(0);
    });

    it('0 decaimiento entre la gracia y el inicio (24h ≤ h ≤ 48h)', () => {
      expect(decayAmount(30, CFG)).toBe(0);
      expect(decayAmount(47.9, CFG)).toBe(0);
    });

    it('0 decaimiento a las 48h exactas', () => {
      expect(decayAmount(48, CFG)).toBe(0);
    });

    it('> 0 a partir de 48h y proporcional', () => {
      // 72h → (72 − 48)/24 días × 0.5/día = 0.5
      expect(decayAmount(72, CFG)).toBe(0.5);
    });

    it('crece linealmente con los días de abandono', () => {
      // 72h → 0.5; 96h → 1.0; 120h → 1.5
      expect(decayAmount(96, CFG)).toBe(1);
      expect(decayAmount(120, CFG)).toBe(1.5);
    });

    it('redondea a 2 decimales', () => {
      // 54h → 0.5 × 6/24 = 0.125 → 0.13 (redondeo a 2 dec.)
      expect(decayAmount(54, CFG)).toBe(0.13);
    });

    it('no decae con horas negativas o inválidas', () => {
      expect(decayAmount(-10, CFG)).toBe(0);
      expect(decayAmount(Number.NaN, CFG)).toBe(0);
    });
  });

  describe('round2', () => {
    it('redondea a 2 decimales', () => {
      expect(round2(0.125)).toBe(0.13);
      expect(round2(2.3456)).toBe(2.35);
      expect(round2(5)).toBe(5);
      expect(round2(0)).toBe(0);
    });
  });

  describe('hoursBetween', () => {
    it('devuelve horas con decimales entre dos instantes', () => {
      const from = new Date('2026-11-10T08:00:00Z');
      expect(hoursBetween(from, new Date('2026-11-10T09:30:00Z'))).toBe(1.5);
    });

    it('nunca es negativa', () => {
      const a = new Date('2026-11-10T08:00:00Z');
      expect(hoursBetween(a, new Date('2026-11-09T08:00:00Z'))).toBe(0);
    });
  });

  describe('isBondingTierAtLeast', () => {
    it('compara por orden canónico', () => {
      expect(isBondingTierAtLeast('ally', 'ally')).toBe(true);
      expect(isBondingTierAtLeast('soulmate', 'ally')).toBe(true);
      expect(isBondingTierAtLeast('companion', 'ally')).toBe(false);
      expect(isBondingTierAtLeast('acquainted', 'companion')).toBe(false);
      expect(isBondingTierAtLeast('legend', 'legend')).toBe(true);
    });

    it('tiers desconocidos o undefined no alcanzan ningún umbral (salvo el más bajo)', () => {
      expect(isBondingTierAtLeast(undefined, 'companion')).toBe(false);
      expect(isBondingTierAtLeast(undefined, 'acquainted')).toBe(true);
      expect(isBondingTierAtLeast('whatever', 'ally')).toBe(false);
    });

    it('orden canónico completo', () => {
      expect(BONDING_TIER_ORDER).toEqual(['acquainted', 'companion', 'ally', 'soulmate', 'legend']);
    });
  });

  describe('interactionIncrement', () => {
    const cfg = { interactions: { feed: 2, sleep: 0.5, chat: 1 } } as any;

    it('devuelve el incremento del tipo conocido', () => {
      expect(interactionIncrement(cfg, 'feed')).toBe(2);
      expect(interactionIncrement(cfg, 'sleep')).toBe(0.5);
    });

    it('devuelve null para tipos desconocidos o sin balance', () => {
      expect(interactionIncrement(cfg, 'hack')).toBeNull();
      expect(interactionIncrement({ interactions: {} } as any, 'feed')).toBeNull();
    });
  });
});
