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

describe('parseHostMessage (sala)', () => {
  const room = {
    id: 'sala',
    gridWidth: 14,
    gridHeight: 10,
    theme: null,
    items: [{ id: 'i1', furnitureId: 'soft_bed', x: 2, y: 3, rotation: 1 }],
    furniture: [{ id: 'soft_bed', footprint: [2, 1], mount: 'floor', interaction: 'sleep' }],
  };

  it('acepta setRoom válido y null', () => {
    expect(parseHostMessage({ type: 'setRoom', room })).toMatchObject({
      type: 'setRoom',
      room: { items: [{ rotation: 1 }], furniture: [{ footprint: [2, 1], interaction: 'sleep' }] },
    });
    expect(parseHostMessage({ type: 'setRoom', room: null })).toEqual({ type: 'setRoom', room: null });
  });

  it('rechaza salas mal formadas', () => {
    expect(parseHostMessage({ type: 'setRoom', room: { ...room, gridWidth: 0 } })).toBeNull();
    expect(
      parseHostMessage({ type: 'setRoom', room: { ...room, items: [{ id: 'x', furnitureId: 'y', x: -1, y: 0 }] } }),
    ).toBeNull();
  });

  it('valida actividad, noche, edición y selección', () => {
    expect(parseHostMessage({ type: 'setActivity', activity: 'sleep' })).toEqual({ type: 'setActivity', activity: 'sleep' });
    expect(parseHostMessage({ type: 'setActivity', activity: 'bailar' })).toBeNull();
    expect(parseHostMessage({ type: 'setNight', night: true })).toEqual({ type: 'setNight', night: true });
    expect(parseHostMessage({ type: 'setEditMode', edit: true })).toEqual({ type: 'setEditMode', edit: true });
    expect(parseHostMessage({ type: 'selectItem', itemId: null })).toEqual({ type: 'selectItem', itemId: null });
    expect(parseHostMessage({ type: 'rotateSelected' })).toEqual({ type: 'rotateSelected' });
  });
});
