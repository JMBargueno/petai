import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface PetGenes {
  element: string;
  rarity: string;
  patternId: string;
  palette: Record<string, string>;
  baseStats: Record<string, number>;
  shiny: boolean;
}

export interface BreedingResult {
  offspringGenes: PetGenes;
  inheritedGenes: {
    fromParent1: string[];
    fromParent2: string[];
  };
  mutations: {
    gene: string;
    originalValue: string;
    mutatedValue: string;
  }[];
  seed: number;
}

const ELEMENTS = ['fire', 'water', 'grass', 'electric', 'wind', 'earth', 'ice', 'shadow'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

@Injectable()
export class GeneticsEngineService {
  private readonly MUTATION_CHANCE = 10; // 10%

  /**
   * Compute the offspring genes from two parent pets.
   * - 50% of genes from each parent (random per gene)
   * - 10% mutation chance per gene using crypto.randomInt
   */
  computeOffspring(parent1: PetGenes, parent2: PetGenes): BreedingResult {
    const inheritedFrom: { fromParent1: string[]; fromParent2: string[] } = {
      fromParent1: [],
      fromParent2: [],
    };
    const mutations: { gene: string; originalValue: string; mutatedValue: string }[] = [];

    // Each gene is inherited from one parent (50/50 random)
    const elementFromP1 = this.randomBool();
    const rarityFromP1 = this.randomBool();
    const patternFromP1 = this.randomBool();
    const paletteFromP1 = this.randomBool();
    const statsFromP1 = this.randomBool();
    const shinyFromP1 = this.randomBool();

    // Determine base values
    let element = elementFromP1 ? parent1.element : parent2.element;
    let rarity = rarityFromP1 ? parent1.rarity : parent2.rarity;
    let patternId = patternFromP1 ? parent1.patternId : parent2.patternId;
    let palette = paletteFromP1
      ? { ...parent1.palette }
      : { ...parent2.palette };
    let baseStats = statsFromP1
      ? { ...parent1.baseStats }
      : { ...parent2.baseStats };
    let shiny = shinyFromP1 ? parent1.shiny : parent2.shiny;

    // Track inheritance
    if (elementFromP1) inheritedFrom.fromParent1.push('element');
    else inheritedFrom.fromParent2.push('element');
    if (rarityFromP1) inheritedFrom.fromParent1.push('rarity');
    else inheritedFrom.fromParent2.push('rarity');
    if (patternFromP1) inheritedFrom.fromParent1.push('patternId');
    else inheritedFrom.fromParent2.push('patternId');
    if (paletteFromP1) inheritedFrom.fromParent1.push('palette');
    else inheritedFrom.fromParent2.push('palette');
    if (statsFromP1) inheritedFrom.fromParent1.push('baseStats');
    else inheritedFrom.fromParent2.push('baseStats');
    if (shinyFromP1) inheritedFrom.fromParent1.push('shiny');
    else inheritedFrom.fromParent2.push('shiny');

    // Apply mutations (10% chance per gene)
    if (this.shouldMutate()) {
      const originalElement = element;
      element = this.mutateElement();
      mutations.push({
        gene: 'element',
        originalValue: originalElement,
        mutatedValue: element,
      });
    }

    if (this.shouldMutate()) {
      const originalRarity = rarity;
      rarity = this.mutateRarity(rarity);
      mutations.push({
        gene: 'rarity',
        originalValue: originalRarity,
        mutatedValue: rarity,
      });
    }

    if (this.shouldMutate()) {
      shiny = true;
      mutations.push({
        gene: 'shiny',
        originalValue: String(shiny),
        mutatedValue: 'true',
      });
    }

    // Mutation on stats: slightly increase one random stat
    if (this.shouldMutate() && Object.keys(baseStats).length > 0) {
      const statKeys = Object.keys(baseStats);
      const targetStat = statKeys[crypto.randomInt(0, statKeys.length)];
      const originalValue = baseStats[targetStat];
      baseStats[targetStat] = Math.min(100, originalValue + crypto.randomInt(1, 5));
      mutations.push({
        gene: `baseStats.${targetStat}`,
        originalValue: String(originalValue),
        mutatedValue: String(baseStats[targetStat]),
      });
    }

    const seed = crypto.randomInt(0, 999999);

    return {
      offspringGenes: {
        element,
        rarity,
        patternId,
        palette,
        baseStats,
        shiny,
      },
      inheritedGenes: inheritedFrom,
      mutations,
      seed,
    };
  }

  private randomBool(): boolean {
    return crypto.randomInt(0, 2) === 0;
  }

  private shouldMutate(): boolean {
    return crypto.randomInt(0, 100) < this.MUTATION_CHANCE;
  }

  private mutateElement(): string {
    return ELEMENTS[crypto.randomInt(0, ELEMENTS.length)];
  }

  private mutateRarity(currentRarity: string): string {
    const idx = RARITIES.indexOf(currentRarity);
    // Mutation can go up or down by 1 tier
    const direction = crypto.randomInt(0, 2) === 0 ? 1 : -1;
    const newIdx = Math.max(0, Math.min(RARITIES.length - 1, idx + direction));
    return RARITIES[newIdx];
  }
}
