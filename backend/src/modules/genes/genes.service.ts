import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { GeneRevealService } from './gene-reveal.service';
import { WalletService } from '../wallet/wallet.service';

export type GeneType = 'veloz' | 'ferreo' | 'sagaz' | 'devorador' | 'aurora' | 'crono';
export type Temperament = 'valiente' | 'timido' | 'arribista' | 'curioso';

export interface PetGene {
  type: GeneType;
  revealed: boolean;
  revealedAt: string | null;
  effect?: string;
}

const GENE_EFFECTS: Record<GeneType, string> = {
  veloz: '+10% VEL',
  ferreo: '+10% DEF',
  sagaz: 'Crítico +3%',
  devorador: '+15% comida favorita',
  aurora: 'Shiny +1%',
  crono: '-10% cooldown',
};

@Injectable()
export class GenesService {
  private readonly logger = new Logger(GenesService.name);
  private readonly ANALYSIS_COST_GEMS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly geneReveal: GeneRevealService,
    private readonly wallet: WalletService,
  ) {}

  async getPetGenes(userId: string, petId: string) {
    const pet = await this.petsService.getPetById(userId, petId);
    const personality = (pet.personality as any) ?? {};
    const genes: PetGene[] = (personality.genes ?? []).map((g: any) => ({
      type: g.type,
      revealed: g.revealed,
      revealedAt: g.revealedAt ?? null,
      effect: g.revealed ? GENE_EFFECTS[g.type] : undefined,
    }));

    return {
      petId,
      genes,
      temperament: personality.temperament ?? 'curioso',
      totalGenes: genes.length,
      revealedGenes: genes.filter((g) => g.revealed).length,
      hiddenGenes: genes.filter((g) => !g.revealed).length,
    };
  }

  async analyzeGene(userId: string, petId: string) {
    const pet = await this.petsService.getPetById(userId, petId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const personality = (pet.personality as any) ?? {};
    const genes: any[] = (personality.genes ?? []);
    const hiddenGenes = genes.filter((g) => !g.revealed);

    if (hiddenGenes.length === 0) {
      throw new BadRequestException('No hay genes ocultos para revelar');
    }
    if (user.gems < this.ANALYSIS_COST_GEMS) {
      throw new BadRequestException(`Se necesitan ${this.ANALYSIS_COST_GEMS} gemas para el análisis genético`);
    }

    // Revelar el primer gen oculto
    const target = hiddenGenes[0];
    const now = new Date().toISOString();
    const updatedGenes = genes.map((g) =>
      g.type === target.type ? { ...g, revealed: true, revealedAt: now } : g,
    );

    // S-05 (SDD §3.3): cobro atómico race-safe (C-01) + revelación en una sola transacción.
    await this.prisma.$transaction(async (tx) => {
      const { ok } = await this.wallet.debit(tx, userId, 'gems', this.ANALYSIS_COST_GEMS);
      if (!ok) throw new BadRequestException(`Se necesitan ${this.ANALYSIS_COST_GEMS} gemas para el análisis genético`);
      await tx.pet.update({
        where: { id: petId },
        data: {
          personality: {
            temperament: personality.temperament ?? 'curioso',
            genes: updatedGenes,
          },
        },
      });
    });

    this.logger.log(`Gene revealed: ${target.type} for pet ${petId} by user ${userId}`);

    return {
      revealed: {
        type: target.type,
        effect: GENE_EFFECTS[target.type],
        revealedAt: now,
      },
      remainingGems: user.gems - this.ANALYSIS_COST_GEMS,
      hiddenGenes: hiddenGenes.length - 1,
    };
  }

  /**
   * Obtener genes para armar el Fighter en combate.
   * Devuelve solo los genes revelados (para coherencia con la experiencia del jugador).
   */
  async getGenesForCombat(petId: string): Promise<PetGene[]> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) return [];
    const personality = (pet.personality as any) ?? {};
    return ((personality.genes ?? []) as any[])
      .filter((g: any) => g.revealed)
      .map((g: any) => ({ type: g.type as GeneType, revealed: true, revealedAt: g.revealedAt ?? null }));
  }

  /** Obtener temperamento del pet para uso en combate y chat. */
  async getTemperament(petId: string): Promise<Temperament> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) return 'curioso';
    const personality = (pet.personality as any) ?? {};
    return (personality.temperament as Temperament) ?? 'curioso';
  }
}