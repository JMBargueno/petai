import { Fighter, Strategy, Stats } from '../battles/combat/types';
import { PetGene, GeneType, Temperament } from './genes.service';

/**
 * Aplica los efectos de los genes al Fighter ANTES de runCombat.
 * Esto preserva la reproducibilidad: mismos genes + misma seed → mismo combate.
 */
export function applyGenesToFighter(fighter: Fighter, genes: PetGene[]): Fighter {
  if (!genes || genes.length === 0) return fighter;

  const stats = { ...fighter.stats };
  let cooldownMult = 1;
  let critBonus = 0;

  for (const gene of genes) {
    if (!gene.revealed) continue;

    switch (gene.type) {
      case 'veloz':
        stats.vel = stats.vel * 1.10;
        break;
      case 'ferreo':
        stats.def = stats.def * 1.10;
        break;
      case 'sagaz':
        critBonus += 0.03;
        break;
      case 'devorador':
        // Afecta solo a comida (fuera de combate), no modifica stats
        break;
      case 'aurora':
        // Afecta shiny probability (fuera de combate), no modifica stats
        break;
      case 'crono':
        cooldownMult *= 0.90;
        break;
    }
  }

  // Redondear stats a 2 decimales
  const finalStats: Stats = {
    hp: Math.round(stats.hp),
    atk: Math.round(stats.atk * 100) / 100,
    def: Math.round(stats.def * 100) / 100,
    vel: Math.round(stats.vel * 100) / 100,
    esp: Math.round(stats.esp * 100) / 100,
  };

  // Aplicar cooldown mult a las skills
  const skills = cooldownMult !== 1
    ? fighter.skills.map((s) => ({
        ...s,
        cooldown: Math.max(0, Math.round(s.cooldown * cooldownMult)),
      }))
    : fighter.skills;

  return {
    ...fighter,
    stats: finalStats,
    skills,
  };
}

/**
 * Mapea un temperamento a una estrategia de combate.
 */
export function temperamentToStrategy(temperament: Temperament, baseStrategy: Strategy): Strategy {
  switch (temperament) {
    case 'valiente':
    case 'arribista':
      return 'aggressive';
    case 'timido':
      return 'defensive';
    case 'curioso':
    default:
      return baseStrategy; // mantiene la estrategia base del pet
  }
}

/**
 * Genera el texto del system prompt para el chat IA según el temperamento.
 */
export function temperamentToSystemPrompt(temperament: Temperament): string {
  switch (temperament) {
    case 'valiente':
      return 'Eres valiente y desafiante. Hablas con coraje y ganas de pelear. Nunca temes a un rival.';
    case 'timido':
      return 'Eres tímido y cauteloso. Hablas con suavidad y prefieres evitar conflictos.';
    case 'arribista':
      return 'Eres muy competitivo y ambicioso. Siempre quieres ganar y superas a todos.';
    case 'curioso':
    default:
      return 'Eres curioso y alegre. Te encanta explorar y descubrir nuevas cosas.';
  }
}

/**
 * Bonus de shiny por gen Aurora.
 */
export function getShinyBonus(genes: PetGene[]): number {
  const hasAurora = genes.some((g) => g.revealed && g.type === 'aurora');
  return hasAurora ? 0.01 : 0;
}

/**
 * Bonus de comida favorita por gen Devorador.
 */
export function getFoodBonus(genes: PetGene[]): number {
  const hasDevorador = genes.some((g) => g.revealed && g.type === 'devorador');
  return hasDevorador ? 1.15 : 1.0;
}