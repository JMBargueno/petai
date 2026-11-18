import * as fs from 'fs';
import * as path from 'path';
import { Lore, MAX_LORE_CHARS, buildLoreBlock, findLore, loreTopics, matchLore } from './lore';

const lore: Lore = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/lore.json'), 'utf8'),
);

describe('lore', () => {
  it('lore.json: temas con id único, palabras clave y texto que cabe en el prompt', () => {
    const ids = lore.topics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of lore.topics) {
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.keywords.length).toBeGreaterThan(0);
      expect(t.text.length).toBeGreaterThan(100);
      expect(t.text.length).toBeLessThanOrEqual(MAX_LORE_CHARS);
      // Texto para el jugador: sin nombres de campos ni de herramientas
      expect(t.text).not.toMatch(/visualSeed|intelligence|open_url|clipboard|API/);
    }
  });

  it('reconoce de qué tema habla una pregunta', () => {
    expect(matchLore(lore, '¿De dónde vienen los huevos?')?.id).toBe('origen');
    expect(matchLore(lore, 'Háblame de los elementos, ¿qué es Sombra?')?.id).toBe('elementos');
    expect(matchLore(lore, '¿Cómo fue tu Despertar?')?.id).toBe('despertar');
    expect(matchLore(lore, '¿Qué es un clan? ¿Y un Vigía?')?.id).toBe('nexos');
    expect(matchLore(lore, '¿por qué eres shiny?')?.id).toBe('apariencia');
  });

  it('una charla normal no trae lore', () => {
    expect(matchLore(lore, 'hola, ¿qué tal has dormido hoy?')).toBeNull();
    expect(matchLore(lore, '')).toBeNull();
    expect(matchLore(null, '¿De dónde vienen los huevos?')).toBeNull();
    expect(buildLoreBlock(lore, 'tengo hambre')).toBe('');
  });

  it('findLore acepta el id, el título o una descripción libre', () => {
    expect(findLore(lore, 'coliseo')?.id).toBe('coliseo');
    expect(findLore(lore, 'Los Seis Flujos del Éter')?.id).toBe('elementos');
    expect(findLore(lore, 'las rarezas de los pockai y el pity')?.id).toBe('rarezas');
    expect(findLore(lore, 'recetas de cocina')).toBeNull();
  });

  it('lista los temas y monta el bloque del prompt', () => {
    expect(loreTopics(lore).map((t) => t.id)).toContain('glosario');
    const block = buildLoreBlock(lore, '¿De dónde vienen los huevos?');
    expect(block).toContain('Lo que sabes de tu mundo');
    expect(block).toContain('Telar de Mulberry');
  });
});
