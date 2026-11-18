import { EFFECTS, FLOW_PALETTES, GridSink, effectForPetAction, renderFrame } from '@pockai/scene/effects';

/**
 * Los efectos de Pockai viven en el paquete compartido @pockai/scene (escritorio, Android y, cuando
 * exista, iOS). La web aún no los muestra, pero debe poder importarlos con su propia toolchain:
 * este test lo garantiza pintando un frame en memoria.
 */
describe('efectos compartidos en la web', () => {
  it('importa el registro y pinta un frame del portal en memoria', () => {
    const def = EFFECTS['portal-nexo'];
    const sink = new GridSink(def.width, def.height);
    renderFrame(def, sink, { phase: 'hold', t: 0, elapsedMs: 0 }, FLOW_PALETTES['water'], 1);
    expect(sink.count()).toBeGreaterThan(100);
  });

  it('usa la misma tabla de reacciones que el resto de plataformas', () => {
    expect(effectForPetAction('level_up', { level: 3 })?.id).toBe('resonancia');
  });
});
