import { describe, expect, it } from 'vitest';
import {
  altarSantuario,
  capulloTelar,
  chispaDespertar,
  clima,
  desfragmentacion,
  destelloPrisma,
  estelaFlujo,
  glitchAnimo,
  manitasEspirituales,
  paqueteHebra,
  polvoEstatico,
  polvoImpacto,
  proyeccionAstral,
  selloLogro,
  trenzaJuramento,
  descargaCalida,
  phasesOf,
  revelacionDensidad,
  FLOW_PALETTES,
  fixedDuration,
  GridSink,
  hebraInvocacion,
  portalNexo,
  renderFrame,
  resonancia,
  speciesElement,
  type EffectDef,
} from './index';
import { admitMoment } from './momentQueue';

const MOMENTS: EffectDef[] = [
  capulloTelar,
  resonancia,
  hebraInvocacion,
  revelacionDensidad,
  altarSantuario,
  descargaCalida,
  selloLogro,
  proyeccionAstral,
  trenzaJuramento,
  chispaDespertar,
  paqueteHebra,
  manitasEspirituales,
  glitchAnimo,
  polvoEstatico,
  desfragmentacion,
  polvoImpacto,
  estelaFlujo,
  destelloPrisma,
  clima,
];

function render(def: EffectDef, phase: string, t: number, opts: { el?: string; reduced?: boolean; ms?: number; params?: Record<string, string | number> } = {}) {
  const sink = new GridSink(def.width, def.height);
  renderFrame(def, sink, { phase, t, elapsedMs: opts.ms ?? 0 }, FLOW_PALETTES[opts.el ?? 'water'], 11, opts.reduced, opts.params);
  return sink;
}

describe.each(MOMENTS.map((d) => [d.id, d] as const))('efecto %s', (_id, def) => {
  it('cumple las reglas de la skill (rejilla, duración, fases reducidas)', () => {
    expect(def.width).toBeLessThanOrEqual(64);
    expect(def.height).toBeLessThanOrEqual(80);
    expect(Number.isInteger(def.scale)).toBe(true);
    expect(fixedDuration(def.phases)).toBeLessThanOrEqual(2500);
    expect(def.reducedPhases.map((p) => p.name)).toEqual(def.phases.map((p) => p.name));
    expect(fixedDuration(def.reducedPhases)).toBeLessThan(fixedDuration(def.phases));
  });

  it('usa como mucho 12 colores por frame en todos los Flujos', () => {
    for (const el of Object.keys(FLOW_PALETTES)) {
      for (const p of def.phases) {
        for (const t of [0.3, 0.7]) expect(render(def, p.name, t, { el }).colors().size).toBeLessThanOrEqual(12);
      }
    }
  });

  it('se queda quieto con movimiento reducido', () => {
    const hold = def.phases.find((p) => p.ms === 'hold')?.name ?? def.phases[Math.min(1, def.phases.length - 1)].name;
    expect(render(def, hold, 0, { reduced: true, ms: 0 }).cells).toEqual(render(def, hold, 0, { reduced: true, ms: 900 }).cells);
  });

  it('termina sin dejar casi nada pintado', () => {
    const last = def.phases[def.phases.length - 1].name;
    const full = Math.max(...def.phases.map((p) => render(def, p.name, 0.5).count()));
    expect(render(def, last, 1).count()).toBeLessThan(full * 0.15);
  });
});

describe('capullo del Telar', () => {
  it('en la espera tapa por completo el centro de la mascota', () => {
    const { x, y } = capulloTelar.points.center;
    const hold = render(capulloTelar, 'hold', 0);
    for (const [dx, dy] of [[0, 0], [-10, 0], [10, 0], [0, -18], [0, 18]]) expect(hold.get(x + dx, y + dy)).not.toBeNull();
  });
  it('la forma final lleva corona', () => {
    const plain = render(capulloTelar, 'hold', 0).count();
    expect(render(capulloTelar, 'hold', 0, { params: { stage: 'final' } }).count()).toBeGreaterThan(plain);
  });
});

describe('revelación de densidad', () => {
  it('sin garantía no hay Promesa y sin shiny no cae el Rayo', () => {
    const plain = phasesOf(revelacionDensidad, { rarity: 'rare', shiny: 0 }, false);
    expect(plain.find((p) => p.name === 'promise')?.ms).toBe(0);
    const full = phasesOf(revelacionDensidad, { rarity: 'mythic', shiny: 1, pity: 'legendary' }, false);
    expect(full.find((p) => p.name === 'promise')?.ms).toBeGreaterThan(0);
    expect(fixedDuration(full)).toBeLessThanOrEqual(2500);
    expect(fixedDuration(plain)).toBeLessThan(fixedDuration(full));
  });
  it('a más densidad, más anillos', () => {
    const normal = render(revelacionDensidad, 'density', 1, { params: { rarity: 'normal' } }).count();
    const mythic = render(revelacionDensidad, 'density', 1, { params: { rarity: 'mythic' } }).count();
    expect(mythic).toBeGreaterThan(normal);
  });
  it('el Rayo Cósmico usa la paleta invertida (Bendición del Prisma)', () => {
    const shiny = render(revelacionDensidad, 'prism', 0.7, { el: 'fire', params: { rarity: 'rare', shiny: 1 } });
    expect(shiny.colors()).toContain('#04b6fc'); // complementario del tono medio de fuego (#fb4903)
  });
});

describe('altar del Santuario', () => {
  it('cerrado tapa la puerta con sus hojas y abierto deja ver la luz de casa', () => {
    const { x, y } = altarSantuario.points.door;
    const p = FLOW_PALETTES.water;
    // Cerrado: madera (oscuros); abierto: la luz de casa
    for (const dx of [-4, 0, 3]) {
      expect([p.deep, p.mid, p.outline]).toContain(render(altarSantuario, 'runes', 1).get(x + dx, y));
      expect([p.glow, p.light, p.mid]).toContain(render(altarSantuario, 'hold', 0).get(x + dx, y));
    }
  });
  it('al hundirse no deja nada por encima del suelo', () => {
    expect(render(altarSantuario, 'sink', 1).count()).toBeLessThan(40);
  });
});

describe('descarga cálida', () => {
  it('a más dura la ausencia, más escarcha', () => {
    const happy = render(descargaCalida, 'frost', 1, { params: { tier: 'happy' } }).count();
    const offended = render(descargaCalida, 'frost', 1, { params: { tier: 'offended' } }).count();
    expect(offended).toBeGreaterThan(happy);
  });
});

describe('tercera tanda', () => {
  it('el sello crece con el rango del logro', () => {
    const count = (tier: string) => render(selloLogro, 'show', 0, { params: { tier } }).count();
    expect(count('rare')).toBeGreaterThanOrEqual(count('common'));
    expect(count('legendary')).toBeGreaterThan(count('epic'));
  });
  it('la proyección astral distingue victoria, derrota y empate', () => {
    const at = (outcome: string) => render(proyeccionAstral, 'result', 0.5, { params: { outcome } }).cells.join();
    expect(at('won')).not.toBe(at('lost'));
    expect(at('lost')).not.toBe(at('draw'));
  });
  it('Simbiosis lleva dos halos de runas', () => {
    expect(render(chispaDespertar, 'halo', 0.5, { params: { level: 3 } }).count()).toBeGreaterThan(
      render(chispaDespertar, 'halo', 0.5, { params: { level: 2 } }).count(),
    );
  });
  it('las manitas sostienen un portal web o un pergamino según la herramienta', () => {
    const web = render(manitasEspirituales, 'hold', 1, { params: { tool: 'open_url' } }).cells.join();
    const clip = render(manitasEspirituales, 'hold', 1, { params: { tool: 'read_clipboard' } }).cells.join();
    expect(web).not.toBe(clip);
  });
  it('el regalo y el paquete de cariño se dibujan distinto', () => {
    expect(render(paqueteHebra, 'open', 0.6, { params: { kind: 'gift' } }).cells.join()).not.toBe(
      render(paqueteHebra, 'open', 0.6, { params: { kind: 'care' } }).cells.join(),
    );
  });
  it('el clima es de ambiente y se queda mientras dure el tiempo', () => {
    expect(clima.channel).toBe('ambient');
    expect(clima.phases.some((p) => p.ms === 'hold')).toBe(true);
    expect(render(clima, 'hold', 0, { params: { kind: 'rain' }, ms: 1000 }).count()).toBeGreaterThan(20);
    expect(render(clima, 'hold', 0, { params: { kind: 'snow' }, ms: 1000 }).count()).toBeGreaterThan(10);
  });
  it('los efectos frecuentes son menores y cortos', () => {
    for (const def of [polvoImpacto, estelaFlujo, destelloPrisma, glitchAnimo, polvoEstatico, desfragmentacion, manitasEspirituales]) {
      expect(def.channel).toBe('minor');
    }
    expect(fixedDuration(polvoImpacto.phases)).toBeLessThanOrEqual(400);
    expect(fixedDuration(estelaFlujo.phases)).toBeLessThanOrEqual(400);
  });
});

describe('cola de momentos', () => {
  it('la evolución sustituye a la subida de nivel en curso', () => {
    expect(admitMoment([{ def: resonancia }], capulloTelar)).toEqual({ play: true, replace: [0] });
  });
  it('la subida de nivel no corta la evolución ni se repite', () => {
    expect(admitMoment([{ def: capulloTelar }], resonancia).play).toBe(false);
    expect(admitMoment([{ def: resonancia }], resonancia).play).toBe(false);
  });
  it('sin nada en curso, se reproduce', () => {
    expect(admitMoment([], portalNexo)).toEqual({ play: true, replace: [] });
  });
});

describe('speciesElement', () => {
  it('conoce el elemento de las especies del catálogo', () => {
    expect(speciesElement('ignisaur')).toBe('fire');
    expect(speciesElement('axolunar')).toBe('water');
    expect(speciesElement('no-existe')).toBe('neutral');
    expect(speciesElement(undefined)).toBe('neutral');
  });
});
