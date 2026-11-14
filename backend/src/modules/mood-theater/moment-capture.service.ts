import { Injectable } from '@nestjs/common';

export type MoodAct = 'dance' | 'sing' | 'cry' | 'smoke' | 'glow' | 'yawn' | 'stretch';
export type MoodTrigger =
  | 'favorite_food'
  | 'happy_well_fed'
  | 'sad_sick'
  | 'battle_loss'
  | 'level_up'
  | 'low_energy'
  | 'wake_up';

export interface MoodPetLike {
  happiness: number;
  hunger: number;
  energy: number;
  health: number;
  sick: boolean;
  sleeping: boolean;
  bonding: number;
  personality?: { type?: string } | null;
}

export interface MoodContext {
  favoriteFood?: boolean;
  battleLost?: boolean;
  levelUp?: boolean;
  wokeUp?: boolean;
}

interface ActDef {
  act: MoodAct;
  duration: number;
  counted: boolean;
  trigger: MoodTrigger;
}

/**
 * Motor puro de "micro-actos" (feature 031, AC1). Evalúa el contexto y los vitals del
 * pet para decidir qué acto espontáneo (si alguno) se dispara, respetando el daily cap
 * de actos "countables". `rand` y `now` inyectables para tests determinísticos.
 */
@Injectable()
export class MomentCaptureService {
  readonly DAILY_CAP = 3;
  readonly COOLDOWN_MIN = 10;

  private readonly defs: Record<MoodAct, ActDef> = {
    dance: { act: 'dance', duration: 5, counted: false, trigger: 'favorite_food' },
    smoke: { act: 'smoke', duration: 4, counted: false, trigger: 'battle_loss' },
    glow: { act: 'glow', duration: 3, counted: false, trigger: 'level_up' },
    sing: { act: 'sing', duration: 6, counted: true, trigger: 'happy_well_fed' },
    cry: { act: 'cry', duration: 4, counted: true, trigger: 'sad_sick' },
    yawn: { act: 'yawn', duration: 4, counted: true, trigger: 'low_energy' },
    stretch: { act: 'stretch', duration: 3, counted: true, trigger: 'wake_up' },
  };

  /**
   * Decide el acto a mostrar. Devuelve `null` si no procede.
   * `actsCountedToday` = número de actos countables ya emitidos hoy (para el cap).
   */
  rollAct(
    pet: MoodPetLike,
    context: MoodContext = {},
    rand: () => number = Math.random,
    actsCountedToday = 0,
  ): { act: MoodAct; trigger: MoodTrigger; duration: number } | null {
    // Un pet durmiendo no hace actos (salvo stretch al despertar); enfermo no baila/canta.
    if (pet.sleeping) {
      if (context.wokeUp) return this.pick('stretch', 0.4, rand);
      return null;
    }

    // Eventos determinísticos (no cuentan para el cap, AC3).
    if (context.favoriteFood && pet.bonding >= 60 && !pet.sick) return this.def('dance');
    if (context.levelUp) return this.def('glow');
    if (context.battleLost) return this.pick('smoke', 0.8, rand);
    if (context.wokeUp) return this.pick('stretch', 0.4, rand);

    // Cap de actos espontáneos countables (AC3).
    if (actsCountedToday >= this.DAILY_CAP) return null;

    // Probabilísticos según vitals.
    if (pet.sick) {
      if (pet.happiness < 15 && pet.health < 30) return this.pick('cry', 0.3, rand);
      if (pet.energy < 20) return this.pick('yawn', 0.25, rand);
      return null;
    }
    if (pet.happiness > 85 && pet.hunger > 70) return this.pick('sing', 0.15, rand);
    if (pet.happiness < 15 && pet.health < 30) return this.pick('cry', 0.3, rand);
    if (pet.energy < 20) return this.pick('yawn', 0.25, rand);

    return null;
  }

  isCounted(act: MoodAct): boolean {
    return this.defs[act].counted;
  }

  /** Acto más "expresivo" según personalidad (AC9) — para hints de intensidad. */
  intensityFor(pet: MoodPetLike, act: MoodAct): 'soft' | 'normal' | 'exaggerated' {
    const t = pet.personality?.type;
    if (act === 'dance') return t === 'travieso' ? 'exaggerated' : t === 'tímido' ? 'soft' : 'normal';
    if (act === 'sing') return t === 'tímido' ? 'soft' : 'normal';
    if (act === 'glow') return t === 'orgullososo' || t === 'orgullosa' ? 'exaggerated' : 'normal';
    return 'normal';
  }

  private def(act: MoodAct) {
    return { act, trigger: this.defs[act].trigger, duration: this.defs[act].duration };
  }

  private pick(act: MoodAct, prob: number, rand: () => number) {
    return rand() < prob ? this.def(act) : null;
  }
}
