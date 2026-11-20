import { describe, expect, it, vi } from 'vitest';
import {
  emptyMixer,
  isAudible,
  nextTrack,
  parseMixer,
  setLayerVolume,
  setPlaying,
  setTrack,
  syncMixer,
  toggleLayer,
  wantedLoops,
} from './mixer';
import { defaultAudioSettings, effectiveBusGain, playerBusGain } from './settings';

describe('mezclador del MP3 (spec 42)', () => {
  it('capas que se suman, cada una con su volumen; encender una arranca el reproductor', () => {
    let s = toggleLayer(emptyMixer(), 'rain');
    s = toggleLayer(s, 'thunder');
    s = setLayerVolume(s, 'thunder', 0.3);
    expect(s.playing).toBe(true);
    expect(s.layers).toEqual({ rain: 0.6, thunder: 0.3 });
    s = toggleLayer(s, 'rain');
    expect(s.layers).toEqual({ thunder: 0.3 });
    // volumen de una capa apagada: no hace nada
    expect(setLayerVolume(s, 'birds', 1)).toBe(s);
  });

  it('un solo tema a la vez y «siguiente» da la vuelta', () => {
    let s = setTrack(emptyMixer(), 'music.lofi.bits');
    expect(s.playing).toBe(true);
    s = nextTrack(s);
    expect(s.track).toBe('music.lofi.night');
    expect(nextTrack(emptyMixer()).track).toBe('music.lofi.night');
  });

  it('en pausa no pide ningún loop; sonando, el tema y las capas', () => {
    const s = toggleLayer(setTrack(emptyMixer(), 'music.lofi.tea'), 'wind');
    expect([...wantedLoops(s).values()].map((x) => x.id).sort()).toEqual(['amb.mixer.wind', 'music.lofi.tea']);
    expect(wantedLoops(setPlaying(s, false)).size).toBe(0);
    expect(isAudible(setPlaying(s, false))).toBe(false);
  });

  it('el estado guardado se valida y nunca arranca solo', () => {
    expect(parseMixer({ playing: true, track: 'music.lofi.tea', layers: { rain: 2, nope: 1 }, trackVolume: 'x' })).toEqual({
      playing: false,
      track: 'music.lofi.tea',
      trackVolume: 0.8,
      layers: { rain: 1 },
    });
    expect(parseMixer('basura')).toEqual(emptyMixer());
  });

  it('syncMixer arranca lo que falta, ajusta volúmenes y para lo que sobra (sin tocar otros loops)', () => {
    const active = new Set(['mixer:layer:rain', 'mixer:layer:birds', 'amb.room']);
    const engine = {
      activeLoops: () => [...active],
      loop: vi.fn((id: string, o: any) => (active.add(o.key), true)),
      stopLoop: vi.fn((key: string) => active.delete(key)),
      setLoopVolume: vi.fn(),
    };
    let s = toggleLayer(toggleLayer(emptyMixer(), 'rain'), 'crickets');
    s = setLayerVolume(s, 'rain', 0.2);
    syncMixer(engine as any, s);
    expect(engine.stopLoop).toHaveBeenCalledWith('mixer:layer:birds', expect.any(Number));
    expect(engine.stopLoop).not.toHaveBeenCalledWith('amb.room', expect.anything());
    expect(engine.setLoopVolume).toHaveBeenCalledWith('mixer:layer:rain', 0.2);
    expect(engine.loop).toHaveBeenCalledWith('amb.mixer.crickets', expect.objectContaining({ key: 'mixer:layer:crickets', player: true }));
  });

  it('la música del reproductor suena en el escritorio aunque el bus música se calle allí', () => {
    const st = defaultAudioSettings('desktop');
    const env = { surface: 'desktop' as const, focused: false, visible: true };
    expect(effectiveBusGain(st, 'music', env)).toBe(0);
    expect(playerBusGain(st, 'music', env)).toBeGreaterThan(0);
    expect(playerBusGain({ ...st, busOn: { ...st.busOn, music: false } }, 'music', env)).toBe(0);
    expect(playerBusGain({ ...st, enabled: false }, 'ambient', env)).toBe(0);
  });
});
