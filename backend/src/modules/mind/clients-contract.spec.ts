import * as fs from 'fs';
import * as path from 'path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HabitatService } from '../habitat/habitat.service';
import { HabitatVisitService } from '../presence/habitat-visit.service';
import { BEHAVIORS, viewOf } from './behavior.engine';
import { EvolutionListener } from './evolution.listener';
import { neutralDims } from './personality.engine';
import { resolveScene } from './social.engine';
import { LANGS, pickText, text, textIds } from './strings';

const root = path.resolve(__dirname, '../../../..');
const json = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const balance = json('shared/game-data/balance.json');
const habitats = json('shared/game-data/habitats.json');
const NOW = new Date('2026-11-19T12:00:00Z');

describe('Cada reacción dice con qué clip se representa', () => {
  it('todas tienen clip, y existe en la hoja de animación de todas las especies', () => {
    const speciesDir = path.join(root, 'shared/assets/species');
    const sheets = fs
      .readdirSync(speciesDir)
      // Solo criaturas: el huevo tiene su propia hoja, sin reacciones
      .filter((d) => d !== 'egg' && fs.existsSync(path.join(speciesDir, d, 'anim.json')))
      .map((d) => ({ d, tags: new Set<string>(json(`shared/assets/species/${d}/anim.json`).meta.frameTags.map((t: { name: string }) => t.name)) }));
    expect(sheets.length).toBeGreaterThan(10);
    for (const action of BEHAVIORS) {
      const { clip } = viewOf(action);
      expect(clip).toBeTruthy();
      for (const s of sheets) expect(s.tags.has(clip) ? '' : `${action} → ${clip} falta en ${s.d}`).toBe('');
    }
  });

  it('las reacciones nuevas no se quedan en la animación base', () => {
    for (const action of ['bring_gift', 'tell_story', 'ask_about_day', 'apologize', 'perform_trick', 'accept_treat', 'hide'] as const) {
      expect(['idle', 'idle_alt']).not.toContain(viewOf(action).clip);
    }
  });
});

describe('Textos que quedaban en código (deuda 1.1)', () => {
  it('los dos idiomas siguen teniendo los mismos ids', () => {
    expect(textIds('en').sort()).toEqual(textIds('es').sort());
    expect(LANGS).toContain('en');
  });

  it('las escenas dan el mismo castellano de siempre', () => {
    const actor = (petId: string, name: string, ownerName: string) => ({ petId, name, ownerName, energy: 70, dims: neutralDims() });
    const scene = resolveScene({ host: actor('a', 'Lumo', 'Luis'), guest: actor('b', 'Brasa', 'Ana'), stage: 'stranger', slot: 0 }, balance.personality.social);
    expect(scene.type).toBe('greet');
    expect(['Ana vino a visitarme con Brasa. Nos olisqueamos con curiosidad.', 'Hoy conocí a Brasa, que vino de visita con Ana.']).toContain(scene.host.episode);
    expect(scene.guest.episode).toContain('Lumo');
    expect(scene.host.episode + scene.guest.episode).not.toMatch(/\{\w+\}/);
  });

  it('las mismas escenas, en inglés', () => {
    const actor = (petId: string, name: string, ownerName: string) => ({ petId, name, ownerName, energy: 70, dims: neutralDims() });
    const scene = resolveScene({ host: actor('a', 'Lumo', 'Luis'), guest: actor('b', 'Brasa', 'Ana'), stage: 'stranger', slot: 0, lang: 'en' }, balance.personality.social);
    expect(scene.host.episode).toMatch(/Ana|Brasa/);
    expect(scene.host.episode).toMatch(/came to visit|I met/);
  });

  it('pickText elige de forma estable y rellena los huecos', () => {
    expect(pickText('SCENE_PLAY_TAG_HOST_FIRST', 0, { friend: 'Brasa' })).toBe('Jugué al pilla-pilla con Brasa por mi sala. Corre mucho.');
    expect(pickText('SCENE_PLAY_TAG_HOST_FIRST', 0.99, { friend: 'Brasa' })).toBe('Brasa y yo nos perseguimos hasta quedarnos sin aliento.');
    expect(() => pickText('NO_EXISTE', 0.5)).toThrow();
    expect(text('LABEL_POCKAI', { friend: 'Brasa', owner: 'Ana' })).toBe('Brasa (Pockai de Ana)');
  });

  it('no quedan frases en castellano en los motores y servicios migrados', () => {
    const src = (rel: string) => fs.readFileSync(path.join(root, 'backend/src/modules', rel), 'utf8');
    const files = ['mind/social.engine.ts', 'mind/wishes.engine.ts', 'mind/turn.engine.ts', 'mind/encounter.service.ts', 'mind/evolution.listener.ts', 'mind/autonomy.service.ts'].map(src);
    const es = json('shared/game-data/strings/es.json') as Record<string, string>;
    for (const [id, value] of Object.entries(es)) {
      if (!/^(SCENE_|WISH_|TURN_|TRICK_|EVENT_|CARE_|GIFT_|RUMOR_|FURNITURE_)/.test(id) || /^SCENE_NOTE_/.test(id)) continue;
      const literal = value.split(/\{\w+\}/).sort((a, b) => b.length - a.length)[0];
      if (literal.length < 12) continue;
      for (const file of files) expect(file.includes(literal) ? id : '').toBe('');
    }
  });
});

// ── Usar un mueble ──────────────────────────────────────────────────────────

function habitatSetup(opts: { inHabitat?: boolean; sleeping?: boolean; redisDown?: boolean; furnitureId?: string; owner?: string } = {}) {
  const store = new Map<string, string>();
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, ...rest: unknown[]) => {
      if (rest.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    expire: async () => 1,
  };
  const redis: any = { key: (n: string) => `t:${n}`, run: async (fn: any) => (opts.redisDown ? null : fn(client)) };
  const withInteraction = (wanted: string) => habitats.furniture.find((f: any) => f.interaction === wanted).id;
  const pet: any = { id: 'p1', userId: opts.owner ?? 'u1', hunger: 50, happiness: 50, energy: 50, hygiene: 50, inHabitat: opts.inHabitat ?? true, sleeping: !!opts.sleeping };
  const items: Record<string, any> = {
    eat: { id: 'eat', petId: 'p1', furnitureId: withInteraction('eat') },
    play: { id: 'play', petId: 'p1', furnitureId: withInteraction('play') },
    sleep: { id: 'sleep', petId: 'p1', furnitureId: withInteraction('sleep') },
    deco: { id: 'deco', petId: 'p1', furnitureId: habitats.furniture.find((f: any) => !f.interaction).id },
  };
  const prisma: any = {
    habitatItem: { findUnique: jest.fn(async ({ where }: any) => items[where.id] ?? null) },
    pet: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === pet.id && where.userId === pet.userId ? pet : null)),
      update: jest.fn(async ({ data }: any) => Object.assign(pet, data)),
    },
  };
  const events: any = { emit: jest.fn() };
  const gameData: any = { getHabitats: () => habitats, getBalance: () => balance };
  const service = new HabitatService(prisma, {} as any, gameData, redis, events);
  return { service, pet, prisma, events, store };
}
const use = balance.habitat.use;
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('Usar un mueble tiene un efecto pequeño y acotado (deuda 1.4)', () => {
  it('sube el vital que toca y avisa a la mente', async () => {
    const s = habitatSetup();
    const res = await s.service.useItem('u1', 'eat', NOW);
    expect(res).toMatchObject({ applied: true, interaction: 'eat', remainingToday: use.dailyCap - 1 });
    expect(res.vitals.hunger).toBe(50 + use.effects.eat.hunger);
    expect(s.events.emit).toHaveBeenCalledWith('habitat:furniture_used', { userId: 'u1', petId: 'p1', interaction: 'eat', firstToday: true });
  });

  it('entre un uso y otro hay un enfriamiento', async () => {
    const s = habitatSetup();
    await s.service.useItem('u1', 'eat', NOW);
    expect(await s.service.useItem('u1', 'play', later(5))).toMatchObject({ applied: false, reason: 'cooldown' });
    expect(s.pet.happiness).toBe(50);
  });

  it('cincuenta avisos seguidos no superan el tope diario, y al día siguiente vuelve a contar', async () => {
    const s = habitatSetup();
    let applied = 0;
    for (let i = 0; i < 50; i++) {
      // Cada aviso llega pasado el enfriamiento: lo único que frena es el tope
      s.store.delete('t:furniture:cooldown:p1');
      (s.service as any).localCooldown.clear();
      if ((await s.service.useItem('u1', 'eat', later(i * (use.cooldownSeconds + 1)))).applied) applied++;
    }
    expect(applied).toBe(use.dailyCap);
    expect(s.pet.hunger).toBe(50 + use.dailyCap * use.effects.eat.hunger);
    expect(await s.service.useItem('u1', 'eat', later(use.cooldownSeconds))).toMatchObject({ applied: false, reason: 'daily_cap' });
    (s.service as any).localCooldown.clear();
    s.store.delete('t:furniture:cooldown:p1');
    expect((await s.service.useItem('u1', 'eat', later(86_400 + 60))).applied).toBe(true);
  });

  it('los vitales no pasan de 100 ni bajan de 0', async () => {
    const s = habitatSetup();
    s.pet.happiness = 99;
    s.pet.energy = 0;
    const res = await s.service.useItem('u1', 'play', NOW);
    expect(res.vitals).toMatchObject({ happiness: 100, energy: 0 });
  });

  it('fuera de su hábitat o dormido no tiene efecto; dormir en su cama, sí', async () => {
    expect(await habitatSetup({ inHabitat: false }).service.useItem('u1', 'eat', NOW)).toMatchObject({ applied: false, reason: 'away' });
    const asleep = habitatSetup({ sleeping: true });
    expect(await asleep.service.useItem('u1', 'eat', NOW)).toMatchObject({ applied: false, reason: 'asleep' });
    expect((await asleep.service.useItem('u1', 'sleep', NOW)).applied).toBe(true);
  });

  it('un mueble ajeno o inexistente es un 404, y uno decorativo no se puede usar', async () => {
    await expect(habitatSetup().service.useItem('otro', 'eat', NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(habitatSetup().service.useItem('u1', 'no-existe', NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(habitatSetup().service.useItem('u1', 'deco', NOW)).rejects.toThrow('no se puede usar');
  });

  it('sin Redis se mantienen el tope y el enfriamiento', async () => {
    const s = habitatSetup({ redisDown: true });
    expect((await s.service.useItem('u1', 'eat', NOW)).applied).toBe(true);
    expect(await s.service.useItem('u1', 'eat', later(1))).toMatchObject({ applied: false, reason: 'cooldown' });
    let applied = 1;
    for (let i = 1; i < 30; i++) if ((await s.service.useItem('u1', 'eat', later(i * (use.cooldownSeconds + 1)))).applied) applied++;
    expect(applied).toBe(use.dailyCap);
  });
});

describe('La mente se entera de los muebles y de los paquetes de cuidados', () => {
  const build = () => {
    const mind: any = { applyExperience: jest.fn(async () => null), config: () => balance.personality };
    const memory: any = { remember: jest.fn(async () => 1), feel: jest.fn(async () => ({ valence: 0, stage: null })) };
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ displayName: 'Eva', activePetId: 'p1' })) },
      pet: { findFirst: jest.fn(async () => ({ id: 'p1', userId: 'u1', nickname: 'Lumo' })) },
    };
    return { listener: new EvolutionListener(prisma, mind, memory), mind, memory };
  };

  it('usar un mueble deriva su carácter siempre y deja recuerdo solo la primera vez del día', async () => {
    const s = build();
    await s.listener.onFurnitureUsed({ petId: 'p1', interaction: 'bathe', firstToday: true });
    await s.listener.onFurnitureUsed({ petId: 'p1', interaction: 'bathe', firstToday: false });
    expect(s.mind.applyExperience).toHaveBeenCalledTimes(2);
    expect(s.mind.applyExperience).toHaveBeenCalledWith('p1', ['furniture_bathe']);
    expect(s.memory.remember).toHaveBeenCalledTimes(1);
    expect(s.memory.remember.mock.calls[0][1][0]).toMatchObject({ key: 'use:bathe', bump: true, content: 'Me di un buen baño en mi hábitat.' });
  });

  it('un uso desconocido no rompe ni inventa un recuerdo', async () => {
    const s = build();
    await expect(s.listener.onFurnitureUsed({ petId: 'p1', interaction: 'teletransporte', firstToday: true })).resolves.toBeUndefined();
    expect(s.memory.remember).not.toHaveBeenCalled();
  });

  it('un paquete de cuidados se recuerda como tal, con quien lo envió como sujeto', async () => {
    const s = build();
    await s.listener.onGift({ senderId: 'friend', recipientId: 'u1', petId: 'p1', kind: 'care' });
    expect(s.memory.remember.mock.calls[0][1][0]).toMatchObject({ subject: 'user:friend', content: 'Eva me mandó un paquete de cuidados. Me sentí mucho mejor.' });
    expect(s.memory.feel).toHaveBeenCalledWith('p1', 'user:friend', 'Eva (otro entrenador)', 0.1);
  });

  it('el servicio de paquetes de cuidados emite el evento', () => {
    const src = fs.readFileSync(path.join(root, 'backend/src/modules/gifting/care-package.service.ts'), 'utf8');
    expect(src).toMatch(/emit\('gift:received', \{[^}]*kind: 'care'/);
  });
});

// ── La sala del amigo ───────────────────────────────────────────────────────

function visitSetup(opts: { visit?: boolean } = {}) {
  const hostRow: any = {
    id: 'host-pet', userId: 'owner', nickname: 'Lumo', stage: 'juvenile', energy: 70, sleeping: false, hunger: 12, happiness: 88, hygiene: 40, health: 77, intelligence: 321,
    personality: { dims: neutralDims(), secreto: 'trabaja en un banco' }, palette: { primary: '#112233', secondary: '#445566' }, patternId: 'plain', visualSeed: 7, shiny: false, accessories: {},
    species: { id: 'axolunar', name: 'Axolunar' },
  };
  const guestRow: any = { ...hostRow, id: 'guest-pet', userId: 'visitor', nickname: 'Brasa', species: { id: 'ignisaur', name: 'Ignisaur' } };
  const prisma: any = {
    habitatVisit: { findFirst: jest.fn(async () => (opts.visit === false ? null : { id: 'v1', visitorId: 'visitor', ownerId: 'owner', petId: 'guest-pet' })) },
    user: { findUnique: jest.fn(async () => ({ activePetId: 'host-pet', displayName: 'Luis', handle: 'luis' })) },
    pet: { findFirst: jest.fn(async ({ where }: any) => (where.userId === 'visitor' ? guestRow : hostRow)) },
  };
  const sala = habitats.rooms[0];
  const bed = habitats.furniture.find((f: any) => f.interaction === 'sleep');
  const habitatService: any = {
    getHabitat: jest.fn(async () => ({
      petId: 'host-pet',
      habitatSeed: 99,
      rooms: [{ id: sala.id, name: sala.name, description: 'x', theme: sala.theme ?? null, gridWidth: sala.gridWidth, gridHeight: sala.gridHeight, blocked: [], unlocked: true, active: true, items: [{ id: 'i1', furnitureId: bed.id, x: 1, y: 1, rotation: 0 }] }],
    })),
    getCatalog: () => ({ rooms: habitats.rooms, furniture: habitats.furniture, buffCaps: {} }),
  };
  const moduleRef: any = { get: jest.fn((type: any) => (type === HabitatService ? habitatService : null)) };
  const realtime: any = { emitToUser: jest.fn() };
  const svc = new HabitatVisitService(prisma, {} as any, realtime, moduleRef, { emit: jest.fn() } as any);
  return { svc, realtime, bed };
}

describe('La sala del amigo, para quien le visita (deuda 1.6)', () => {
  it('sin visita activa → 403', async () => {
    await expect(visitSetup({ visit: false }).svc.visitRoom('visitor', 'owner')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('devuelve la sala, sus muebles y el aspecto de los dos Pockai', async () => {
    const s = visitSetup();
    const res = await s.svc.visitRoom('visitor', 'owner');
    expect(Object.keys(res).sort()).toEqual(['furniture', 'guest', 'host', 'ownerId', 'room']);
    expect(res.room.items).toEqual([{ id: 'i1', furnitureId: s.bed.id, x: 1, y: 1, rotation: 0 }]);
    expect(res.furniture.map((f) => f.id)).toEqual([s.bed.id]);
    expect(res.host).toMatchObject({ petId: 'host-pet', nickname: 'Lumo', speciesId: 'axolunar', look: { visualSeed: 7 } });
    expect(res.guest).toMatchObject({ petId: 'guest-pet', nickname: 'Brasa', speciesId: 'ignisaur' });
  });

  it('del anfitrión no viaja nada más: ni vitales, ni personalidad, ni recuerdos', async () => {
    const res = await visitSetup().svc.visitRoom('visitor', 'owner');
    const sent = JSON.stringify(res);
    for (const leak of ['banco', 'personality', 'dims', 'hunger', 'happiness', 'hygiene', 'health', 'intelligence', 'energy', 'habitatSeed', 'userId']) {
      expect(sent.includes(leak) ? leak : '').toBe('');
    }
    expect(Object.keys(res.host).sort()).toEqual(['look', 'nickname', 'petId', 'speciesId', 'speciesName', 'spriteRef', 'stage']);
  });

  it('la escena llega a los dos; al visitante, sin los rasgos (que son los de su propio Pockai)', () => {
    const s = visitSetup();
    s.svc.onSceneResolved({ ownerId: 'owner', visitorId: 'visitor', scene: { slot: 1, type: 'play_tag', stage: 'friend', hostPetId: 'host-pet', guestPetId: 'guest-pet', guestTraits: { temper: 'calm' } } });
    const calls = s.realtime.emitToUser.mock.calls;
    expect(calls[0]).toEqual(['owner', 'habitat:scene', expect.objectContaining({ role: 'host', type: 'play_tag', guestTraits: { temper: 'calm' } })]);
    expect(calls[1][0]).toBe('visitor');
    expect(calls[1][2]).toEqual({ ownerId: 'owner', visitorId: 'visitor', role: 'guest', slot: 1, type: 'play_tag', stage: 'friend', hostPetId: 'host-pet', guestPetId: 'guest-pet' });
  });
});
