import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeLearned, reinforce, settleLearned, type Learned, type ReinforceRefusal } from '@pockai/mind/node';
import { PrismaService } from '../../prisma/prisma.service';
import { MindService } from './mind.service';
import type { StoredPersonality } from './mind.types';

export interface LearnedView {
  /** Conducta → preferencia de -1 (a su entrenador no le gusta) a 1 (le encanta). */
  prefs: Record<string, number>;
}

export interface ReinforceReply extends LearnedView {
  applied: boolean;
  reason?: ReinforceRefusal;
  behavior: string;
}

/**
 * Lo que el Pockai aprende de los gestos de su entrenador (spec 41, fase D).
 *
 * El escritorio decide en local qué conducta toca (necesita reaccionar al instante), pero lo
 * aprendido se guarda aquí, en `Pet.personality.learned`, para que viaje con la mascota a cualquier
 * equipo. El servidor aplica la misma librería y es quien manda: valida la conducta y el gesto, y
 * cuenta el tope diario.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
  ) {}

  /** Conductas que existen en el escritorio: solo de esas se aprende. */
  private known(): string[] {
    return Object.keys((this.mind.config() as any).desktop?.behaviors ?? {});
  }

  /** Lo aprendido tal como está ahora (con el olvido aplicado). No escribe nada. */
  view(stored: StoredPersonality, now = new Date()): LearnedView {
    const cfg = this.mind.config().learning;
    if (!cfg) return { prefs: {} };
    return { prefs: settleLearned(normalizeLearned(stored.learned, this.known()), now.getTime(), cfg).prefs };
  }

  async reinforce(userId: string, petId: string, body: { behavior?: unknown; signal?: unknown }, now = new Date()): Promise<ReinforceReply> {
    const cfg = this.mind.config().learning;
    if (!cfg) throw new NotFoundException('El aprendizaje no está disponible');
    const behavior = body?.behavior;
    const signal = body?.signal;
    if (typeof behavior !== 'string' || !this.known().includes(behavior)) throw new BadRequestException('behavior no es una conducta conocida');
    if (typeof signal !== 'string' || typeof cfg.signals[signal] !== 'number') throw new BadRequestException('signal no es un gesto conocido');
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId }, include: { species: true } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    const { stored } = await this.mind.ensureDims(pet);
    const before: Learned = normalizeLearned(stored.learned, this.known());
    const result = reinforce(before, behavior, signal, now.getTime(), cfg);
    // También sin aplicar se guarda: el contador del día y el olvido ya asentado
    await this.mind.patchStored(pet.id, { learned: result.state } as Partial<StoredPersonality>);
    return { applied: result.applied, ...(result.reason ? { reason: result.reason } : {}), behavior, prefs: result.state.prefs };
  }
}
