import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlayGate, pickVariant } from './gate';
import { busForId, normalizeManifest, sourcesFromFiles } from './manifest';
import { computeVoice, MAX_RATE, MIN_RATE, speciesDetune, type Element, type VoiceStage } from './profiles';
import { defaultAudioSettings, effectiveBusGain, parseAudioSettings } from './settings';
import { SoundEngine } from './engine';
import { SYNTHS, pentatonic } from './synth';

const manifestRaw = JSON.parse(readFileSync(resolve(__dirname, '../../game-data/sounds.json'), 'utf8'));

describe('manifiesto', () => {
  it('sounds.json es válido y cada synth tiene receta', () => {
    const { manifest, errors } = normalizeManifest(manifestRaw);
    expect(errors).toEqual([]);
    expect(manifest.sounds.size).toBeGreaterThan(200);
    for (const d of manifest.sounds.values()) if (d.source === 'synth') expect(SYNTHS[d.id], d.id).toBeTypeOf('function');
  });

  it('hereda defaults del bus y añade el style al prompt', () => {
    const { manifest } = normalizeManifest({
      version: 1,
      style: { ui: 'soft' },
      defaults: { ui: { gainDb: -12 } },
      sounds: [{ id: 'ui.tap', prompt: 'tap' }],
    });
    const d = manifest.sounds.get('ui.tap')!;
    expect(d.bus).toBe('ui');
    expect(d.gainDb).toBe(-12);
    expect(d.prompt).toBe('tap, soft');
  });

  it('detecta errores sin lanzar', () => {
    const { errors } = normalizeManifest({
      version: 1,
      sounds: [{ id: 'ui.tap', prompt: 'a' }, { id: 'ui.tap', prompt: 'b' }, { id: 'Malo' }, { id: 'sfx.x', prompt: 'x', duration: 60 }],
    });
    expect(errors.some((e) => e.includes('duplicado'))).toBe(true);
    expect(errors.some((e) => e.includes('id inválido'))).toBe(true);
    expect(errors.some((e) => e.includes('duration'))).toBe(true);
  });

  it('el bus sale del prefijo', () => {
    expect(busForId('ui.tap')).toBe('ui');
    expect(busForId('pet.eat.crunch')).toBe('pet');
    expect(busForId('wx.rain')).toBe('ambient');
    expect(busForId('mg.reflex.hit')).toBe('sfx');
  });

  it('sourcesFromFiles agrupa y ordena tomas, prefiere m4a', () => {
    const s = sourcesFromFiles({
      '../assets/audio/pet/pet.step_2.m4a': 'u2',
      '../assets/audio/pet/pet.step_1.m4a': 'u1',
      '../assets/audio/pet/pet.step_1.ogg': 'o1',
      'otro/fichero.png': 'x',
    });
    expect(s.get('pet.step')).toEqual(['u1', 'u2']);
    expect(s.size).toBe(1);
  });
});

describe('perfiles de voz', () => {
  const fixed = () => 0.5; // spread = 0

  it('la etapa cambia la velocidad: baby más agudo que final', () => {
    const baby = computeVoice('creature', { stage: 'baby' }, fixed);
    const final = computeVoice('creature', { stage: 'final' }, fixed);
    expect(baby.rate).toBeGreaterThan(final.rate);
  });

  it('cada especie tiene un desafinado estable', () => {
    expect(speciesDetune('ignisaur')).toBe(speciesDetune('ignisaur'));
    expect(Math.abs(speciesDetune('ignisaur'))).toBeLessThanOrEqual(300);
    const set = new Set(['ignisaur', 'axolunar', 'florabud', 'livolt', 'inktopus', 'solarejo'].map(speciesDetune));
    expect(set.size).toBeGreaterThan(2);
  });

  it('el rate final siempre queda en 0.5–2 con cualquier combinación', () => {
    const stages: VoiceStage[] = ['egg', 'baby', 'juvenile', 'adult', 'final'];
    const elements: Element[] = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'];
    for (const stage of stages)
      for (const element of elements)
        for (const r of [0, 1])
          for (const mood of ['happy', 'sick'] as const) {
            const v = computeVoice('creature-voice', { stage, element, mood, species: 'primpulso' }, () => r);
            expect(v.rate).toBeGreaterThanOrEqual(MIN_RATE);
            expect(v.rate).toBeLessThanOrEqual(MAX_RATE);
          }
  });

  it('el elemento añade su color y la rareza su reverb', () => {
    const water = computeVoice('creature', { element: 'water' }, fixed);
    expect(water.fx.some((f) => f.kind === 'biquad' && f.type === 'lowpass')).toBe(true);
    const mythic = computeVoice('creature', { rarity: 'mythic' }, fixed);
    const normal = computeVoice('creature', { rarity: 'normal' }, fixed);
    expect(mythic.reverb).toBeGreaterThan(normal.reverb);
  });

  it('none no toca nada', () => {
    expect(computeVoice('none', { stage: 'baby', element: 'fire' })).toEqual({ rate: 1, detune: 0, gainDb: 0, fx: [], reverb: 0 });
  });
});

describe('ajustes', () => {
  it('parseAudioSettings limita y completa', () => {
    const s = parseAudioSettings({ master: 3, buses: { ui: -1 }, enabled: 'sí' }, 'desktop');
    expect(s.master).toBe(1);
    expect(s.buses.ui).toBe(0);
    expect(s.enabled).toBe(true);
    expect(s.muteWhenUnfocused).toBe(false);
    expect(s.buses.pet).toBe(0.5);
    expect(parseAudioSettings('no es json')).toEqual(defaultAudioSettings());
  });

  it('en el escritorio suena la mascota pero no la interfaz ni (por defecto) el ambiente', () => {
    const s = defaultAudioSettings('desktop');
    const desk = { surface: 'desktop', focused: false, visible: true } as const;
    expect(effectiveBusGain(s, 'ui', desk)).toBe(0);
    expect(effectiveBusGain(s, 'pet', desk)).toBeGreaterThan(0);
    expect(effectiveBusGain(s, 'ambient', desk)).toBe(0);
    expect(effectiveBusGain({ ...s, petOnDesktop: false }, 'sfx', desk)).toBe(0);
    expect(effectiveBusGain({ ...s, muteWhenUnfocused: true }, 'pet', desk)).toBe(0);
    expect(effectiveBusGain(s, 'ui', { surface: 'app', focused: true, visible: true })).toBeGreaterThan(0);
    expect(effectiveBusGain({ ...s, enabled: false }, 'ui', { surface: 'app', focused: true, visible: true })).toBe(0);
    expect(effectiveBusGain(s, 'ui', { surface: 'app', focused: true, visible: false })).toBe(0);
  });
});

describe('control de saturación', () => {
  it('cooldown por id y límite de voces por bus', () => {
    const g = new PlayGate({ ui: 2, sfx: 8, pet: 3, ambient: 6, music: 1 });
    expect(g.canPlay('ui.tap', 'ui', 100, 0)).toBe(true);
    g.started('ui.tap', 'ui', 0);
    expect(g.canPlay('ui.tap', 'ui', 100, 50)).toBe(false);
    expect(g.canPlay('ui.tap', 'ui', 100, 150)).toBe(true);
    g.started('ui.tab', 'ui', 10);
    expect(g.canPlay('ui.confirm', 'ui', 0, 20)).toBe(false);
    g.ended('ui');
    expect(g.canPlay('ui.confirm', 'ui', 0, 20)).toBe(true);
  });

  it('pickVariant no repite la anterior', () => {
    for (let i = 0; i < 50; i++) {
      const r = Math.random();
      expect(pickVariant(3, 1, () => r)).not.toBe(1);
    }
    expect(pickVariant(1, 0)).toBe(0);
  });

  it('pentatónica sube con el índice', () => {
    expect(pentatonic(0)).toBeCloseTo(440);
    expect(pentatonic(5)).toBeCloseTo(880);
    expect(pentatonic(3)).toBeGreaterThan(pentatonic(2));
  });
});

describe('motor sin WebAudio', () => {
  const { manifest } = normalizeManifest(manifestRaw);

  it('sin AudioContext no falla y no suena', async () => {
    const e = new SoundEngine({ manifest, sources: new Map([['ui.tap', ['x.m4a']]]), createContext: () => null });
    await e.unlock();
    expect(e.play('ui.tap')).toBe(false);
    expect(e.loop('hab.sala')).toBe(false);
    e.dispose();
  });

  it('has(): solo con fichero o receta, y según la plataforma', () => {
    const sources = new Map([['ui.tap', ['x.m4a']], ['desk.peek', ['y.m4a']]]);
    const scene = new SoundEngine({ manifest, sources, createContext: () => null });
    expect(scene.has('ui.tap')).toBe(true);
    expect(scene.has('pet.step')).toBe(false); // aún sin fichero
    expect(scene.has('mg.cifrado.glyph')).toBe(true); // synth
    expect(scene.has('desk.peek')).toBe(false); // solo escritorio
    const desk = new SoundEngine({ manifest, sources, platform: 'desktop', createContext: () => null });
    expect(desk.has('desk.peek')).toBe(true);
    expect(desk.has('ui.tap')).toBe(true);
  });
});

describe('interruptor por tipo de sonido', () => {
  it('apagar un tipo lo silencia sin tocar los demás, y se guarda al parsear', () => {
    const s = parseAudioSettings({ busOn: { ambient: false } });
    expect(s.busOn).toMatchObject({ ambient: false, pet: true, ui: true, sfx: true });
    const env = { surface: 'app', focused: true, visible: true } as const;
    expect(effectiveBusGain(s, 'ambient', env)).toBe(0);
    expect(effectiveBusGain(s, 'pet', env)).toBeGreaterThan(0);
    expect(parseAudioSettings({ busOn: { ui: 'no' } }).busOn.ui).toBe(true);
  });
});
