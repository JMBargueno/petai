import { describe, expect, it } from 'vitest';
import { parseHostMessage } from './protocol';

describe('parseHostMessage', () => {
  it('acepta setPet como objeto o JSON y normaliza los campos opcionales', () => {
    const pet = { species: 'axolunar', palette: { primary: '#38A3A5', secondary: '#80ED99' } };
    const a = parseHostMessage({ type: 'setPet', pet });
    const b = parseHostMessage(JSON.stringify({ type: 'setPet', pet }));
    expect(a).toEqual(b);
    expect(a).toMatchObject({ type: 'setPet', pet: { stage: 'adult', pattern: null, visualSeed: 1337, shiny: false } });
  });

  it('rechaza mensajes desconocidos o mal formados', () => {
    expect(parseHostMessage('no-json')).toBeNull();
    expect(parseHostMessage({ type: 'borrarTodo' })).toBeNull();
    expect(parseHostMessage({ type: 'setPet', pet: { species: 'x' } })).toBeNull();
    expect(parseHostMessage({ type: 'setFacing', facing: 2 })).toBeNull();
  });

  it('valida playClip, setTheme, setPaused y setFacing', () => {
    expect(parseHostMessage({ type: 'playClip', clip: 'happy', once: true })).toEqual({ type: 'playClip', clip: 'happy', once: true });
    expect(parseHostMessage({ type: 'setTheme', mode: 'dark' })).toEqual({ type: 'setTheme', mode: 'dark' });
    expect(parseHostMessage({ type: 'setPaused', paused: true })).toEqual({ type: 'setPaused', paused: true });
    expect(parseHostMessage({ type: 'setFacing', facing: -1 })).toEqual({ type: 'setFacing', facing: -1 });
  });
});
