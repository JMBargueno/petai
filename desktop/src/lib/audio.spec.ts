import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { AUDIO_STORAGE_KEY, audioSettings, getSoundEngine, loadAudioSettings, sfx, updateAudioSettings } from './audio';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('ajustes de sonido del escritorio', () => {
  it('sin nada guardado usa los valores del escritorio', () => {
    const s = loadAudioSettings(memoryStorage());
    expect(s.enabled).toBe(true);
    expect(s.petOnDesktop).toBe(true);
    expect(s.ambientOnDesktop).toBe(false);
  });

  it('lee lo guardado y descarta valores raros', () => {
    const s = loadAudioSettings(memoryStorage({ [AUDIO_STORAGE_KEY]: JSON.stringify({ master: 0.2, buses: { pet: 9 } }) }));
    expect(s.master).toBe(0.2);
    expect(s.buses.pet).toBe(1);
  });

  it('actualizar mezcla, guarda y publica en el store', () => {
    const storage = memoryStorage();
    updateAudioSettings({ buses: { ...get(audioSettings).buses, ui: 0.1 } }, storage);
    const next = updateAudioSettings({ reduced: true }, storage);
    expect(next.buses.ui).toBe(0.1);
    expect(next.reduced).toBe(true);
    expect(get(audioSettings).reduced).toBe(true);
    expect(JSON.parse(storage.data[AUDIO_STORAGE_KEY]).buses.ui).toBe(0.1);
  });

  it('el motor carga el manifiesto y no falla sin WebAudio ni ficheros', () => {
    const engine = getSoundEngine();
    expect(engine.has('mg.cifrado.glyph')).toBe(true);
    expect(sfx('ui.tap')).toBe(false);
  });
});
