/**
 * Qué efecto acompaña a cada aviso `pet:action` del backend. Es la ÚNICA tabla: la usan el
 * escritorio (eventMap añade sus animaciones y bocadillos) y la escena incrustada (Android hoy, iOS
 * cuando exista) a través del mensaje `petAction` del protocolo. Así todas las plataformas
 * deciden igual qué se ve.
 */

export interface EffectRequest {
  id: string;
  params: Record<string, string | number>;
}

type Ctx = Record<string, unknown> | null | undefined;

const str = (ctx: Ctx, key: string): string | undefined => {
  const v = ctx?.[key];
  return typeof v === 'string' && v ? v : undefined;
};
const num = (ctx: Ctx, key: string): number | undefined => {
  const v = ctx?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

/** Datos del nacimiento para la revelación: densidad, Bendición del Prisma y Promesa del Telar. */
export function birthParams(c: Ctx): Record<string, string | number> {
  const pity = str(c, 'pity');
  return { rarity: str(c, 'rarity') ?? 'normal', shiny: c?.['shiny'] === true ? 1 : 0, ...(pity ? { pity } : {}) };
}

const astral = (outcome: 'won' | 'lost' | 'draw'): EffectRequest => ({ id: 'proyeccion-astral', params: { outcome } });

const TABLE: Record<string, (c: Ctx) => EffectRequest | null> = {
  level_up: (c) => {
    const level = num(c, 'level');
    const params: Record<string, string | number> = level ? { level } : {};
    return { id: 'resonancia', params };
  },
  evolved: (c) => {
    const stage = str(c, 'stage');
    const params: Record<string, string | number> = stage ? { stage } : {};
    return { id: 'capullo-telar', params };
  },
  hatched: (c) => ({ id: 'revelacion-densidad', params: birthParams(c) }),
  welcome_back: (c) => ({ id: 'descarga-calida', params: { tier: str(c, 'tier') ?? 'happy' } }),
  achievement: (c) => ({ id: 'sello-logro', params: { tier: str(c, 'tier') ?? 'common' } }),
  battle_won: () => astral('won'),
  battle_lost: () => astral('lost'),
  battle_defended: (c) => (c?.['draw'] ? astral('draw') : c?.['won'] ? astral('won') : astral('lost')),
  gift_received: () => ({ id: 'paquete-hebra', params: { kind: 'gift' } }),
  care_received: () => ({ id: 'paquete-hebra', params: { kind: 'care' } }),
  cleaned: () => ({ id: 'polvo-estatico', params: {} }),
  slept: () => ({ id: 'desfragmentacion', params: {} }),
  sick: () => ({ id: 'glitch-animo', params: {} }),
  // Cuarta tanda
  mission_completed: (c) => (c?.['dailyCompleted'] === true ? { id: 'confeti-codices', params: {} } : null),
  chest_opened: (c) => ({ id: 'cofre-tier', params: { type: str(c, 'type') ?? 'bronze', bestTier: str(c, 'bestTier') ?? 'common' } }),
  ritual_completed: () => ({ id: 'destello-ritual', params: {} }),
  raid_victory: (c) => ({ id: 'triunfo-raid', params: { element: str(c, 'element') ?? 'neutral', gems: num(c, 'gems') ?? 0 } }),
};

/** Efecto para un aviso `pet:action` (o `null` si ese momento no tiene efecto propio). */
export function effectForPetAction(action: string, context?: Ctx): EffectRequest | null {
  const fn = TABLE[action];
  return fn ? fn(context) : null;
}

/** Acciones que tienen efecto (para documentación y tests de paridad entre plataformas). */
export const ACTIONS_WITH_EFFECT = Object.keys(TABLE);
