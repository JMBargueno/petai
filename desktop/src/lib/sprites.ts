// Carga e indexación de sprites SVG compartidos
import ignisaurIdle from '@shared/assets/sprites/ignisaur_idle.svg?raw';
import ignisaurEat from '@shared/assets/sprites/ignisaur_eat.svg?raw';
import ignisaurHappy from '@shared/assets/sprites/ignisaur_happy.svg?raw';
import ignisaurSleep from '@shared/assets/sprites/ignisaur_sleep.svg?raw';

import axolunarIdle from '@shared/assets/sprites/axolunar_idle.svg?raw';
import axolunarEat from '@shared/assets/sprites/axolunar_eat.svg?raw';
import axolunarHappy from '@shared/assets/sprites/axolunar_happy.svg?raw';
import axolunarSleep from '@shared/assets/sprites/axolunar_sleep.svg?raw';

import florabudIdle from '@shared/assets/sprites/florabud_idle.svg?raw';
import florabudEat from '@shared/assets/sprites/florabud_eat.svg?raw';
import florabudHappy from '@shared/assets/sprites/florabud_happy.svg?raw';
import florabudSleep from '@shared/assets/sprites/florabud_sleep.svg?raw';

import patternSpots from '@shared/assets/sprites/pattern_spots.svg?raw';
import patternStripes from '@shared/assets/sprites/pattern_stripes.svg?raw';
import patternGradient from '@shared/assets/sprites/pattern_gradient.svg?raw';
import patternScales from '@shared/assets/sprites/pattern_scales.svg?raw';

import eggClosed from '@shared/assets/sprites/egg_closed.svg?raw';
import eggCracked from '@shared/assets/sprites/egg_cracked.svg?raw';

export const spriteLibrary: Record<string, Record<string, string>> = {
  ignisaur: {
    idle: ignisaurIdle,
    walk: ignisaurIdle,
    eat: ignisaurEat,
    happy: ignisaurHappy,
    sleep: ignisaurSleep,
  },
  axolunar: {
    idle: axolunarIdle,
    walk: axolunarIdle,
    eat: axolunarEat,
    happy: axolunarHappy,
    sleep: axolunarSleep,
  },
  florabud: {
    idle: florabudIdle,
    walk: florabudIdle,
    eat: florabudEat,
    happy: florabudHappy,
    sleep: florabudSleep,
  },
};

export const patternLibrary: Record<string, string> = {
  spots: patternSpots,
  stripes: patternStripes,
  gradient: patternGradient,
  scales: patternScales,
};

export const eggLibrary = {
  closed: eggClosed,
  cracked: eggCracked,
};

export function getPetSvg(speciesKey: string, animation: string): string {
  const sp = spriteLibrary[speciesKey] || spriteLibrary.ignisaur;
  return sp[animation] || sp.idle;
}

export function getPatternSvg(patternKey: string): string | null {
  return patternLibrary[patternKey] || null;
}
