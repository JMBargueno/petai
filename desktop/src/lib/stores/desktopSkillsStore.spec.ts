import { describe, it, expect } from 'vitest';
import {
  getPetBonding,
  getPetIntelligenceLevel,
  getPetIntelligenceTierName,
  getPetIntelligenceRequiredPoints,
  isSkillUnlocked,
  isSkillActive,
} from './desktopSkillsStore';
import { DESKTOP_SKILLS } from '../types/desktopSkills';

describe('desktopSkillsStore helpers', () => {
  describe('getPetBonding', () => {
    it('obtiene el vínculo si es un número directo', () => {
      expect(getPetBonding({ bonding: 35 })).toBe(35);
      expect(getPetBonding({ bonding: 0 })).toBe(0);
    });

    it('obtiene el vínculo desde bonding.value o bondingLevel', () => {
      expect(getPetBonding({ bonding: { value: 42 } })).toBe(42);
      expect(getPetBonding({ bondingLevel: 18 })).toBe(18);
    });

    it('devuelve 0 si es nulo o indefinido', () => {
      expect(getPetBonding(null)).toBe(0);
      expect(getPetBonding({})).toBe(0);
    });
  });

  describe('getPetIntelligenceLevel', () => {
    it('convierte puntos acumulados al nivel correspondiente', () => {
      expect(getPetIntelligenceLevel(0)).toBe(1);
      expect(getPetIntelligenceLevel(150)).toBe(1);
      expect(getPetIntelligenceLevel(200)).toBe(2);
      expect(getPetIntelligenceLevel(350)).toBe(2);
      expect(getPetIntelligenceLevel(500)).toBe(3);
      expect(getPetIntelligenceLevel(1000)).toBe(3);
    });

    it('respeta niveles directos 1, 2, 3', () => {
      expect(getPetIntelligenceLevel(1)).toBe(1);
      expect(getPetIntelligenceLevel(2)).toBe(2);
      expect(getPetIntelligenceLevel(3)).toBe(3);
    });
  });

  describe('getPetIntelligenceTierName & RequiredPoints', () => {
    it('devuelve el nombre y puntos mínimos según el nivel', () => {
      expect(getPetIntelligenceTierName(1)).toBe('Charla');
      expect(getPetIntelligenceTierName(2)).toBe('Memoria');
      expect(getPetIntelligenceTierName(3)).toBe('Agente');

      expect(getPetIntelligenceRequiredPoints(1)).toBe(0);
      expect(getPetIntelligenceRequiredPoints(2)).toBe(200);
      expect(getPetIntelligenceRequiredPoints(3)).toBe(500);
    });
  });

  describe('isSkillUnlocked', () => {
    const fileAnalyzer = DESKTOP_SKILLS.find((s) => s.id === 'file_analyzer')!;
    const climbWalls = DESKTOP_SKILLS.find((s) => s.id === 'climb_walls')!;

    it('desbloquea habilidad básica si cumple bonding', () => {
      // climb_walls: bonding 10, int 1
      expect(isSkillUnlocked(climbWalls, 5, 0)).toBe(false);
      expect(isSkillUnlocked(climbWalls, 10, 0)).toBe(true);
    });

    it('desbloquea file_analyzer solo con bonding >= 30 e inteligencia >= Agente (500 pts)', () => {
      // file_analyzer: bonding 30, int 3
      expect(isSkillUnlocked(fileAnalyzer, 35, 150)).toBe(false); // int insuficiente
      expect(isSkillUnlocked(fileAnalyzer, 25, 600)).toBe(false); // bonding insuficiente
      expect(isSkillUnlocked(fileAnalyzer, 30, 500)).toBe(true); // ambos cumplidos
      expect(isSkillUnlocked(fileAnalyzer, 30, 3)).toBe(true); // nivel directo 3
    });
  });
});
