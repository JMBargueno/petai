import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  createRng,
  desktopGapMs,
  hashSeed,
  isChannel,
  isTalkLevel,
  mobileDailyCap,
  normalizeInitiative,
  shouldGreetReturn,
  takeInitiative,
  talkFactor,
  type Channel,
  type InitiativeConfig,
  type PhraseEntry,
  type PhraseVars,
  type SilenceReason,
  type TalkLevel,
} from '@pockai/mind/node';
import { PrismaService } from '../../prisma/prisma.service';
import { SLOT_PREFIX, slotValue } from '../ai/memory';
import { MindService } from './mind.service';
import { MindMemoryService } from './mind-memory.service';
import { layerOf, type MemoryRow } from './memory.engine';
import type { Dims, StoredPersonality } from './mind.types';
import { planOwnerTurn } from './turn.engine';

// Mismo mecanismo que el resto de datos de juego que no se recargan en caliente
const PHRASE_DATA: { phrases: PhraseEntry[]; variables: Record<string, { source: string; fact?: string }> } = require('../../../../shared/game-data/phrases.json');

export interface InitiativeReply {
  /** Lo que dice, ya escrito; \`null\` si ahora calla. */
  phrase: { id: string; kind: string; text: string } | null;
  /** Por qué calla (para depurar y para que el cliente no insista). */
  reason?: SilenceReason | 'disabled';
  /** Cuándo tiene sentido volver a preguntar. */
  retryInMs: number;
  level: TalkLevel;
  /** Ánimo de corto plazo, para que el cliente acompañe la frase con el gesto adecuado. */
  feeling: string | null;
}

export interface InitiativeSettings {
  level: TalkLevel;
  levels: { id: TalkLevel; desktopMinutes: number; mobilePerDay: number; onlyOnReturn: boolean }[];
  /** Cuánto de hablador es este Pockai por su carácter (1 = lo normal). */
  talkFactor: number;
}

const HOUR_FLAG = (hour: number) => (hour >= 6 && hour < 12 ? 'morning' : hour >= 12 && hour < 19 ? 'afternoon' : hour >= 19 && hour < 23 ? 'evening' : 'night');

/** Hora (0-23) y día (\`AAAA-MM-DD\`) en la zona horaria del entrenador; UTC si no es válida. */
export function localClock(now: Date, timeZone: string | null | undefined): { hour: number; day: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return { hour: Number(get('hour')) % 24, day: `${get('year')}-${get('month')}-${get('day')}` };
  } catch {
    return { hour: now.getUTCHours(), day: now.toISOString().slice(0, 10) };
  }
}

/**
 * Iniciativa del Pockai (spec 41, fase B): decide en el servidor si la mascota tiene algo que
 * decir por su cuenta y qué. Las apps preguntan y muestran el resultado; no deciden nada.
 *
 * Aquí solo se reúnen los datos (situación, lo que sabe de su entrenador, nivel elegido) y se
 * guarda el estado. La decisión es de \`@pockai/mind\` (\`takeInitiative\`), con las frases y los
 * números de \`shared/game-data\`.
 *
 * Privacidad: solo responde al dueño de la mascota, y las frases usan datos del entrenador que
 * nunca salen por otro camino.
 */
@Injectable()
export class InitiativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mind: MindService,
    private readonly memory: MindMemoryService,
  ) {}

  private config(): InitiativeConfig | undefined {
    return this.mind.config().initiative;
  }

  private async petOf(userId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, userId }, include: { species: true } });
    if (!pet) throw new NotFoundException('Mascota no encontrada');
    return pet;
  }

  async settings(userId: string, petId: string): Promise<InitiativeSettings> {
    const pet = await this.petOf(userId, petId);
    const cfg = this.config();
    if (!cfg) throw new NotFoundException('La iniciativa no está disponible');
    const { dims, stored } = await this.mind.ensureDims(pet);
    const state = normalizeInitiative(stored.initiative);
    return this.describe(state.level ?? cfg.defaultLevel, dims, cfg);
  }

  async setLevel(userId: string, petId: string, level: unknown): Promise<InitiativeSettings> {
    if (!isTalkLevel(level)) throw new BadRequestException('level debe ser quiet, normal o chatty');
    const pet = await this.petOf(userId, petId);
    const cfg = this.config();
    if (!cfg) throw new NotFoundException('La iniciativa no está disponible');
    const { dims, stored } = await this.mind.ensureDims(pet);
    await this.mind.patchStored(pet.id, { initiative: { ...normalizeInitiative(stored.initiative), level } } as Partial<StoredPersonality>);
    return this.describe(level, dims, cfg);
  }

  private describe(level: TalkLevel, dims: Dims, cfg: InitiativeConfig): InitiativeSettings {
    return {
      level,
      // Los minutos y el tope ya llevan aplicado el carácter de este Pockai
      levels: (Object.keys(cfg.levels) as TalkLevel[]).map((id) => ({
        id,
        desktopMinutes: Math.round(desktopGapMs(id, dims, cfg) / 60_000),
        mobilePerDay: mobileDailyCap(id, dims, cfg),
        onlyOnReturn: !!cfg.levels[id].onlyOnReturn,
      })),
      talkFactor: talkFactor(dims, cfg),
    };
  }

  async speak(userId: string, petId: string, body: { channel?: unknown; back?: boolean; focus?: boolean }, now = new Date()): Promise<InitiativeReply> {
    if (!isChannel(body.channel)) throw new BadRequestException('channel debe ser desktop o mobile');
    const channel: Channel = body.channel;
    const pet = await this.petOf(userId, petId);
    const mindCfg = this.mind.config();
    const cfg = mindCfg.initiative;
    const { dims, stored } = await this.mind.ensureDims(pet);
    const state = normalizeInitiative(stored.initiative);
    const level = state.level ?? cfg?.defaultLevel ?? 'normal';
    const feeling = this.mind.feelingOf(stored, dims, pet, now)?.label ?? null;
    if (!cfg) return { phrase: null, reason: 'disabled', retryInMs: 3_600_000, level, feeling };

    const [user, rows, slots] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, timezone: true } }),
      this.memory.situationRows(pet.id).catch(() => [] as MemoryRow[]),
      this.prisma.petMemory.findMany({ where: { petId: pet.id, key: { startsWith: SLOT_PREFIX } }, select: { key: true, content: true } }),
    ]);
    const clock = localClock(now, user?.timezone);
    // La misma pizarra que monta el chat: qué le apetece, qué no ha contado, qué trucos sabe
    const plan = planOwnerTurn({ message: '', pet: { ...pet, lastInteractionAt: pet.lastInteractionAt ?? null }, dims, stored, rows, now }, mindCfg);
    const back = shouldGreetReturn(body.back === true, state, now.getTime(), cfg);

    const flags = new Set<string>([HOUR_FLAG(clock.hour)]);
    if (back) flags.add('back');
    if (state.day !== clock.day) flags.add('first_today');
    if ((pet.hunger ?? 100) < 30) flags.add('hungry');
    if ((pet.energy ?? 100) < 25) flags.add('tired');
    if ((pet.hygiene ?? 100) < 30) flags.add('dirty');
    if (feeling && feeling !== 'neutral') flags.add(`feeling_${feeling}`);
    for (const wish of plan.situation.wishes) flags.add(`wish_${wish}`);
    if (plan.tricks.known.length) flags.add('knows_trick');
    if (plan.situation.untold.length) flags.add('has_untold');

    const vars = this.variables(pet, user?.displayName, slots, rows, plan.tricks.known, mindCfg);
    if (vars['amigo.pockai']) flags.add('has_friend');

    const result = takeInitiative(
      PHRASE_DATA.phrases,
      { channel, level, dims, state, now: now.getTime(), localHour: clock.hour, localDay: clock.day, back, asleep: !!pet.sleeping, focus: body.focus === true },
      // Azar sembrado por mascota y minuto: repetir la petición en el mismo minuto da lo mismo
      { vars, lang: 'es', flags, rng: createRng(hashSeed(`initiative:${pet.id}:${Math.floor(now.getTime() / 60_000)}`)) },
      cfg,
    );
    if (result.phrase) {
      // El nivel elegido se conserva: solo cambian los enfriamientos y lo último que dijo
      await this.mind.patchStored(pet.id, { initiative: { ...result.state, ...(state.level ? { level: state.level } : {}) } } as Partial<StoredPersonality>);
    }
    return {
      phrase: result.phrase ? { id: result.phrase.id, kind: result.phrase.kind, text: result.phrase.text } : null,
      ...(result.reason ? { reason: result.reason } : {}),
      retryInMs: result.retryInMs,
      level,
      feeling,
    };
  }

  /** Lo que el Pockai sabe y puede poner en una frase dirigida a su entrenador. */
  private variables(
    pet: any,
    displayName: string | null | undefined,
    slots: { key: string | null; content: string }[],
    rows: readonly MemoryRow[],
    tricks: readonly string[],
    mindCfg: ReturnType<MindService['config']>,
  ): PhraseVars {
    const facts: Record<string, string> = {};
    for (const s of slots) {
      const id = (s.key ?? '').slice(SLOT_PREFIX.length);
      const value = slotValue(id, s.content);
      if (value) facts[id] = value;
    }
    const vars: Record<string, string | undefined> = {
      // El apodo que aprendió o, si no, su nombre de pila
      'nombre.custodio': facts['owner.nickname'] ?? (displayName ?? '').trim().split(/\s+/)[0] ?? undefined,
      'nombre.pockai': pet.nickname || pet.species?.name,
      'especie.pockai': pet.species?.name,
    };
    for (const [name, def] of Object.entries(PHRASE_DATA.variables)) {
      if (def.source === 'fact' && def.fact) vars[name] = facts[def.fact];
    }
    // Su mejor amigo: el Pockai con el que mejor se lleva, si ya son amigos
    const friend = rows
      .filter((r) => layerOf(r) === 'emotional' && !!r.subject?.startsWith('pet:') && ['friend', 'best_friend'].includes(String((r as { stage?: string }).stage)))
      .sort((a, b) => b.valence - a.valence)[0];
    if (friend) vars['amigo.pockai'] = friend.content.split('(')[0].trim();
    const trick = tricks[tricks.length - 1];
    if (trick && mindCfg.tricks?.catalog?.[trick]) vars['truco.pockai'] = mindCfg.tricks.catalog[trick].name;
    return vars;
  }
}
