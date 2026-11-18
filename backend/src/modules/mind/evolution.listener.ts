import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';

/**
 * Evolution Engine — entrada de experiencias (spec 36).
 *
 * Escucha eventos de dominio que ya emiten otros módulos (sin tocarlos) y los traduce a deriva de
 * personalidad y, cuando procede, a recuerdos. Nunca rompe el flujo que emitió el evento.
 */
@Injectable()
export class EvolutionListener {
  private readonly logger = new Logger(EvolutionListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
  ) {}

  private async safe(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e: any) {
      this.logger.warn(`Experiencia no registrada: ${e?.message}`);
    }
  }

  @OnEvent('pet:fed', { async: true })
  onFed(p: { petId: string }) {
    return this.safe(() => this.mind.applyExperience(p.petId, ['fed']));
  }

  @OnEvent('pet:cleaned', { async: true })
  onCleaned(p: { petId: string }) {
    return this.safe(() => this.mind.applyExperience(p.petId, ['cleaned']));
  }

  @OnEvent('pet:slept', { async: true })
  onSlept(p: { petId: string }) {
    return this.safe(() => this.mind.applyExperience(p.petId, ['slept']));
  }

  @OnEvent('minigame:finished', { async: true })
  onMinigame(p: { petId: string }) {
    return this.safe(async () => {
      await this.mind.applyExperience(p.petId, ['minigame']);
      await this.memory.feel(p.petId, 'owner', 'Mi entrenador', 0.05);
    });
  }

  @OnEvent('battle:finished', { async: true })
  onBattle(p: { petId: string; won: boolean }) {
    return this.safe(async () => {
      await this.mind.applyExperience(p.petId, [p.won ? 'battle_won' : 'battle_lost']);
      await this.memory.remember(p.petId, [
        {
          layer: 'episodic',
          kind: 'event',
          content: p.won ? 'Gané un combate en la Arena. ¡Qué subidón!' : 'Perdí un combate en la Arena; la próxima vez lo haré mejor.',
          importance: 0.45,
          valence: p.won ? 0.6 : -0.3,
        },
      ]);
    });
  }

  @OnEvent('chat:message_sent', { async: true })
  onChat(p: { petId: string; mindHandled?: boolean }) {
    // El orquestador del chat ya aplica esta deriva junto con la del turno, en una sola escritura
    if (p.mindHandled) return Promise.resolve();
    return this.safe(() => this.mind.applyExperience(p.petId, ['chat']));
  }

  @OnEvent('adventure:finished', { async: true })
  onAdventure(p: { petId: string }) {
    // El recuerdo episódico lo escribe AdventureService; aquí solo la deriva de personalidad
    return this.safe(() => this.mind.applyExperience(p.petId, ['adventure']));
  }

  /** Visita en vivo a un hábitat: las mascotas de ambos entrenadores la recuerdan. */
  @OnEvent('habitat:visited', { async: true })
  onHabitatVisit(p: { userId: string; ownerId: string; visitorPetId?: string; hostPetId?: string }) {
    return this.safe(async () => {
      const [visitorPet, hostPet] = await Promise.all([
        this.petInVisit(p.userId, p.visitorPetId),
        this.petInVisit(p.ownerId, p.hostPetId),
      ]);
      if (!visitorPet || !hostPet) return;
      const visitorName = visitorPet.user?.displayName || 'un entrenador';
      const hostName = hostPet.user?.displayName || 'un entrenador';
      await this.mind.applyExperience(visitorPet.id, ['habitat_visit']);
      await this.mind.applyExperience(hostPet.id, ['habitat_visit']);
      await this.memory.remember(visitorPet.id, [
        { layer: 'episodic', kind: 'encounter', content: `Fui de visita al hábitat de ${hostName} y conocí a ${hostPet.nickname}.`, importance: 0.6, valence: 0.5, subject: `pet:${hostPet.id}` },
      ]);
      await this.memory.remember(hostPet.id, [
        { layer: 'episodic', kind: 'encounter', content: `${visitorName} vino a visitarme con ${visitorPet.nickname}.`, importance: 0.6, valence: 0.5, subject: `user:${p.userId}` },
      ]);
      await this.memory.feel(hostPet.id, `user:${p.userId}`, `${visitorName} (otro entrenador)`, 0.15);
      await this.memory.feel(hostPet.id, `pet:${visitorPet.id}`, `${visitorPet.nickname} (Pockai de ${visitorName})`, 0.1);
      await this.memory.feel(visitorPet.id, `pet:${hostPet.id}`, `${hostPet.nickname} (Pockai de ${hostName})`, 0.1);
    });
  }

  /**
   * Mascota de un entrenador que participa en una visita: la que indica el evento y, si no viene
   * o no es suya, la que tiene elegida como activa (la más antigua si no ha elegido).
   */
  private async petInVisit(userId: string, petId?: string) {
    const select = { id: true, nickname: true, user: { select: { displayName: true } } };
    if (petId) {
      const named = await this.prisma.pet.findFirst({ where: { id: petId, userId }, select });
      if (named) return named;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { activePetId: true } });
    if (user?.activePetId) {
      const active = await this.prisma.pet.findFirst({ where: { id: user.activePetId, userId }, select });
      if (active) return active;
    }
    return this.prisma.pet.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select });
  }

  @OnEvent('coop:friendship_accepted', { async: true })
  onFriendship(p: { userIds: string[] }) {
    return this.safe(async () => {
      const pets = await this.prisma.pet.findMany({ where: { userId: { in: p.userIds ?? [] } }, select: { id: true } });
      for (const pet of pets) await this.mind.applyExperience(pet.id, ['friend_made']);
    });
  }
}
