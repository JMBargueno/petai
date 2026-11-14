import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createRng } from '../battles/combat/rng';
import { GeneType, Temperament } from './genes.service';

const ALL_GENES: GeneType[] = ['veloz', 'ferreo', 'sagaz', 'devorador', 'aurora', 'crono'];
const GENE_PROBABILITY = 0.15;
const MAX_GENES = 3;

const TEMPERAMENTS: Temperament[] = ['valiente', 'timido', 'arribista', 'curioso'];

/**
 * Servicio de revelación de genes. Encargado de:
 * 1. Asignar genes y temperamento al eclosionar (rollGenes/rollTemperament).
 * 2. Revelar genes automáticamente al alcanzar niveles específicos.
 */
@Injectable()
export class GeneRevealService {
  private readonly logger = new Logger(GeneRevealService.name);
  private readonly REVEAL_LEVELS = [10, 25, 50];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asignar genes y temperamento al eclosionar.
   * Determinista: misma seed → mismos genes y temperamento.
   * @param seed - Seed de la eclosión (visualSeed del pet)
   * @returns Genes (ocultos) y temperamento para almacenar en Pet.personality
   */
  assignAtHatch(seed: number): { genes: any[]; temperament: Temperament } {
    const rng = createRng(seed);
    const genes: any[] = [];

    // Roll cada gen con 15% de probabilidad, máximo 3
    for (const geneType of ALL_GENES) {
      if (genes.length >= MAX_GENES) break;
      if (rng() < GENE_PROBABILITY) {
        genes.push({ type: geneType, revealed: false, revealedAt: null });
      }
    }

    // Roll temperamento (determinista por rng)
    const t = rng();
    const temperament: Temperament =
      t < 0.25 ? 'valiente' :
      t < 0.5 ? 'timido' :
      t < 0.75 ? 'arribista' : 'curioso';

    this.logger.debug(`Hatch seed=${seed}: genes=[${genes.map(g => g.type).join(',')}], temperament=${temperament}`);

    return { genes, temperament };
  }

  /**
   * Revelar genes automáticamente al alcanzar un nivel.
   * Se llama desde el leveling logic del pet.
   * @param petId - ID del pet
   * @param newLevel - Nuevo nivel alcanzado
   * @returns Número de genes revelados en esta actualización
   */
  async revealByLevel(petId: string, newLevel: number): Promise<number> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) return 0;

    const personality = (pet.personality as any) ?? {};
    const genes: any[] = (personality.genes ?? []);
    let revealed = 0;

    for (const g of genes) {
      if (g.revealed) continue;
      // Revelar si el pet alcanzó uno de los niveles de revelación
      if (newLevel >= (this.REVEAL_LEVELS[revealed] ?? 999)) {
        g.revealed = true;
        g.revealedAt = new Date().toISOString();
        revealed++;
      }
    }

    if (revealed > 0) {
      await this.prisma.pet.update({
        where: { id: petId },
        data: {
          personality: {
            temperament: personality.temperament ?? 'curioso',
            genes,
          },
        },
      });
      this.logger.log(`Auto-revealed ${revealed} gene(s) for pet ${petId} at level ${newLevel}`);
    }

    return revealed;
  }
}