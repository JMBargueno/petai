import { describe, expect, it } from 'vitest';
import { DESKTOP_SKILLS } from './types/desktopSkills';
import { getPetIntelligenceLevel } from './stores/desktopSkillsStore';
// Registro del servidor: funciones puras sin dependencias de Nest
import { DESKTOP_SKILL_REGISTRY, intelligenceLevel } from '../../../backend/src/modules/ai/desktop-skills';
import { buildFilePrompt, CHAT_MESSAGE_MAX } from './fileAnalyzer';
import { buildClientContext, deskState } from './deskContext';
import { startPomodoro, stopPomodoro } from './pomodoro';

describe('registro de habilidades: escritorio y servidor coinciden', () => {
  it('mismos ids, umbrales y valores por defecto', () => {
    const pick = (s: any) => ({
      id: s.id,
      requiredBonding: s.requiredBonding,
      requiredIntelligence: s.requiredIntelligence,
      defaultEnabled: s.defaultEnabled,
    });
    const byId = (a: any, b: any) => a.id.localeCompare(b.id);
    expect(DESKTOP_SKILL_REGISTRY.map(pick).sort(byId)).toEqual(DESKTOP_SKILLS.map(pick).sort(byId));
  });

  it('las habilidades con aviso de permiso son las sensibles del servidor', () => {
    const sensitive = DESKTOP_SKILL_REGISTRY.filter((s) => s.sensitive).map((s) => s.id).sort();
    expect(DESKTOP_SKILLS.filter((s) => s.permissionNotice).map((s) => s.id).sort()).toEqual(sensitive);
  });

  it('mismo cálculo de nivel de IA', () => {
    for (const p of [0, 150, 199, 200, 350, 499, 500, 1000]) {
      expect(intelligenceLevel(p)).toBe(getPetIntelligenceLevel(p));
    }
  });
});

describe('buildFilePrompt', () => {
  const file = { name: 'informe.md', typeLabel: 'Markdown', snippet: 'x'.repeat(2500) };

  it('nunca supera el límite del chat y avisa del recorte', () => {
    const p = buildFilePrompt(file, 'Resúmelo');
    expect(p.length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX);
    expect(p).toContain('Resúmelo');
    expect(p).toContain('[recortado]');
  });

  it('un archivo corto va entero', () => {
    const p = buildFilePrompt({ ...file, snippet: 'hola mundo' }, '¿Qué es?');
    expect(p).toContain('hola mundo');
    expect(p).not.toContain('[recortado]');
  });

  it('sin contenido, solo cabecera; con pregunta enorme, también cabe', () => {
    expect(buildFilePrompt({ ...file, snippet: undefined }, 'Dime algo')).toBe('Sobre el archivo "informe.md" (Markdown):\nDime algo');
    expect(buildFilePrompt({ ...file, name: 'a'.repeat(500) }, 'q'.repeat(5000)).length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX);
  });
});

describe('buildClientContext', () => {
  it('solo categorías y números: postura, app y Pomodoro', () => {
    deskState.set({ appCategory: 'coding', pose: 'perched' });
    startPomodoro(30, 5);
    const ctx = buildClientContext();
    stopPomodoro();
    expect(ctx).toEqual({ pose: 'perched', appCategory: 'coding', pomodoro: { phase: 'work', minutesLeft: 30, sessionsToday: 0 } });
    expect(JSON.stringify(ctx)).not.toMatch(/title|titulo/i);
  });

  it('sin app conocida no envía categoría', () => {
    deskState.set({ appCategory: null, pose: 'walking' });
    expect(buildClientContext().appCategory).toBeUndefined();
  });
});
