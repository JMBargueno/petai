/**
 * Qué animaciones (clips del Pockai) pone cada aviso `pet:action` del backend. Es la ÚNICA tabla:
 * el escritorio (eventMap) le añade bocadillos y partículas, y la escena incrustada (Android hoy,
 * iOS cuando exista) la reproduce en cola al recibir `petAction`. Hermana de `effectForPetAction`.
 *
 * `null` = ese aviso no tiene reacción; `[]` = reacción sin clip (p. ej. `slept`: el estado base
 * `sleep` ya pone el bucle y la reacción solo existe para llevar su efecto).
 */

type Ctx = Record<string, unknown> | null | undefined;

const str = (ctx: Ctx, key: string): string | undefined => {
  const v = ctx?.[key];
  return typeof v === 'string' && v ? v : undefined;
};

/** Actos del Mood Theater del backend → clip. */
export const MOOD_ACT_CLIPS: Record<string, string> = {
  dance: 'dance',
  sing: 'talk',
  cry: 'cry',
  smoke: 'defeat',
  glow: 'level_up',
  yawn: 'tired',
  stretch: 'wake',
};

function welcomeClips(tier: string | undefined): string[] {
  switch (tier) {
    case 'offended':
      return ['sad'];
    case 'sad':
      return ['cry'];
    case 'emotional':
      return ['cry', 'love'];
    default:
      return ['happy'];
  }
}

const TABLE: Record<string, (c: Ctx) => string[] | null> = {
  fed: (c) => (c?.['favorite'] ? ['eat', 'love'] : ['eat']),
  cleaned: () => ['clean', 'happy'],
  slept: () => [],
  woke: () => ['wake'],
  healed: () => ['heal', 'happy'],
  level_up: () => ['level_up'],
  evolved: () => ['evolution', 'celebrate'],
  hatched: () => ['summon', 'happy'],
  battle_won: () => ['attack', 'victory'],
  battle_lost: () => ['hit', 'defeat'],
  battle_defended: (c) => (c?.['draw'] ? ['surprised'] : c?.['won'] ? ['hit', 'victory'] : ['hit', 'defeat']),
  raid_attack: () => ['attack'],
  raid_victory: () => ['victory', 'celebrate'],
  tournament_win: () => ['victory', 'celebrate'],
  tournament_loss: () => ['defeat'],
  trained: (c) => (str(c, 'status') === 'failed' ? ['hit', 'sad'] : ['attack', 'victory']),
  cooked: () => ['eat', 'happy'],
  adventure: (c) => {
    const r = str(c, 'result');
    return r === 'win' ? ['celebrate'] : r === 'partial' ? ['happy'] : ['sad'];
  },
  minigame_finished: () => ['happy'],
  gift_received: () => ['surprised', 'love'],
  care_received: () => ['love'],
  chest_opened: () => ['surprised', 'celebrate'],
  mission_completed: (c) => (c?.['dailyCompleted'] ? ['celebrate'] : ['happy']),
  achievement: () => ['victory'],
  bonding_up: () => ['love'],
  bonding_down: () => ['sad'],
  ritual_completed: () => ['celebrate'],
  ritual_missed: () => ['sad'],
  mood_moment: (c) => {
    const act = str(c, 'act');
    const clip = act ? MOOD_ACT_CLIPS[act] : undefined;
    if (!clip) return null;
    // Exagerado: el acto dos veces
    return str(c, 'intensity') === 'exaggerated' ? [clip, clip] : [clip];
  },
  buddy_play: () => ['dance', 'happy'],
  friend_visit: () => ['surprised', 'happy'],
  welcome_back: (c) => welcomeClips(str(c, 'tier')),
  sick: () => ['sad'],
  vitals_critical: () => null, // el estado base (hungry/tired/sad) ya lo refleja
};

/** Clips de un aviso `pet:action`, en orden (o `null` si ese aviso no tiene reacción). */
export function clipsForPetAction(action: string, context?: Ctx): string[] | null {
  const fn = TABLE[action];
  return fn ? fn(context) : null;
}

/** Acciones con reacción (para tests de paridad con `PET_ACTIONS`). */
export const ACTIONS_WITH_CLIPS = Object.keys(TABLE);
