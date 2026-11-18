import { Injectable } from '@nestjs/common';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import type { Dims } from './mind.types';
import { pickRumor, resolveScene, type RumorPick, type SceneResult, type SceneType, type Shareable, type Stage } from './social.engine';

/** Un Pockai que participa en un encuentro. */
export interface EncounterPet {
  id: string;
  name: string;
  /** Nombre de su entrenador (para lo que recuerda el otro). */
  ownerName: string;
  dims: Dims;
  energy: number;
}

export interface EncounterInput {
  /** En cuya casa ocurre. Entre compañeros de casa da igual quién sea cuál. */
  host: EncounterPet;
  guest: EncounterPet;
  /** Ranura: siembra el azar de la pareja. */
  slot: number;
  /** Es el momento de llegar (por defecto, la ranura 0). */
  first?: boolean;
  /** Buddies del mismo entrenador. */
  sameHome?: boolean;
  /** Escena anterior entre ambos. Si no se da, se deduce de cómo acabó su último encuentro. */
  previous?: SceneType | null;
  /** Cuándo ocurrió (la vida autónoma fecha los encuentros en el pasado). */
  at?: Date;
}

export interface ResolvedEncounter {
  input: EncounterInput;
  scene: SceneResult;
  stage: Stage;
  previous: SceneType | null;
  rumor: RumorPick | null;
}

const IMPORTANCE = 0.6;

/**
 * Un encuentro entre dos Pockai (spec 37 §6.3 a §6.5). Es el único sitio que decide qué viven y
 * qué recuerda cada uno; lo usan la visita en vivo, los encuentros de la vida autónoma y los
 * buddies del mismo entrenador. Así los tres caminos comparten escenas, relación, rumores y regalos.
 *
 * `resolve` no escribe nada (misma pareja y misma ranura dan lo mismo); `record` guarda el
 * recuerdo de cada uno y mueve la relación.
 */
@Injectable()
export class EncounterService {
  constructor(
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
  ) {}

  async resolve(input: EncounterInput): Promise<ResolvedEncounter> {
    const social = this.mind.config().social;
    const now = input.at ?? new Date();
    const stage = await this.memory.stageWith(input.host.id, `pet:${input.guest.id}`);
    // Sin escena anterior conocida: si lo último entre ellos acabó mal, hoy pueden hacer las paces
    const previous =
      input.previous !== undefined
        ? input.previous
        : (((await this.memory.lastEncounterMood?.(input.host.id, `pet:${input.guest.id}`)) ?? 0) < 0 ? 'squabble' : null);

    // Lo que cada uno podría contar o regalar. Entre compañeros de casa no hay ni rumores ni
    // regalos: lo viven todo juntos y comparten inventario.
    let shareable: { host: Shareable[]; guest: Shareable[] } = { host: [], guest: [] };
    if (!input.sameHome && social.rumors) {
      const kinds = [...new Set([...social.rumors.kinds, 'find'])];
      const since = new Date(now.getTime() - social.rumors.maxAgeDays * 86_400_000);
      const [host, guest] = await Promise.all([
        this.memory.shareableEpisodes?.(input.host.id, kinds, since),
        this.memory.shareableEpisodes?.(input.guest.id, kinds, since),
      ]);
      shareable = { host: host ?? [], guest: guest ?? [] };
    }
    const hasFind = (rows: Shareable[]) => rows.some((m) => m.kind === 'find');

    const scene = resolveScene(
      {
        host: { petId: input.host.id, name: input.host.name, ownerName: input.host.ownerName, dims: input.host.dims, energy: input.host.energy, hasFind: hasFind(shareable.host) },
        guest: { petId: input.guest.id, name: input.guest.name, ownerName: input.guest.ownerName, dims: input.guest.dims, energy: input.guest.energy, hasFind: hasFind(shareable.guest) },
        stage,
        slot: input.slot,
        previous,
        first: input.first,
        sameHome: input.sameHome,
      },
      social,
    );
    const rumor = input.sameHome
      ? null
      : pickRumor(
          { hostId: input.host.id, guestId: input.guest.id, hostName: input.host.name, guestName: input.guest.name, stage, slot: input.slot, type: scene.type },
          shareable,
          social,
          now,
        );
    return { input, scene, stage, previous, rumor };
  }

  /** Guarda lo que cada uno recuerda del encuentro y mueve lo que sienten el uno por el otro. */
  async record(res: ResolvedEncounter): Promise<void> {
    const { input, scene, rumor } = res;
    const { host, guest } = input;
    const createdAt = input.at ? { createdAt: input.at } : {};
    const label = (p: EncounterPet) => (input.sameHome ? `${p.name} (mi compañero de casa)` : `${p.name} (Pockai de ${p.ownerName})`);

    // El anfitrión recuerda una visita recibida; el otro, un encuentro. Su entrenador se entera
    // antes de quién vino a casa que de adónde fue (§6.6).
    await this.memory.remember(guest.id, [
      { layer: 'episodic', kind: 'encounter', content: scene.guest.episode, importance: IMPORTANCE, valence: scene.guest.mood, subject: `pet:${host.id}`, ...createdAt },
    ]);
    await this.memory.remember(host.id, [
      {
        layer: 'episodic',
        kind: input.sameHome ? 'encounter' : 'visit',
        content: scene.host.episode,
        importance: IMPORTANCE,
        valence: scene.host.mood,
        subject: `pet:${guest.id}`,
        ...createdAt,
      },
    ]);
    await this.memory.feel(host.id, `pet:${guest.id}`, label(guest), scene.host.delta);
    await this.memory.feel(guest.id, `pet:${host.id}`, label(host), scene.guest.delta);

    if (rumor) {
      const teller = rumor.teller === 'host' ? host : guest;
      const listener = rumor.teller === 'host' ? guest : host;
      // Con clave por recuerdo de origen: el mismo rumor no se guarda dos veces
      await this.memory.remember(listener.id, [
        {
          layer: 'episodic',
          kind: 'rumor',
          key: `rumor:${rumor.source.id}`,
          content: rumor.content,
          importance: this.mind.config().social.rumors?.importance ?? 0.35,
          valence: 0.2,
          subject: `pet:${teller.id}`,
          ...createdAt,
        },
      ]);
    }
  }

  async play(input: EncounterInput): Promise<ResolvedEncounter> {
    const res = await this.resolve(input);
    await this.record(res);
    return res;
  }
}
