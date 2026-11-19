import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { clearVisitorTalk, optionIcon, visitorInteracted, visitorStageLabel, visitorTalk } from './visitDialog';

describe('menú de visita: textos del cliente', () => {
  it('dice en palabras lo que el Pockai siente por ti, y nada si la etapa no se conoce', () => {
    expect(visitorStageLabel('stranger')).toBe('Aún no te conoce');
    expect(visitorStageLabel('best_friend')).toBe('Te adora');
    expect(visitorStageLabel('rival')).toBe('');
    expect(visitorStageLabel(null)).toBe('');
  });

  it('una opción que este cliente no conoce se muestra igual, con un icono genérico', () => {
    expect(optionIcon('treat')).toBe('food');
    expect(optionIcon('opcion_del_futuro')).toBe('chat');
  });
});

describe('menú de visita: lo que ve el dueño', () => {
  const ev = { visitorId: 'u-2', petId: 'p-1', option: 'greet', line: 'Lumo te saluda contento.' };

  it('guarda la última interacción y la numera, para mostrarla aunque se repita', () => {
    visitorInteracted(ev);
    const first = get(visitorTalk)!;
    visitorInteracted(ev);
    expect(get(visitorTalk)!.n).toBe(first.n + 1);
    expect(get(visitorTalk)!.line).toBe(ev.line);
  });

  it('ignora eventos incompletos y recorta líneas desmesuradas', () => {
    visitorInteracted(ev);
    const before = get(visitorTalk);
    visitorInteracted(null);
    visitorInteracted({ ...ev, line: '' });
    visitorInteracted({ ...ev, visitorId: '' });
    expect(get(visitorTalk)).toBe(before);
    visitorInteracted({ ...ev, line: 'x'.repeat(2000) });
    expect(get(visitorTalk)!.line.length).toBe(300);
  });

  it('al irse ese visitante deja de mostrarse; si se va otro, no', () => {
    visitorInteracted(ev);
    clearVisitorTalk('u-9');
    expect(get(visitorTalk)).not.toBeNull();
    clearVisitorTalk('u-2');
    expect(get(visitorTalk)).toBeNull();
  });
});

describe('menú de visita: el clip de la reacción', () => {
  it('convierte la reacción en una orden para la sala y la numera, para relanzarla aunque se repita', async () => {
    const { clipCueOf } = await import('./visitDialog');
    const a = clipCueOf({ clip: 'eat' })!;
    const b = clipCueOf({ clip: 'eat' })!;
    expect(a.clip).toBe('eat');
    expect(b.n).toBeGreaterThan(a.n);
  });

  it('sin clip, o con algo que no es un nombre de clip, no hay orden', async () => {
    const { clipCueOf } = await import('./visitDialog');
    expect(clipCueOf(null)).toBeNull();
    expect(clipCueOf({})).toBeNull();
    expect(clipCueOf({ clip: 'eat; rm -rf' })).toBeNull();
    expect(clipCueOf({ clip: 'Happy' })).toBeNull();
  });
});
