import { describe, expect, it } from 'vitest';
import { EMOTE_EMOJI, LOCAL_ACTIONS, ReactionDeduper, reactionForAction, reactionForBehavior, reactionForClanGoal, reactionForSiblingHatch } from './eventMap';
import { PET_ACTIONS, isPetActionEvent } from './petActions';
import { getAnimLibrary } from '../sprites';
import { ACTIONS_WITH_CLIPS } from '@pockai/scene/effects';

describe('reactionForAction', () => {
  it('la tabla compartida de clips cubre todas las acciones del backend', () => {
    expect([...ACTIONS_WITH_CLIPS].sort()).toEqual([...PET_ACTIONS].sort());
  });

  it('cada animación de cada reacción existe en las hojas de sprites', () => {
    const { library, aliases } = getAnimLibrary('axolunar');
    const contexts = [undefined, { won: true }, { draw: true }, { favorite: true }, { dailyCompleted: true }, { tier: 'emotional' }, { act: 'dance' }];
    for (const action of PET_ACTIONS) {
      for (const context of contexts) {
        const r = reactionForAction({ action, context });
        for (const anim of r?.anims ?? []) {
          expect(library[anim] ?? library[aliases[anim]], `${action} → ${anim}`).toBeTruthy();
        }
      }
    }
  });

  it('elige animación y bocadillo según el contexto', () => {
    expect(reactionForAction({ action: 'battle_defended', context: { won: true, attackerName: 'Ana' } })).toMatchObject({
      anims: ['hit', 'victory'],
      bubble: expect.stringContaining('Ana'),
    });
    expect(reactionForAction({ action: 'battle_defended', context: { won: false } })?.anims).toEqual(['hit', 'defeat']);
    expect(reactionForAction({ action: 'level_up', context: { level: 7 } })?.bubble).toContain('7');
    // Momentos grandes: llevan su efecto del escritorio con los datos del contexto
    expect(reactionForAction({ action: 'level_up', context: { level: 7 } })?.effect).toEqual({ id: 'resonancia', params: { level: 7 } });
    expect(reactionForAction({ action: 'evolved', context: { stage: 'adult' } })?.effect).toEqual({ id: 'capullo-telar', params: { stage: 'adult' } });
    expect(reactionForAction({ action: 'fed' })?.effect).toBeUndefined();
    expect(reactionForAction({ action: 'hatched', context: { rarity: 'mythic', shiny: true, pity: 'legendary' } })?.effect).toEqual({
      id: 'revelacion-densidad',
      params: { rarity: 'mythic', shiny: 1, pity: 'legendary' },
    });
    expect(reactionForAction({ action: 'welcome_back', context: { tier: 'sad' } })).toMatchObject({
      anims: ['cry'],
      effect: { id: 'descarga-calida', params: { tier: 'sad' } },
    });
    // Tercera tanda: rango del logro, arena, intensidad del Mood Theater y estados con efecto
    expect(reactionForAction({ action: 'achievement', context: { name: 'X', tier: 'epic' } })?.effect).toEqual({ id: 'sello-logro', params: { tier: 'epic' } });
    expect(reactionForAction({ action: 'battle_lost' })?.effect).toEqual({ id: 'proyeccion-astral', params: { outcome: 'lost' } });
    expect(reactionForAction({ action: 'battle_defended', context: { draw: true } })?.effect?.params).toEqual({ outcome: 'draw' });
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'cry', intensity: 'soft' } })).toEqual({ anims: ['cry'] });
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'cry', intensity: 'normal' } })).toEqual({ anims: ['cry'], particle: '💧' });
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'dance', intensity: 'exaggerated' } })).toEqual({
      anims: ['dance', 'dance'],
      particle: '🎵',
      emphasis: true,
    });
    expect(reactionForAction({ action: 'slept' })).toEqual({ anims: [], sounds: ['pet.sleep.yawn'], effect: { id: 'desfragmentacion', params: {} } });
    expect(reactionForAction({ action: 'cleaned' })?.sounds).toEqual(['pet.clean.bubbles']);
    expect(reactionForAction({ action: 'fed' })?.sounds).toBeUndefined();
    expect(reactionForAction({ action: 'sick' })?.effect?.id).toBe('glitch-animo');
    expect(reactionForAction({ action: 'cleaned' })?.effect?.id).toBe('polvo-estatico');
    expect(reactionForAction({ action: 'care_received' })?.effect).toEqual({ id: 'paquete-hebra', params: { kind: 'care' } });
    expect(reactionForClanGoal('Visitas')).toMatchObject({ bubble: expect.stringContaining('Visitas'), effect: { id: 'trenza-juramento' } });
    // Nace otra de la colección: la activa lo presencia y la columna va a su lado, en el Flujo de la nueva
    expect(reactionForSiblingHatch({ nickname: 'Brote', rarity: 'rare', shiny: false, species: { element: 'water' } })).toMatchObject({
      anims: ['surprised', 'happy'],
      bubble: expect.stringContaining('Brote'),
      effect: { id: 'revelacion-densidad', params: { rarity: 'rare', shiny: 0, element: 'water', beside: 1 } },
    });
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'cry' } })?.anims).toEqual(['cry']);
    expect(reactionForAction({ action: 'mood_moment', context: { act: 'desconocido' } })).toBeNull();
    // friend_visit: el bocadillo usa el nombre del visitante cuando el contexto lo trae
    expect(reactionForAction({ action: 'friend_visit', context: { visitorName: 'Luis' } })?.bubble).toContain('Luis');
    expect(reactionForAction({ action: 'friend_visit' })?.bubble).toContain('amigo');
  });

  it('las acciones locales apuntan a acciones válidas', () => {
    for (const a of Object.values(LOCAL_ACTIONS)) expect(PET_ACTIONS).toContain(a);
  });
});

describe('reactionForBehavior', () => {
  const ACTIONS = ['comfort', 'celebrate', 'cuddle', 'invite_play', 'propose_explore', 'greet', 'wave_goodbye', 'listen', 'ask_back', 'sulk', 'show_off', 'yawn'];
  const ANIMATIONS = ['idle', 'happy', 'sleep'];

  it('solo lanza clips de acción que terminan, en todas las especies', () => {
    for (const species of ['axolunar', 'ignisaur', 'florabud']) {
      const { library, aliases } = getAnimLibrary(species);
      for (const action of ACTIONS) {
        for (const animation of ANIMATIONS) {
          for (const anim of reactionForBehavior({ action, animation, emote: null })?.anims ?? []) {
            const clip = library[anim] ?? library[aliases[anim]];
            expect(clip, `${species}: ${action}/${animation} → ${anim}`).toBeTruthy();
            expect(clip.loop, `${species}: ${anim} no debe ser un bucle`).toBe(false);
          }
        }
      }
    }
  });

  it('traduce animación y emote', () => {
    expect(reactionForBehavior({ action: 'greet', animation: 'happy', emote: 'wave' })).toEqual({ anims: ['happy'], particle: '👋' });
    expect(reactionForBehavior({ action: 'cuddle', animation: 'happy', emote: 'heart' })).toEqual({ anims: ['love'], particle: '❤️' });
    expect(reactionForBehavior({ action: 'yawn', animation: 'sleep', emote: 'zzz' })).toEqual({ anims: ['wake'], particle: '💤' });
    expect(reactionForBehavior({ action: 'sulk', animation: 'idle', emote: 'tear' })).toEqual({ anims: [], particle: '💧' });
    for (const emote of Object.keys(EMOTE_EMOJI)) {
      expect(reactionForBehavior({ action: 'x', animation: 'idle', emote })?.particle).toBe(EMOTE_EMOJI[emote]);
    }
  });

  it('no rompe si behavior no viene o trae valores desconocidos', () => {
    expect(reactionForBehavior(undefined)).toBeNull();
    expect(reactionForBehavior(null)).toBeNull();
    expect(reactionForBehavior('happy')).toBeNull();
    expect(reactionForBehavior({ action: 'listen', animation: 'idle', emote: null })).toBeNull();
    expect(reactionForBehavior({ animation: 'bailar', emote: 'fuego' })).toBeNull();
    expect(reactionForBehavior({ animation: 'happy' })).toEqual({ anims: ['happy'] });
  });
});

describe('ReactionDeduper', () => {
  it('ignora la misma acción dentro de la ventana', () => {
    const d = new ReactionDeduper(1500);
    expect(d.shouldPlay('p1', 'fed', 1000)).toBe(true);
    expect(d.shouldPlay('p1', 'fed', 2000)).toBe(false);
    expect(d.shouldPlay('p2', 'fed', 2000)).toBe(true);
    expect(d.shouldPlay('p1', 'fed', 4000)).toBe(true);
  });
});

describe('isPetActionEvent', () => {
  it('valida la forma del evento', () => {
    expect(isPetActionEvent({ petId: 'x', action: 'fed' })).toBe(true);
    expect(isPetActionEvent({ petId: null, action: 'achievement' })).toBe(true);
    expect(isPetActionEvent({ petId: 'x', action: 'bailar' })).toBe(false);
    expect(isPetActionEvent(null)).toBe(false);
  });
});

describe('reactionForBehavior: el clip lo dice el servidor', () => {
  it('usa el clip de una pasada que manda el servidor', () => {
    expect(reactionForBehavior({ action: 'accept_treat', animation: 'happy', emote: 'heart', clip: 'eat' })).toEqual({ anims: ['eat'], particle: '❤️' });
    expect(reactionForBehavior({ action: 'perform_trick', animation: 'happy', emote: 'star', clip: 'dance' })?.anims).toEqual(['dance']);
    expect(reactionForBehavior({ action: 'hide', animation: 'idle', emote: null, clip: 'surprised' })).toEqual({ anims: ['surprised'] });
  });

  it('un bucle o un clip desconocido no se lanza como acción: se queda en la tabla de siempre', () => {
    expect(reactionForBehavior({ action: 'yawn', animation: 'sleep', emote: 'zzz', clip: 'tired' })).toEqual({ anims: ['wake'], particle: '💤' });
    expect(reactionForBehavior({ action: 'listen', animation: 'idle', emote: null, clip: 'idle_alt' })).toBeNull();
    expect(reactionForBehavior({ action: 'greet', animation: 'happy', emote: 'wave', clip: 'no_existe' })).toEqual({ anims: ['happy'], particle: '👋' });
  });

  it('todos los clips de una pasada existen y terminan en todas las especies', async () => {
    const { BEHAVIOR_ONE_SHOT } = await import('./eventMap');
    for (const species of ['axolunar', 'ignisaur', 'florabud']) {
      const { library, aliases } = getAnimLibrary(species);
      for (const name of BEHAVIOR_ONE_SHOT) {
        const clip = library[name] ?? library[aliases[name]];
        expect(clip, `${species}: ${name}`).toBeTruthy();
        expect(clip.loop, `${species}: ${name} no debe ser un bucle`).toBe(false);
      }
    }
  });
});
