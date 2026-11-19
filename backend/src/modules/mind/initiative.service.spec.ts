import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SLOT_PREFIX, slotContent } from '../ai/memory';
import { InitiativeService, localClock } from './initiative.service';
import { MindService } from './mind.service';
import { neutralDims } from './personality.engine';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.initiative;
// 10:00 en Madrid (UTC+1 en noviembre): de día y fuera de las horas de silencio
const NOW = new Date('2026-11-19T09:00:00Z');
const MIN = 60_000;

function setup(opts: { personality?: Record<string, unknown>; pet?: Record<string, unknown>; slots?: Record<string, string>; rows?: any[]; timezone?: string; displayName?: string | null } = {}) {
  const row: any = {
    id: 'pet-1',
    userId: 'u1',
    nickname: 'Lumo',
    speciesId: 'axolunar',
    visualSeed: 3,
    hunger: 80,
    energy: 80,
    hygiene: 80,
    happiness: 60,
    health: 100,
    sleeping: false,
    sick: false,
    lastInteractionAt: new Date(NOW.getTime() - 5 * MIN),
    personality: { dims: neutralDims(), ...(opts.personality ?? {}) },
    species: { id: 'axolunar', name: 'Axolunar' },
    ...(opts.pet ?? {}),
  };
  const slots = Object.entries(opts.slots ?? {}).map(([id, value]) => ({ key: `${SLOT_PREFIX}${id}`, content: slotContent(id, value) }));
  const tx = {
    $queryRaw: jest.fn(async () => [{ id: row.id }]),
    pet: {
      findUnique: jest.fn(async () => ({ ...row })),
      update: jest.fn(async ({ data }: any) => {
        row.personality = data.personality;
        return row;
      }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    pet: { findFirst: jest.fn(async ({ where }: any) => (where.id === row.id && where.userId === row.userId ? { ...row } : null)), update: jest.fn() },
    user: { findUnique: jest.fn(async () => ({ displayName: opts.displayName === undefined ? 'Jose Manuel' : opts.displayName, timezone: opts.timezone ?? 'Europe/Madrid' })) },
    petMemory: { findMany: jest.fn(async () => slots) },
  };
  const mind = new MindService(prisma, { getBalance: () => balance, getSpecies: () => [] } as any);
  const memory: any = { situationRows: jest.fn(async () => opts.rows ?? []) };
  return { svc: new InitiativeService(prisma, mind, memory), row, prisma };
}

describe('InitiativeService: el servidor decide qué dice el Pockai por su cuenta', () => {
  it('devuelve una frase ya escrita, con el nombre de pila del entrenador, y guarda que la ha dicho', async () => {
    const s = setup();
    const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    expect(r.phrase).not.toBeNull();
    expect(r.phrase!.text).not.toMatch(/\{|\}|undefined|Manuel/);
    expect(r.level).toBe('normal');
    expect(r.retryInMs).toBe(cfg.levels.normal.desktopMinutes * MIN);
    expect(s.row.personality.initiative.lastSpokenAt.desktop).toBe(NOW.getTime());
    expect(s.row.personality.initiative.recent).toEqual([r.phrase!.id]);
    // Lo demás de la personalidad se conserva
    expect(s.row.personality.dims).toEqual(neutralDims());
  });

  it('si acaba de hablar, calla y dice cuándo volver a preguntar', async () => {
    const s = setup();
    await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    const again = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, new Date(NOW.getTime() + 2 * MIN));
    expect(again.phrase).toBeNull();
    expect(again.reason).toBe('too_soon');
    expect(again.retryInMs).toBeGreaterThan(10 * MIN);
  });

  it('al volver su entrenador, le da la bienvenida una vez', async () => {
    const s = setup();
    await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    const back = await s.svc.speak('u1', 'pet-1', { channel: 'desktop', back: true }, new Date(NOW.getTime() + 6 * MIN));
    expect(back.phrase?.kind).toBe('return');
    // El cliente insiste en que «ha vuelto»: no hay segunda bienvenida
    const insist = await s.svc.speak('u1', 'pet-1', { channel: 'desktop', back: true }, new Date(NOW.getTime() + 12 * MIN));
    expect(insist.phrase?.kind).not.toBe('return');
  });

  it('usa lo que aprendió de su entrenador: su apodo y su mascota real', async () => {
    const s = setup({ slots: { 'owner.nickname': 'Jota', 'real_pet.type': 'perro', 'real_pet.name': 'Toby' } });
    const said: string[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, new Date(NOW.getTime() + i * 25 * MIN));
      if (r.phrase) said.push(r.phrase.text);
    }
    expect(said.some((t) => t.includes('Toby'))).toBe(true);
    expect(said.some((t) => t.includes('Jota'))).toBe(true);
    expect(said.join(' ')).not.toContain('Jose');
    for (const t of said) expect(t).not.toMatch(/\{|\}/);
  });

  it('sin nombre visible ni apodo, no dice frases que lo necesiten', async () => {
    const s = setup({ displayName: null });
    for (let i = 0; i < 30; i++) {
      const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, new Date(NOW.getTime() + i * 25 * MIN));
      if (r.phrase) expect(r.phrase.text).not.toMatch(/\{|\}|undefined|null|, \./);
    }
  });

  it('con hambre, lo primero que dice es que tiene hambre', async () => {
    const r = await setup({ pet: { hunger: 10 } }).svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    expect(r.phrase?.id).toBe('need_hungry');
  });

  it('recién regañado, se le nota en lo que dice', async () => {
    const s = setup({ personality: { feeling: { valence: -0.8, arousal: 0.8, at: NOW.getTime() } } });
    const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    expect(r.feeling).toBe('upset');
    expect(r.phrase?.id).toBe('feeling_upset');
  });

  it('habla de su mejor amigo si lo tiene', async () => {
    const rows = [{ id: 'e1', kind: 'relation', layer: 'emotional', key: 'emo:pet:b', subject: 'pet:b', content: 'Brasa (Pockai de Ana)', importance: 0.9, valence: 0.7, stage: 'best_friend', createdAt: NOW }];
    const s = setup({ rows });
    const said: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, new Date(NOW.getTime() + i * 25 * MIN));
      if (r.phrase) said.push(r.phrase.text);
    }
    expect(said.some((t) => t.includes('Brasa'))).toBe(true);
    expect(said.join(' ')).not.toContain('Pockai de Ana');
  });

  it('no habla dormido, ni de noche en la hora del entrenador, ni si está concentrado', async () => {
    expect((await setup({ pet: { sleeping: true } }).svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW)).reason).toBe('asleep');
    expect((await setup().svc.speak('u1', 'pet-1', { channel: 'desktop', focus: true }, NOW)).reason).toBe('focus');
    // Las 09:00 UTC son las 03:00 en Ciudad de México: horas de silencio
    expect((await setup({ timezone: 'America/Mexico_City' }).svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW)).reason).toBe('quiet_hours');
  });

  it('en el móvil respeta el tope diario', async () => {
    const s = setup();
    let spoken = 0;
    for (let i = 0; i < 20; i++) {
      const r = await s.svc.speak('u1', 'pet-1', { channel: 'mobile' }, new Date(NOW.getTime() + i * 30 * MIN));
      if (r.phrase) spoken++;
    }
    expect(spoken).toBe(cfg.levels.normal.mobilePerDay);
  });

  it('solo responde al dueño de la mascota y valida el canal', async () => {
    await expect(setup().svc.speak('otro', 'pet-1', { channel: 'desktop' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup().svc.speak('u1', 'pet-1', { channel: 'telegram' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().svc.settings('otro', 'pet-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InitiativeService: los tres niveles', () => {
  it('por defecto es el normal, y los niveles vienen ya ajustados al carácter de este Pockai', async () => {
    const neutral = await setup().svc.settings('u1', 'pet-1');
    expect(neutral.level).toBe('normal');
    expect(neutral.levels.map((l) => l.id)).toEqual(['quiet', 'normal', 'chatty']);
    expect(neutral.levels.find((l) => l.id === 'normal')!.desktopMinutes).toBe(cfg.levels.normal.desktopMinutes);
    const outgoing = await setup({ personality: { dims: { ...neutralDims(), sociability: 95, temper: 90 } } }).svc.settings('u1', 'pet-1');
    expect(outgoing.talkFactor).toBeGreaterThan(1);
    expect(outgoing.levels.find((l) => l.id === 'normal')!.desktopMinutes).toBeLessThan(cfg.levels.normal.desktopMinutes);
  });

  it('el nivel elegido se guarda y sobrevive a que hable', async () => {
    const s = setup();
    expect((await s.svc.setLevel('u1', 'pet-1', 'chatty')).level).toBe('chatty');
    const r = await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW);
    expect(r.level).toBe('chatty');
    expect(r.retryInMs).toBe(cfg.levels.chatty.desktopMinutes * MIN);
    expect(s.row.personality.initiative.level).toBe('chatty');
    expect((await s.svc.settings('u1', 'pet-1')).level).toBe('chatty');
  });

  it('en el más callado solo habla cuando su entrenador vuelve', async () => {
    const s = setup();
    await s.svc.setLevel('u1', 'pet-1', 'quiet');
    expect((await s.svc.speak('u1', 'pet-1', { channel: 'desktop' }, NOW)).reason).toBe('only_on_return');
    expect((await s.svc.speak('u1', 'pet-1', { channel: 'desktop', back: true }, NOW)).phrase?.kind).toBe('return');
  });

  it('rechaza un nivel que no existe', async () => {
    await expect(setup().svc.setLevel('u1', 'pet-1', 'gritón')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('localClock', () => {
  it('da la hora y el día del entrenador, y cae a UTC con una zona inválida', () => {
    expect(localClock(new Date('2026-11-19T23:30:00Z'), 'Europe/Madrid')).toEqual({ hour: 0, day: '2026-11-20' });
    expect(localClock(new Date('2026-11-19T23:30:00Z'), 'No/Existe')).toEqual({ hour: 23, day: '2026-11-19' });
    expect(localClock(new Date('2026-11-19T05:00:00Z'), null)).toEqual({ hour: 5, day: '2026-11-19' });
  });
});
