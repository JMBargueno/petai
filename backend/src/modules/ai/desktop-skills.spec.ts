import { DESKTOP_SKILL_REGISTRY, buildDesktopSkillsBlock, getDesktopSkill, intelligenceLevel, skillStateOf } from './desktop-skills';

describe('desktop-skills', () => {
  const climb = getDesktopSkill('climb_walls')!;

  it('niveles de IA con los mismos umbrales que el escritorio', () => {
    expect([0, 199, 200, 499, 500].map(intelligenceLevel)).toEqual([1, 1, 2, 2, 3]);
  });

  it('estado: bloqueada (con lo que falta), apagada o activa; el valor por defecto se respeta', () => {
    expect(skillStateOf(climb, {}, { bonding: 4, intelligence: 0 })).toEqual({ state: 'locked', missingBonding: 6, missingLevel: null });
    expect(skillStateOf(getDesktopSkill('file_analyzer')!, {}, { bonding: 90, intelligence: 250 })).toEqual({
      state: 'locked',
      missingBonding: 0,
      missingLevel: 3,
    });
    expect(skillStateOf(climb, {}, { bonding: 10 })).toEqual({ state: 'active' }); // defaultEnabled
    expect(skillStateOf(climb, { climb_walls: false }, { bonding: 10 })).toEqual({ state: 'off' });
    // un valor no booleano no cuenta como autorización
    expect(
      skillStateOf(getDesktopSkill('context_awareness')!, { context_awareness: 'yes' }, { bonding: 90, intelligence: 300 }),
    ).toEqual({ state: 'off' });
  });

  it('el bloque del prompt separa activas, apagadas y bloqueadas', () => {
    const block = buildDesktopSkillsBlock({ bonding: 22, intelligence: 250, desktopSkills: { climb_walls: false } });
    expect(block).toContain('Activas:');
    expect(block).toContain('rebotas'); // drag_throw, activa por defecto
    expect(block).toContain('Trepar bordes [climb_walls]');
    expect(block).toContain('Mascota → Habilidades');
    expect(block).toMatch(/Conciencia de la app en foco: te falta 3 puntos más de vínculo/);
    expect(block).toMatch(/Analizador de archivos: te falta 8 puntos más de vínculo y nivel de IA Agente/);
  });

  it('con la herramienta disponible, sugiere usarla en vez del panel', () => {
    const block = buildDesktopSkillsBlock(
      { bonding: 22, intelligence: 600, desktopSkills: { climb_walls: false } },
      { canToggle: true },
    );
    expect(block).toContain('toggle_desktop_skill');
    expect(block).not.toContain('Mascota → Habilidades');
  });

  it('Música ambiente se desbloquea con el mueble MP3 (spec 42)', () => {
    const mixer = getDesktopSkill('ambient_mixer')!;
    expect(skillStateOf(mixer, {}, { bonding: 90, intelligence: 900 })).toMatchObject({ state: 'locked', missingFurniture: 'Reproductor MP3' });
    expect(skillStateOf(mixer, {}, { bonding: 0, ownedFurniture: ['soft_bed'] }).state).toBe('locked');
    expect(skillStateOf(mixer, {}, { bonding: 0, ownedFurniture: ['mp3'] })).toEqual({ state: 'active' });
    expect(buildDesktopSkillsBlock({ bonding: 50 })).toMatch(/Música ambiente: te falta tener el mueble Reproductor MP3/);
  });

  it('ids únicos', () => {
    const ids = DESKTOP_SKILL_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
