import * as fs from 'fs';
import * as path from 'path';
import { Dims } from './mind.types';
import { nextValence } from './memory.engine';
import { neutralDims } from './personality.engine';
import {
  SCENE_TYPES,
  SceneActor,
  SceneInput,
  SocialConfig,
  Stage,
  floorValence,
  nextStage,
  resolveScene,
  sceneCandidates,
  sceneSeed,
} from './social.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.social as SocialConfig;

const actor = (petId: string, over: Partial<SceneActor> = {}, dims: Partial<Dims> = {}): SceneActor => ({
  petId,
  name: petId === 'a' ? 'Brasa' : 'Lumo',
  ownerName: petId === 'a' ? 'Ana' : 'Luis',
  energy: 70,
  ...over,
  dims: { ...neutralDims(), ...dims },
});

const input = (over: Partial<SceneInput> = {}): SceneInput => ({ host: actor('a'), guest: actor('b'), stage: 'stranger', slot: 1, ...over });

describe('Social Engine — relación por etapas (spec 37 §6.1)', () => {
  it('subir de etapa exige varios encuentros, no uno', () => {
    // Lo que hace `feel` en cada visita: la valencia sube despacio y la familiaridad, +0,05
    let valence = 0;
    let familiarity = 0.35;
    let stage: Stage = 'stranger';
    const reached: Record<string, number> = {};
    for (let visit = 1; visit <= 30; visit++) {
      valence = nextValence(valence, 0.1);
      familiarity = Math.min(1, familiarity + 0.05);
      stage = nextStage(stage, valence, familiarity, cfg);
      reached[stage] ??= visit;
    }
    expect(reached.acquaintance).toBeGreaterThanOrEqual(2);
    expect(reached.friend).toBeGreaterThan(reached.acquaintance);
    expect(reached.best_friend).toBeGreaterThan(reached.friend);
    expect(reached.friend).toBeGreaterThanOrEqual(4);
  });

  it('una valencia que oscila alrededor del umbral no cambia de etapa', () => {
    const { enterValence, exitValence, familiarity } = cfg.stages.friend;
    const mid = (enterValence + exitValence) / 2;
    // Desde abajo: mientras no supere el umbral de entrada sigue siendo conocido
    let stage: Stage = 'acquaintance';
    for (const v of [mid, mid + 0.02, mid - 0.02, mid]) stage = nextStage(stage, v, familiarity, cfg);
    expect(stage).toBe('acquaintance');
    // Desde arriba: mientras no caiga del umbral de salida sigue siendo amigo
    stage = 'friend';
    for (const v of [mid, mid + 0.02, mid - 0.02, mid]) stage = nextStage(stage, v, familiarity, cfg);
    expect(stage).toBe('friend');
  });

  it('baja de etapa al caer del umbral de salida, y de conocido no vuelve a desconocido', () => {
    expect(nextStage('best_friend', cfg.stages.best_friend.exitValence - 0.01, 1, cfg)).toBe('friend');
    expect(nextStage('friend', cfg.stages.friend.exitValence - 0.01, 1, cfg)).toBe('acquaintance');
    expect(nextStage('acquaintance', -1, 1, cfg)).toBe('acquaintance');
  });

  it('no se hace amigo de alguien con quien se lleva mal, por mucho que se vean', () => {
    expect(nextStage('acquaintance', 0, 1, cfg)).toBe('acquaintance');
  });

  it('es función pura de la fila: misma entrada, misma etapa', () => {
    expect(nextStage(null, 0.3, 0.7, cfg)).toBe(nextStage(null, 0.3, 0.7, cfg));
    expect(nextStage(undefined, 0, 0.3, cfg)).toBe('stranger');
  });

  it('la relación entre dos Pockai tiene suelo', () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = floorValence(nextValence(v, -0.2), cfg);
    expect(v).toBe(cfg.valenceFloor);
    expect(floorValence(0.5, cfg)).toBe(0.5);
  });
});

describe('Social Engine — escenas entre dos Pockai (spec 37 §6.3)', () => {
  it('misma pareja y ranura dan la misma escena, sea quien sea el anfitrión', () => {
    expect(sceneSeed('a', 'b', 3)).toBe(sceneSeed('b', 'a', 3));
    const one = resolveScene(input({ slot: 3 }), cfg);
    expect(resolveScene(input({ slot: 3 }), cfg)).toEqual(one);
    const swapped = resolveScene(input({ slot: 3, host: actor('b'), guest: actor('a') }), cfg);
    expect(swapped.type).toBe(one.type);
  });

  it('cada mascota recibe un recuerdo distinto del mismo encuentro', () => {
    const scene = resolveScene(input({ slot: 0 }), cfg);
    expect(scene.type).toBe('greet');
    expect(scene.host.episode).not.toBe(scene.guest.episode);
    // Cada uno nombra al otro y a su entrenador, no a sí mismo
    expect(scene.host.episode).toContain('Lumo');
    expect(scene.guest.episode).toContain('Brasa');
    expect(scene.host.episode).not.toContain('{');
  });

  it('el encuentro entre amigos no se cuenta como el primero entre desconocidos', () => {
    const first = resolveScene(input({ slot: 0, stage: 'stranger' }), cfg);
    const fifth = resolveScene(input({ slot: 0, stage: 'friend' }), cfg);
    expect(fifth.type).toBe(first.type);
    expect(fifth.host.episode).not.toBe(first.host.episode);
  });

  it('en distintas ranuras de una visita pasan cosas distintas', () => {
    const types = new Set<string>();
    let previous = null as SceneInput['previous'];
    for (let slot = 0; slot < 12; slot++) {
      const scene = resolveScene(input({ slot, stage: 'friend', previous }), cfg);
      types.add(scene.type);
      previous = scene.type;
    }
    expect(types.size).toBeGreaterThanOrEqual(3);
  });

  it('presentarse solo ocurre al llegar', () => {
    expect(sceneCandidates(input({ slot: 0 }), cfg).map((c) => c.type)).toContain('greet');
    expect(sceneCandidates(input({ slot: 1 }), cfg).map((c) => c.type)).not.toContain('greet');
  });

  it('compartir comida es cosa de amigos', () => {
    const types = (stage: Stage) => sceneCandidates(input({ stage }), cfg).map((c) => c.type);
    expect(types('acquaintance')).not.toContain('share_food');
    expect(types('friend')).toContain('share_food');
  });

  it('solo discuten dos Pockai de mucho genio, y solo se reconcilian después de discutir', () => {
    const calm = sceneCandidates(input(), cfg).map((c) => c.type);
    expect(calm).not.toContain('squabble');
    expect(calm).not.toContain('make_up');
    const fiery = input({ host: actor('a', {}, { temper: 90 }), guest: actor('b', {}, { temper: 80 }) });
    expect(sceneCandidates(fiery, cfg).map((c) => c.type)).toContain('squabble');
    // Uno solo con genio no basta
    const oneSided = input({ host: actor('a', {}, { temper: 95 }) });
    expect(sceneCandidates(oneSided, cfg).map((c) => c.type)).not.toContain('squabble');
    expect(sceneCandidates({ ...fiery, previous: 'squabble' }, cfg).map((c) => c.type)).toContain('make_up');
  });

  it('una discusión empeora la relación y hacer las paces la mejora', () => {
    expect(cfg.scenes.squabble.delta).toBeLessThan(0);
    expect(cfg.scenes.make_up.delta).toBeGreaterThan(Math.abs(cfg.scenes.squabble.delta));
    const fiery = input({ host: actor('a', {}, { temper: 95 }), guest: actor('b', {}, { temper: 95 }), previous: 'squabble' });
    let madeUp = 0;
    for (let slot = 1; slot <= 40; slot++) if (resolveScene({ ...fiery, slot }, cfg).type === 'make_up') madeUp++;
    // Tras un pique, lo normal es reconciliarse
    expect(madeUp).toBeGreaterThan(20);
  });

  it('sin energía no juegan a perseguirse; cansados, se echan la siesta', () => {
    const tired = input({ host: actor('a', { energy: 20 }), guest: actor('b', { energy: 25 }) });
    const types = sceneCandidates(tired, cfg).map((c) => c.type);
    expect(types).not.toContain('play_tag');
    expect(types).toContain('nap_together');
    expect(sceneCandidates(input(), cfg).map((c) => c.type)).not.toContain('nap_together');
  });

  it('la personalidad de los dos inclina la balanza', () => {
    const count = (dims: Partial<Dims>, type: string) => {
      let n = 0;
      for (let slot = 1; slot <= 300; slot++) {
        const s = input({ slot, host: actor('a', {}, dims), guest: actor('b', {}, dims) });
        if (resolveScene(s, cfg).type === type) n++;
      }
      return n;
    };
    expect(count({ curiosity: 95, temper: 20 }, 'explore_together')).toBeGreaterThan(count({ curiosity: 5, temper: 20 }, 'explore_together'));
    expect(count({ sociability: 90, temper: 60 }, 'play_tag')).toBeGreaterThan(count({ sociability: 10, temper: 10 }, 'play_tag'));
  });

  it('siempre hay alguna escena posible y todas tienen textos para los dos papeles', () => {
    for (const stage of ['stranger', 'acquaintance', 'friend', 'best_friend'] as Stage[]) {
      for (const energy of [5, 50, 100]) {
        const s = input({ stage, host: actor('a', { energy }), guest: actor('b', { energy }) });
        expect(sceneCandidates(s, cfg).length).toBeGreaterThan(0);
      }
    }
    for (const type of SCENE_TYPES) {
      const scene = resolveScene(input({ slot: 0 }), { ...cfg, scenes: { ...cfg.scenes, [type]: { base: 1e9, delta: cfg.scenes[type].delta } } });
      expect(scene.type).toBe(type);
      expect(scene.host.episode.length).toBeGreaterThan(10);
      expect(scene.guest.episode.length).toBeGreaterThan(10);
    }
  });
});
