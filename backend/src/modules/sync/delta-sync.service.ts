import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CrdtService } from './crdt.service';

/**
 * Delta Sync Service — orquesta push/pull de sincronía offline.
 * Feature 022: Offline-First CRDT Sync
 *
 * S-07: el estado era cuatro mapas globales del proceso, sin límite ni caducidad y compartidos
 * entre todos los usuarios (agotamiento de memoria + interferencia cross-user + sin ownership).
 * Ahora: estado POR USUARIO en Redis (`sync:*:{userId}`) con TTL (`SYNC_STATE_TTL_MS`) y topes
 * duros; ownership por `petId`; `pull` por `version > since`; respaldo en memoria POR USUARIO
 * (LRU + TTL, acotado) cuando Redis no responde.
 */

export interface SyncAction {
  id: string;
  petId: string;
  type: 'feed' | 'play' | 'clean' | 'sleep' | 'wake' | 'chat' | 'battle' | 'evolve';
  args: Record<string, unknown>;
  timestamp: number;
}

export interface PushResponse {
  newVersion: number;
  applied: string[];
  rejected: Array<{ actionId: string; reason: string }>;
  state: Record<string, unknown>;
}

export interface PullResponse {
  version: number;
  deltas: Array<{ petId: string; changes: Record<string, unknown>; version: number; timestamp: number }>;
}

interface Delta {
  petId: string;
  changes: Record<string, unknown>;
  version: number;
  timestamp: number;
}

/** Estado por usuario (forma canónica, ya acotada) que se persiste y se respalda en memoria. */
interface SyncData {
  version: number;
  state: Record<string, unknown>;
  seen: Set<string>;
  deltas: Delta[];
}

const MAX_ACTIONS_PER_PUSH = 500;
const VALID_TYPES: SyncAction['type'][] = ['feed', 'play', 'clean', 'sleep', 'wake', 'chat', 'battle', 'evolve'];
/** Tope del respaldo en memoria: nº de usuarios activos (LRU por `lastAccess`). */
const MAX_MEMORY_USERS = 1000;

@Injectable()
export class DeltaSyncService {
  private readonly logger = new Logger(DeltaSyncService.name);

  /** Respaldo en memoria POR USUARIO (LRU + TTL) si Redis no responde. Acotado; nunca global. */
  private readonly memory = new Map<string, SyncData & { lastAccess: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly crdtService: CrdtService,
  ) {}

  private get cfg() {
    return {
      ttlMs: this.configService.get<number>('SYNC_STATE_TTL_MS') ?? 86_400_000,
      maxDeltas: this.configService.get<number>('SYNC_MAX_DELTAS') ?? 2000,
      maxSeen: this.configService.get<number>('SYNC_MAX_SEEN_ACTIONS') ?? 1000,
      maxArgsBytes: this.configService.get<number>('SYNC_MAX_ARGS_BYTES') ?? 4096,
      maxPets: this.configService.get<number>('SYNC_MAX_PETS') ?? 100,
      enabled: (this.configService.get<string>('SYNC_ENABLED') ?? 'true') !== 'false',
    };
  }

  async push(userId: string, actions: SyncAction[]): Promise<PushResponse> {
    const c = this.cfg;
    if (!c.enabled) throw new HttpException('Sync deshabilitado', HttpStatus.SERVICE_UNAVAILABLE);
    if (!Array.isArray(actions) || actions.length === 0) {
      const data = await this.load(userId);
      return { newVersion: data.version, applied: [], rejected: [], state: data.state };
    }
    if (actions.length > MAX_ACTIONS_PER_PUSH) {
      throw new HttpException(`Too many actions (max ${MAX_ACTIONS_PER_PUSH})`, HttpStatus.BAD_REQUEST);
    }

    const data = await this.load(userId);

    // 1) tope por acción (tamaño de args) + idempotencia (ya vistas) → 2) ownership → 3) tope de pets
    const rejected: PushResponse['rejected'] = [];
    const fresh: SyncAction[] = [];
    for (const a of actions) {
      if (!a || typeof a.id !== 'string' || a.id.length === 0) continue;
      if (data.seen.has(a.id)) continue; // ya aplicada: no reintenta ni reintela deltas
      if (!VALID_TYPES.includes(a.type)) { rejected.push({ actionId: a.id, reason: 'invalid_type' }); continue; }
      const argsBytes = JSON.stringify(a.args ?? {}).length;
      if (argsBytes > c.maxArgsBytes) { rejected.push({ actionId: a.id, reason: 'args_too_large' }); continue; }
      fresh.push(a);
    }

    // Ownership por lote de petId únicos (una sola query, no una por acción).
    const petIds = [...new Set(fresh.map((a) => a.petId))];
    const owned = new Set<string>(
      petIds.length > 0
        ? (await this.prisma.pet.findMany({ where: { id: { in: petIds }, userId }, select: { id: true } })).map((p) => p.id)
        : [],
    );
    const toApply: SyncAction[] = [];
    for (const a of fresh) {
      if (!owned.has(a.petId)) { rejected.push({ actionId: a.id, reason: 'ownership' }); continue; }
      toApply.push(a);
    }

    // Un petId nuevo solo cabe si, sumando los ya en estado y los nuevos de ESTA push, no superamos
    // el tope de mascotas por estado.
    const finalApply: SyncAction[] = [];
    const newPetsInPush = new Set<string>();
    for (const a of toApply) {
      const petKey = `pet:${a.petId}`;
      const isNew = !(petKey in data.state);
      const petCount = Object.keys(data.state).length + newPetsInPush.size;
      if (isNew && petCount >= c.maxPets) {
        rejected.push({ actionId: a.id, reason: 'max_pets' });
        continue;
      }
      if (isNew) newPetsInPush.add(a.petId);
      finalApply.push(a);
    }

    const applied: string[] = [];
    const newDeltas: Delta[] = [];
    if (finalApply.length > 0) {
      data.version += 1;
      for (const a of finalApply) {
        this.applyAction(data.state, a);
        data.seen.add(a.id);
        applied.push(a.id);
        newDeltas.push({
          petId: a.petId,
          changes: { action: a.type, args: a.args, timestamp: a.timestamp },
          version: data.version,
          timestamp: Date.now(),
        });
      }
      data.deltas.push(...newDeltas);
      if (data.deltas.length > c.maxDeltas) data.deltas = data.deltas.slice(-c.maxDeltas);
      if (data.seen.size > c.maxSeen) data.seen = this.keepLastSet(data.seen, c.maxSeen);
    }

    await this.save(userId, data, applied, newDeltas);
    this.logger.debug(`Sync push: user=${userId}, applied=${applied.length}, rejected=${rejected.length}`);
    return { newVersion: data.version, applied, rejected, state: data.state };
  }

  async pull(userId: string, sinceVersion?: number): Promise<PullResponse> {
    const data = await this.load(userId);
    const since = sinceVersion ?? 0;
    // S-07: filtrar por `version > since` (antes se comparaba timestamp contra una versión →
    // siempre devolvía todos los deltas). El LIST ya llega acotado a `SYNC_MAX_DELTAS`.
    const deltas = data.deltas.filter((d) => d.version > since);
    return { version: data.version, deltas };
  }

  async getStatus(userId: string): Promise<{ version: number; lastSyncAt: string | null; pendingCount: number }> {
    const data = await this.load(userId);
    const lastSync = data.deltas.length > 0 ? new Date(data.deltas[data.deltas.length - 1].timestamp).toISOString() : null;
    return { version: data.version, lastSyncAt: lastSync, pendingCount: 0 };
  }

  // ---- Persistencia: Redis por usuario (TTL) con respaldo en memoria acotado ----

  private async load(userId: string): Promise<SyncData> {
    const fromRedis = await this.redis.run(async (r) => {
      const [vRaw, stateRaw, seen, deltas] = await Promise.all([
        r.get(this.redis.key(`sync:version:${userId}`)),
        r.get(this.redis.key(`sync:state:${userId}`)),
        r.smembers(this.redis.key(`sync:actions:${userId}`)),
        r.lrange(this.redis.key(`sync:deltas:${userId}`), 0, -1),
      ]);
      return {
        version: vRaw ? Number(vRaw) : 0,
        state: stateRaw ? (JSON.parse(stateRaw) as Record<string, unknown>) : {},
        seen: new Set<string>(seen),
        deltas: deltas.length > 0 ? deltas.map((d) => JSON.parse(d) as Delta) : [],
      };
    }, 'sync.load');
    if (fromRedis) return fromRedis;
    return this.loadMemory(userId);
  }

  private async save(userId: string, data: SyncData, applied: string[], newDeltas: Delta[]): Promise<void> {
    const c = this.cfg;
    const ttl = c.ttlMs;
    await this.redis.run(async (r) => {
      const kVersion = this.redis.key(`sync:version:${userId}`);
      const kState = this.redis.key(`sync:state:${userId}`);
      const kActions = this.redis.key(`sync:actions:${userId}`);
      const kDeltas = this.redis.key(`sync:deltas:${userId}`);
      await Promise.all([r.psetex(kVersion, ttl, String(data.version)), r.psetex(kState, ttl, JSON.stringify(data.state))]);
      if (applied.length > 0) {
        await r.sadd(kActions, ...applied);
        await r.pexpire(kActions, ttl);
        const count = await r.scard(kActions);
        if (count > c.maxSeen) {
          // Recorte duro: se reemplaza el SET por el conjunto acotado (recientes).
          await r.del(kActions);
          await r.sadd(kActions, ...[...data.seen].slice(-c.maxSeen));
          await r.pexpire(kActions, ttl);
        }
      }
      if (newDeltas.length > 0) {
        await r.rpush(kDeltas, ...newDeltas.map((d) => JSON.stringify(d)));
        await r.ltrim(kDeltas, -c.maxDeltas, -1);
        await r.pexpire(kDeltas, ttl);
      }
    }, 'sync.save');

    // Espejo en memoria (acotado por usuario): permite seguir sirviendo el estado si Redis cae.
    this.saveMemory(userId, data);
  }

  /** Mantiene los `n` últimos elementos de un `Set` (JS preserva el orden de inserción). */
  private keepLastSet<T>(set: Set<T>, n: number): Set<T> {
    const arr = [...set];
    return new Set(arr.slice(Math.max(0, arr.length - n)));
  }

  // ---- Respaldo en memoria POR USUARIO (LRU + TTL, acotado) ----

  private loadMemory(userId: string): SyncData {
    const now = Date.now();
    const entry = this.memory.get(userId);
    if (entry) {
      if (now - entry.lastAccess > this.cfg.ttlMs) {
        this.memory.delete(userId);
        return { version: 0, state: {}, seen: new Set(), deltas: [] };
      }
      // Refresca la posición LRU (Map conserva el orden: el último set es el más reciente).
      this.memory.delete(userId);
      this.memory.set(userId, { ...entry });
      return { version: entry.version, state: entry.state, seen: entry.seen, deltas: entry.deltas };
    }
    return { version: 0, state: {}, seen: new Set(), deltas: [] };
  }

  private saveMemory(userId: string, data: SyncData): void {
    if (this.memory.size >= MAX_MEMORY_USERS) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest); // el primero es el más antiguo (LRU)
    }
    this.memory.set(userId, { ...data, lastAccess: Date.now() });
  }

  private applyAction(state: Record<string, unknown>, action: SyncAction): void {
    const petKey = `pet:${action.petId}`;
    let petState = (state[petKey] as Record<string, unknown>) ?? {
      hunger: 80, happiness: 80, energy: 80, hygiene: 80, health: 80,
    };

    switch (action.type) {
      case 'feed': petState.hunger = Math.min(100, Number(petState.hunger) + 15); break;
      case 'play': petState.happiness = Math.min(100, Number(petState.happiness) + 10); petState.energy = Math.max(10, Number(petState.energy) - 10); break;
      case 'clean': petState.hygiene = Math.min(100, Number(petState.hygiene) + 15); break;
      case 'sleep': petState.energy = 100; break;
      default: break;
    }
    petState.health = Math.max(10, Number(petState.health)); // La mascota no muere offline
    state[petKey] = petState;
  }
}
