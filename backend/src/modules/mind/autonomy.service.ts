import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CronLockService } from '../../redis/cron-lock.service';
import { GameDataService } from '../game-data/game-data.service';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import { Friend, encounterRoll, intervalIndex, intervalStart, simulate } from './autonomy.engine';
import { dayKey } from './evolution.engine';
import { AutonomyConfig, AutonomyDaily, Dims, StoredPersonality } from './mind.types';
import { nextTrick, normalizeTricks, practiceTrick } from './tricks.engine';
import { activeWishes, activityBoosts, normalizeWishes } from './wishes.engine';
import { layerOf, type MemoryRow } from './memory.engine';
import { EncounterService } from './encounter.service';
import { ActivityDropsService } from '../inventory/activity-drops.service';

const STAGE_PULL: Record<string, number> = { stranger: 1, acquaintance: 1.3, friend: 2, best_friend: 3 };

/** Días desde el último recuerdo de un tipo; `null` si no hay ninguno. */
function daysSinceKind(rows: readonly MemoryRow[], kind: string, now: Date): number | null {
  let latest = -Infinity;
  for (const r of rows) if (r.kind === kind) latest = Math.max(latest, r.createdAt.getTime());
  return latest === -Infinity ? null : Math.max(0, (now.getTime() - latest) / 86_400_000);
}

/**
 * Añade a cada amigo cuánto tira ir a verle, según lo que la mascota siente por su Pockai. Si no
 * hay ninguna relación guardada, devuelve la lista tal cual (y se elige como siempre).
 */
export function withAffinity(friends: Friend[], rows: readonly MemoryRow[]): Friend[] {
  const bySubject = new Map<string, MemoryRow>();
  for (const r of rows) if (layerOf(r) === 'emotional' && r.subject) bySubject.set(r.subject, r);
  if (!friends.some((f) => bySubject.has(`pet:${f.petId}`))) return friends;
  return friends.map((f) => {
    const rel = bySubject.get(`pet:${f.petId}`);
    const stage = (rel as { stage?: string } | undefined)?.stage ?? 'stranger';
    return { ...f, affinity: (1 + Math.max(0, rel?.valence ?? 0)) * (STAGE_PULL[stage] ?? 1) };
  });
}

const DAY_MS = 86_400_000;
const MAX_FRIENDS = 10;
/** Ranura del barrido social (cada 2 h): semilla del encuentro de cada pareja. */
const SWEEP_SLOT_MS = 2 * 60 * 60 * 1000;

/**
 * Vida autónoma (spec 36).
 *
 * - `catchUp(pet)`: perezoso. Se llama al leer la mascota; simula los intervalos completos
 *   transcurridos mientras el entrenador no estaba, con un tope por lectura. Avanza un cursor
 *   con actualización condicional: si dos lecturas compiten, solo una simula.
 * - `socialSweep()`: cron ligero y paginado que provoca encuentros entre mascotas de amigos
 *   cuando ninguno de los dos entrenadores está, para que ambas lo recuerden.
 * Ninguno usa el LLM: el coste de infraestructura es el de unas pocas consultas.
 */
@Injectable()
export class AutonomyService {
  private readonly logger = new Logger(AutonomyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
    @Optional() private readonly cronLock?: CronLockService,
    @Optional() encounters?: EncounterService,
    // Drops de actividades (spec 41): al encontrar algo explorando, a veces cae también un objeto raro
    @Optional() private readonly activityDrops?: ActivityDropsService,
  ) {
    this.encounters = encounters ?? new EncounterService(mind, memory);
  }

  private readonly encounters: EncounterService;

  private cfg(): AutonomyConfig | undefined {
    return this.mind.config()?.autonomy;
  }

  /** Devuelve la mascota actualizada si hubo cambios (o la misma si no). Nunca lanza. */
  async catchUp(pet: any, now = new Date()): Promise<any> {
    const cfg = this.cfg();
    if (!cfg) return pet;
    try {
      const current = intervalIndex(now, cfg) - 1; // último intervalo COMPLETO
      const cursor: number | null = pet.autonomyCursor ?? null;
      if (cursor !== null && cursor >= current) return pet;

      // Reclamo del rango con actualización condicional (anti doble simulación)
      const claimed = await this.prisma.pet.updateMany({
        where: { id: pet.id, autonomyCursor: cursor },
        data: { autonomyCursor: current },
      });
      if (claimed.count === 0) return pet;
      if (cursor === null) return { ...pet, autonomyCursor: current }; // primera lectura: empieza a contar

      const lastSeen = new Date(pet.lastInteractionAt ?? pet.lastLoginAt ?? pet.createdAt ?? now);
      const awayFrom = intervalIndex(lastSeen.getTime() + cfg.ownerAwayMinutes * 60_000, cfg);
      const from = Math.max(cursor + 1, awayFrom, current - cfg.maxIntervalsPerCatchUp + 1);
      if (from > current) return { ...pet, autonomyCursor: current };

      const { dims, stored } = await this.mind.ensureDims(pet);
      const mindCfg = this.mind.config();
      // Lo que recuerda (episodios y relaciones) decide qué le apetece y a qué amigo va a ver
      const rows = await this.memory.situationRows(pet.id).catch(() => []);
      const tricks = normalizeTricks(stored.tricks, mindCfg.tricks);
      const canPractice = !!tricks.learning || nextTrick(tricks, dims, mindCfg.tricks) !== null;
      const friends = withAffinity(await this.friendsOf(pet.userId), rows);
      const wishes = activeWishes(
        {
          dims,
          now,
          awayMinutes: Math.max(0, Math.floor((now.getTime() - new Date(pet.lastInteractionAt ?? pet.lastLoginAt ?? pet.createdAt ?? now).getTime()) / 60_000)),
          daysSinceAdventure: daysSinceKind(rows, 'adventure', now),
          daysSinceFriend: friends.length ? (Math.min(daysSinceKind(rows, 'encounter', now) ?? 999, daysSinceKind(rows, 'visit', now) ?? 999)) : null,
          hasUntoldFind: false,
          canLearnTrick: canPractice,
          energy: pet.energy ?? 100,
          sick: !!pet.sick,
        },
        normalizeWishes(stored.wishes),
        mindCfg.wishes,
      );
      const itemNames = Object.fromEntries(this.gameData.getFoods().map((f: any) => [f.id, f.name]));
      const today = dayKey(now);
      const sim = simulate(
        {
          petId: pet.id,
          dims,
          inHabitat: !!pet.inHabitat,
          sleeping: !!pet.sleeping,
          sick: !!pet.sick,
          energy: pet.energy ?? 100,
          from,
          to: current,
          friends,
          daily: stored.autonomy,
          itemNames,
          canPractice,
          boosts: activityBoosts(wishes, mindCfg.wishes),
        },
        cfg,
        today,
      );

      // Abandono: un día entero sin el entrenador enfría la relación (una vez al día)
      const events = [...sim.evolutionEvents];
      let lastNeglectDay = stored.lastNeglectDay;
      if (now.getTime() - lastSeen.getTime() >= DAY_MS && stored.lastNeglectDay !== today) {
        events.push('neglect_day');
        lastNeglectDay = today;
      }

      // Game engine: efectos acotados sobre vitales e inventario
      let updated = pet;
      if (sim.energyDelta || sim.happinessDelta) {
        updated = await this.prisma.pet.update({
          where: { id: pet.id },
          data: {
            energy: clamp((pet.energy ?? 0) + sim.energyDelta),
            happiness: clamp((pet.happiness ?? 0) + sim.happinessDelta),
          },
          include: { species: true, pattern: true },
        });
      }
      for (const itemId of sim.itemsFound) await this.grantItem(pet.userId, itemId);
      if (sim.itemsFound.length) await this.activityDrops?.roll(pet.userId, 'explore');

      // Memoria episódica (fechada en el intervalo en que ocurrió: "ayer visité…")
      // Los encuentros con amigos los escribe la escena (más abajo), cada uno desde su lado
      await this.memory.remember(
        pet.id,
        sim.episodes.filter((e) => !e.friend).map((e) => ({
          layer: 'episodic' as const,
          kind: e.friend ? 'encounter' : e.itemId ? 'find' : 'event',
          content: e.content,
          importance: e.importance,
          valence: e.valence,
          subject: e.friend ? `pet:${e.friend.petId}` : null,
          createdAt: intervalStart(e.index, cfg),
        })),
      );
      for (const enc of sim.encounters) {
        await this.recordEncounterForFriend(pet, dims, enc.friend, enc.index, intervalStart(enc.index, cfg));
      }

      // Lo que practicó por su cuenta avanza su truco; si lo aprende, lo recuerda
      const patch: Partial<StoredPersonality> = { autonomy: sim.daily, lastNeglectDay };
      if (sim.practices > 0) {
        let state = tricks;
        const learned: string[] = [];
        for (let i = 0; i < sim.practices; i++) {
          const res = practiceTrick(state, dims, mindCfg.tricks, today, 'self');
          state = res.state;
          if (res.learned) learned.push(res.learned);
        }
        patch.tricks = state;
        if (learned.length) {
          await this.memory.remember(
            pet.id,
            learned.map((id) => ({
              layer: 'episodic' as const,
              kind: 'event',
              key: `trick:${id}`,
              content: `Aprendí un truco yo solo: ${mindCfg.tricks.catalog[id].name}. ¡Quiero enseñárselo a mi entrenador!`,
              importance: 0.6,
              valence: 0.7,
            })),
          );
        }
      }
      // Deriva y contadores del día en una sola escritura del JSON de personalidad
      await this.mind.applyExperience(pet.id, events, now, patch);
      return { ...updated, autonomyCursor: current };
    } catch (e: any) {
      this.logger.warn(`Vida autónoma de ${pet?.id} no simulada: ${e?.message}`);
      return pet;
    }
  }

  /** Mascotas de amigos (CoopFriendship aceptada): la más antigua de cada amigo. */
  private async friendsOf(userId: string): Promise<Friend[]> {
    const rows = await this.prisma.coopFriendship.findMany({
      where: { status: 'accepted', OR: [{ ownerId: userId }, { visitorId: userId }] },
      select: { ownerId: true, visitorId: true },
      take: MAX_FRIENDS,
      orderBy: { createdAt: 'asc' },
    });
    const ids = [...new Set(rows.map((r) => (r.ownerId === userId ? r.visitorId : r.ownerId)))];
    if (!ids.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, pets: { select: { id: true, nickname: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    return users
      .filter((u) => u.pets.length)
      .map((u) => ({ petId: u.pets[0].id, name: u.pets[0].nickname, ownerId: u.id, ownerName: u.displayName || 'un amigo' }))
      .sort((a, b) => a.petId.localeCompare(b.petId));
  }

  /** El amigo también recuerda el encuentro (episodio + relación emocional + evolución). */
  private async recordEncounterForFriend(pet: any, dims: Dims, friend: Friend, slot: number, at: Date) {
    const [owner, friendPet] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: pet.userId }, select: { displayName: true } }),
      this.prisma.pet.findUnique({ where: { id: friend.petId } }),
    ]);
    if (!friendPet) return;
    const friendMind = await this.mind.ensureDims(friendPet);
    // La misma escena que en una visita en vivo: la mascota va a casa de su amigo
    await this.encounters.play({
      host: { id: friend.petId, name: friend.name, ownerName: friend.ownerName, dims: friendMind.dims, energy: friendPet.energy ?? 60 },
      guest: { id: pet.id, name: pet.nickname || 'un Pockai', ownerName: owner?.displayName || 'un amigo', dims, energy: pet.energy ?? 60 },
      slot,
      first: true,
      at,
    });
    await this.mind.applyExperience(friend.petId, ['auto_socialize']);
  }

  private async grantItem(userId: string, itemId: string) {
    const exists = await this.prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!exists) return;
    await this.prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { qty: { increment: 1 } },
      create: { userId, itemId, qty: 1 },
    });
  }

  /**
   * Barrido social: cada 2 h recorre (paginado) amistades aceptadas y, si ambos entrenadores están
   * fuera, tira un encuentro determinista ponderado por la sociabilidad de las dos criaturas.
   */
  @Cron('0 */2 * * *')
  async socialSweep(now = new Date()) {
    const cfg = this.cfg();
    if (!cfg) return;
    const token = this.cronLock ? await this.cronLock.guard('mind:social-sweep', 30 * 60_000) : 'local';
    if (!token) return;
    const slot = Math.floor(now.getTime() / SWEEP_SLOT_MS);
    const awayBefore = new Date(now.getTime() - cfg.ownerAwayMinutes * 60_000);
    let cursor: string | undefined;
    let processed = 0;
    let encounters = 0;
    try {
      while (processed < cfg.social.maxPairsPerSweep) {
        const pairs = await this.prisma.coopFriendship.findMany({
          where: { status: 'accepted', ...(cursor ? { id: { gt: cursor } } : {}) },
          select: { id: true, ownerId: true, visitorId: true },
          orderBy: { id: 'asc' },
          take: cfg.social.batchSize,
        });
        if (!pairs.length) break;
        for (const p of pairs) {
          processed++;
          if (await this.trySweepEncounter(p, slot, awayBefore, now, cfg)) encounters++;
        }
        cursor = pairs[pairs.length - 1].id;
        if (pairs.length < cfg.social.batchSize) break;
      }
      if (encounters) this.logger.log(`Barrido social: ${encounters} encuentros en ${processed} amistades`);
    } catch (e: any) {
      this.logger.warn(`Barrido social interrumpido: ${e?.message}`);
    }
  }

  private async trySweepEncounter(
    pair: { id: string; ownerId: string; visitorId: string },
    slot: number,
    awayBefore: Date,
    now: Date,
    cfg: AutonomyConfig,
  ): Promise<boolean> {
    const pets = await Promise.all(
      [pair.ownerId, pair.visitorId].map((userId) =>
        this.prisma.pet.findFirst({
          where: { userId, sleeping: false, sick: false, lastInteractionAt: { lt: awayBefore } },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { displayName: true } } },
        }),
      ),
    );
    const [a, b] = pets;
    if (!a || !b) return false;
    const [da, db] = await Promise.all([this.mind.ensureDims(a), this.mind.ensureDims(b)]);
    if (!encounterRoll(pair.id, slot, da.dims.sociability, db.dims.sociability, cfg)) return false;

    const today = dayKey(now);
    const counters = [da.stored.autonomy, db.stored.autonomy].map((d) =>
      d?.day === today ? { ...d } : ({ day: today, items: 0, happiness: 0, energy: 0, encounters: 0 } as AutonomyDaily),
    );
    if (counters.some((c) => c.encounters >= cfg.social.dailyCapPerPet)) return false;

    const ownerName = (p: any) => p.user?.displayName || 'un amigo';
    // Una escena para los dos: `b` va a casa de `a`, y cada uno la recuerda desde su lado
    await this.encounters.play({
      host: { id: a.id, name: a.nickname, ownerName: ownerName(a), dims: da.dims, energy: a.energy ?? 60 },
      guest: { id: b.id, name: b.nickname, ownerName: ownerName(b), dims: db.dims, energy: b.energy ?? 60 },
      slot,
      first: true,
      at: now,
    });
    for (const [me, counter] of [
      [a, counters[0]],
      [b, counters[1]],
    ] as const) {
      await this.mind.applyExperience(me.id, ['auto_socialize'], now);
      counter.encounters++;
      await this.mind.patchStored(me.id, { autonomy: counter } as Partial<StoredPersonality>);
    }
    return true;
  }
}

function clamp(v: number) {
  return Number(Math.min(100, Math.max(0, v)).toFixed(2));
}
