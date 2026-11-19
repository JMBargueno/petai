import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import { adventureEpisode } from './memory.engine';
import { describeDims } from './personality.engine';
import { fulfilEpisode, type WishId } from './wishes.engine';
import { type SceneType } from './social.engine';
import { EncounterService } from './encounter.service';
import { text } from './strings';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Lo que hizo un amigo al venir a cuidarla, en palabras de la mascota (`CARE_*` en strings). */
const CARE_LINE: Record<string, string> = { feed: 'CARE_FEED', clean: 'CARE_CLEAN', play: 'CARE_PLAY', pet: 'CARE_PET' };

/** Encuentro de dos mascotas en una visita. `slot` es la ranura de tiempo (0 = llegada). */
interface VisitEvent {
  userId: string;
  ownerId: string;
  visitorPetId?: string;
  hostPetId?: string;
  slot?: number;
}

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
    @Optional() private readonly events?: EventEmitter2,
    @Optional() encounters?: EncounterService,
  ) {
    this.encounters = encounters ?? new EncounterService(mind, memory);
  }

  private readonly encounters: EncounterService;

  /** Última escena de cada pareja mientras dura su visita (para no repetirla y para reconciliarse). */
  private readonly lastScene = new Map<string, SceneType>();

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
      await this.memory.feel(p.petId, 'owner', text('LABEL_OWNER'), 0.05);
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
          content: text(p.won ? 'EVENT_BATTLE_WON' : 'EVENT_BATTLE_LOST'),
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
  onAdventure(p: { petId: string; theme?: string; outcome?: string }) {
    return this.safe(async () => {
      await this.mind.applyExperience(p.petId, ['adventure']);
      await this.wishFulfilled(p.petId, 'go_explore');
      // El tema lo escribe un modelo: pasa por el filtro de textos de `remember` como cualquier recuerdo
      await this.memory.remember(p.petId, [
        {
          layer: 'episodic',
          kind: 'adventure',
          content: adventureEpisode(p.theme, p.outcome),
          importance: 0.6,
          valence: p.outcome === 'lose' ? 0 : 0.6,
        },
      ]);
    });
  }

  /**
   * Visita en vivo a un hábitat. Al llegar (ranura 0) y después cada cierto tiempo
   * (`habitat:visit_tick`), los dos Pockai viven una escena que depende de sus personalidades y de
   * su relación. Cada uno la recuerda desde su punto de vista.
   */
  @OnEvent('habitat:visited', { async: true })
  onHabitatVisit(p: VisitEvent) {
    return this.safe(() => this.visitScene({ ...p, slot: 0 }));
  }

  @OnEvent('habitat:visit_tick', { async: true })
  onVisitTick(p: VisitEvent) {
    return this.safe(() => this.visitScene(p));
  }

  @OnEvent('habitat:visit_ended', { async: true })
  onVisitEnded(p: { userId: string; ownerId: string }) {
    for (const key of [...this.lastScene.keys()]) {
      if (key.startsWith(`${p.userId}>${p.ownerId}:`)) this.lastScene.delete(key);
    }
    return Promise.resolve();
  }

  private async visitScene(p: VisitEvent) {
    const slot = p.slot ?? 0;
    const [visitorPet, hostPet] = await Promise.all([
      this.petInVisit(p.userId, p.visitorPetId),
      this.petInVisit(p.ownerId, p.hostPetId),
    ]);
    if (!visitorPet || !hostPet) return;
    const social = this.mind.config().social;
    const visitorName = visitorPet.user?.displayName || text('NAME_SOME_TRAINER');
    const hostName = hostPet.user?.displayName || text('NAME_SOME_TRAINER');
    const [guestMind, hostMind] = await Promise.all([this.mind.ensureDims(visitorPet), this.mind.ensureDims(hostPet)]);
    const key = `${p.userId}>${p.ownerId}:${visitorPet.id}:${hostPet.id}`;
    // En la llegada no hay escena anterior en esta visita: se mira cómo acabó la última vez
    const previous = slot === 0 ? undefined : (this.lastScene.get(key) ?? null);
    const resolved = await this.encounters.resolve({
      host: { id: hostPet.id, name: hostPet.nickname, ownerName: hostName, dims: hostMind.dims, energy: hostPet.energy ?? 60 },
      guest: { id: visitorPet.id, name: visitorPet.nickname, ownerName: visitorName, dims: guestMind.dims, energy: visitorPet.energy ?? 60 },
      slot,
      previous,
    });
    const { scene, stage } = resolved;
    this.lastScene.set(key, scene.type);

    // Solo las primeras escenas de una visita dejan huella: quedarse más rato no infla la relación
    if (slot < social.scene.maxEffectScenesPerVisit) {
      if (slot === 0) {
        await this.mind.applyExperience(visitorPet.id, ['habitat_visit']);
        await this.mind.applyExperience(hostPet.id, ['habitat_visit']);
        // Si alguno llevaba tiempo queriendo ver a sus amigos, ya los ha visto
        await this.wishFulfilled(visitorPet.id, 'see_friend');
        await this.wishFulfilled(hostPet.id, 'see_friend');
        await this.memory.feel(hostPet.id, `user:${p.userId}`, text('LABEL_TRAINER', { visitor: visitorName }), 0.15);
      }
      await this.encounters.record(resolved);
    }

    // El anfitrión la ve en su sala. Del visitante solo viaja el carácter en palabras (las bandas),
    // nunca los números ni nada de su memoria.
    const traits = describeDims(guestMind.dims, this.mind.config());
    this.events?.emit('habitat:scene_resolved', {
      ownerId: p.ownerId,
      visitorId: p.userId,
      // Cada cuánto toca escena nueva: el servicio de visitas no lee la configuración de la mente
      slotMs: social.scene.slotMs,
      scene: {
        slot,
        type: scene.type,
        stage,
        hostPetId: hostPet.id,
        guestPetId: visitorPet.id,
        guestTraits: Object.fromEntries(Object.entries(traits).map(([d, t]) => [d, t.keyword])),
      },
    });
  }

  /** Si la mascota había dicho que le apetecía esto, lo recuerda como un deseo cumplido. */
  private async wishFulfilled(petId: string, id: WishId) {
    if (!(await this.mind.fulfilWish?.(petId, id))) return;
    await this.memory.remember(petId, [
      { layer: 'episodic', kind: 'event', key: `wish:${id}`, bump: true, content: fulfilEpisode(id), importance: 0.45, valence: 0.6 },
    ]);
  }

  /**
   * Mascota de un entrenador que participa en una visita: la que indica el evento y, si no viene
   * o no es suya, la que tiene elegida como activa (la más antigua si no ha elegido).
   */
  private async petInVisit(userId: string, petId?: string) {
    const include = { user: { select: { displayName: true } } };
    if (petId) {
      const named = await this.prisma.pet.findFirst({ where: { id: petId, userId }, include });
      if (named) return named;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { activePetId: true } });
    if (user?.activePetId) {
      const active = await this.prisma.pet.findFirst({ where: { id: user.activePetId, userId }, include });
      if (active) return active;
    }
    return this.prisma.pet.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, include });
  }

  /**
   * Dos Pockai del mismo entrenador juegan juntos (buddies). El servicio de buddies ya eligió la
   * escena con `EncounterService.resolve`; aquí se resuelve igual (misma pareja, misma ranura,
   * misma escena anterior) y se guarda lo que recuerda cada uno.
   */
  @OnEvent('buddy:interacted', { async: true })
  onBuddy(p: { userId: string; petAId: string; petBId: string; slot: number; previous?: SceneType | null }) {
    return this.safe(async () => {
      const pets = await this.prisma.pet.findMany({ where: { id: { in: [p.petAId, p.petBId] }, userId: p.userId } });
      const a = pets.find((x: any) => x.id === p.petAId);
      const b = pets.find((x: any) => x.id === p.petBId);
      if (!a || !b) return;
      const [da, db] = [await this.mind.ensureDims(a), await this.mind.ensureDims(b)];
      await this.encounters.play({
        host: { id: a.id, name: a.nickname, ownerName: '', dims: da.dims, energy: a.energy ?? 60 },
        guest: { id: b.id, name: b.nickname, ownerName: '', dims: db.dims, energy: b.energy ?? 60 },
        slot: p.slot,
        first: false,
        sameHome: true,
        previous: p.previous ?? null,
      });
      await this.mind.applyExperience(a.id, ['buddy_play']);
      await this.mind.applyExperience(b.id, ['buddy_play']);
    });
  }

  /** Un amigo vino a cuidarla mientras su entrenador no estaba (visita de cuidado co-op). */
  @OnEvent('coop:care_received', { async: true })
  onCare(p: { ownerId: string; visitorId: string; petId: string; action: string }) {
    return this.safe(async () => {
      const [pet, visitor] = await Promise.all([
        this.prisma.pet.findFirst({ where: { id: p.petId, userId: p.ownerId }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { id: p.visitorId }, select: { displayName: true } }),
      ]);
      if (!pet) return;
      const name = visitor?.displayName || text('NAME_OWNER_FRIEND');
      await this.mind.applyExperience(pet.id, ['care_received']);
      await this.memory.remember(pet.id, [
        { layer: 'episodic', kind: 'visit', content: text(CARE_LINE[p.action] ?? 'CARE_OTHER', { visitor: name }), importance: 0.55, valence: 0.5, subject: `user:${p.visitorId}` },
      ]);
      await this.memory.feel(pet.id, `user:${p.visitorId}`, text('LABEL_TRAINER', { visitor: name }), 0.1);
    });
  }

  /** Otro entrenador le envía un regalo. Lo recuerda la mascota a la que iba dirigido. */
  @OnEvent('gift:received', { async: true })
  onGift(p: { senderId: string; recipientId: string; petId?: string; itemName?: string; kind?: 'gift' | 'care' }) {
    return this.safe(async () => {
      const [pet, sender] = await Promise.all([
        this.petInVisit(p.recipientId, p.petId),
        this.prisma.user.findUnique({ where: { id: p.senderId }, select: { displayName: true } }),
      ]);
      if (!pet) return;
      const name = sender?.displayName || text('NAME_OWNER_FRIEND');
      await this.mind.applyExperience(pet.id, ['gift_received']);
      await this.memory.remember(pet.id, [
        {
          layer: 'episodic',
          kind: 'event',
          content: p.kind === 'care' ? text('CARE_PACKAGE', { visitor: name }) : p.itemName ? text('GIFT_ITEM', { visitor: name, item: p.itemName }) : text('GIFT_PLAIN', { visitor: name }),
          importance: 0.55,
          valence: 0.6,
          subject: `user:${p.senderId}`,
        },
      ]);
      await this.memory.feel(pet.id, `user:${p.senderId}`, text('LABEL_TRAINER', { visitor: name }), 0.1);
    });
  }

  @OnEvent('coop:friendship_accepted', { async: true })
  onFriendship(p: { userIds: string[] }) {
    return this.safe(async () => {
      const pets = await this.prisma.pet.findMany({ where: { userId: { in: p.userIds ?? [] } }, select: { id: true } });
      for (const pet of pets) await this.mind.applyExperience(pet.id, ['friend_made']);
    });
  }
}
