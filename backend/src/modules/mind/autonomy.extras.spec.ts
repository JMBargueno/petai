import * as fs from 'fs';
import * as path from 'path';
import { ACTIVITIES, Friend, activitiesFor, pickFriend, simulate } from './autonomy.engine';
import { withAffinity } from './autonomy.service';
import { MemoryRow } from './memory.engine';
import { AutonomyConfig } from './mind.types';
import { MindService } from './mind.service';
import { neutralDims } from './personality.engine';
import { AUTONOMY_CASES, AUTONOMY_TODAY } from './__fixtures__/autonomy-cases';

const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../shared/game-data/balance.json'), 'utf8'));
const cfg = balance.personality.autonomy as AutonomyConfig;
const baseline = JSON.parse(fs.readFileSync(path.resolve(__dirname, '__fixtures__/autonomy-baseline.json'), 'utf8'));

/** La configuración tal como era antes de la spec 37 §4.6: sin las actividades nuevas. */
function withoutExtras(): AutonomyConfig {
  const activities = { ...cfg.activities } as Record<string, unknown>;
  delete activities.practice_trick;
  delete activities.tidy_habitat;
  return { ...cfg, activities } as AutonomyConfig;
}

/** Lo que devolvía `simulate` antes no traía `practices`: se quita para comparar. */
const comparable = (res: ReturnType<typeof simulate>) => {
  const { practices, ...rest } = res;
  return { rest: JSON.parse(JSON.stringify(rest)), practices };
};

describe('Vida autónoma — determinismo tras las actividades nuevas (spec 37 §4.6)', () => {
  it.each(Object.keys(AUTONOMY_CASES))('sin las actividades nuevas, «%s» simula lo mismo que antes', (name) => {
    const { rest, practices } = comparable(simulate(AUTONOMY_CASES[name], withoutExtras(), AUTONOMY_TODAY));
    expect(rest).toEqual(baseline[name]);
    expect(practices).toBe(0);
  });

  it('con las actividades en la configuración pero sin venir a cuento, tampoco cambia nada', () => {
    // Fuera de casa y sin truco que aprender: ni ordenar ni practicar entran en el sorteo
    for (const name of ['neutral', 'curiosa', 'sociable', 'sin_amigos', 'cansada']) {
      expect(AUTONOMY_CASES[name].inHabitat).toBe(false);
      expect(comparable(simulate(AUTONOMY_CASES[name], cfg, AUTONOMY_TODAY)).rest).toEqual(baseline[name]);
    }
  });

  it('las actividades nuevas van al final de la lista, sin alterar el orden de las de siempre', () => {
    const input = { ...AUTONOMY_CASES.neutral, inHabitat: true, canPractice: true };
    const list = activitiesFor(input, cfg);
    expect(list.slice(0, ACTIVITIES.length)).toEqual(ACTIVITIES);
    expect(list.slice(ACTIVITIES.length).sort()).toEqual(['practice_trick', 'tidy_habitat']);
    expect(activitiesFor(AUTONOMY_CASES.neutral, cfg)).toBe(ACTIVITIES);
  });

  it('repetir la simulación con las actividades nuevas da lo mismo', () => {
    const input = { ...AUTONOMY_CASES.neutral, inHabitat: true, canPractice: true, boosts: { explore: 1.8 } };
    expect(simulate(input, cfg, AUTONOMY_TODAY)).toEqual(simulate(input, cfg, AUTONOMY_TODAY));
  });
});

describe('Vida autónoma — actividades nuevas y deseos', () => {
  const long = { ...AUTONOMY_CASES.neutral, to: AUTONOMY_CASES.neutral.from + 400 };
  const activitiesOf = (input: typeof long) => simulate(input, { ...cfg, memorableChance: 1, maxEpisodesPerCatchUp: 1000 }, AUTONOMY_TODAY).episodes.map((e) => e.activity);

  it('practica un truco solo si le queda alguno por aprender', () => {
    expect(simulate({ ...long, canPractice: true }, cfg, AUTONOMY_TODAY).practices).toBeGreaterThan(0);
    expect(simulate({ ...long, canPractice: false }, cfg, AUTONOMY_TODAY).practices).toBe(0);
  });

  it('ordena su hábitat solo cuando está en él', () => {
    expect(activitiesOf({ ...long, inHabitat: true })).toContain('tidy_habitat');
    expect(activitiesOf({ ...long, inHabitat: false })).not.toContain('tidy_habitat');
  });

  it('lo que le apetece lo hace más a menudo', () => {
    const count = (input: typeof long, activity: string) => activitiesOf(input).filter((a) => a === activity).length;
    expect(count({ ...long, boosts: { explore: 1.8 } }, 'explore')).toBeGreaterThan(count(long, 'explore'));
  });

  it('enferma o sin energía sigue descansando, tenga los deseos que tenga', () => {
    const sick = simulate({ ...long, sick: true, canPractice: true, boosts: { explore: 3 } }, cfg, AUTONOMY_TODAY);
    expect(sick.practices).toBe(0);
    expect(sick.itemsFound).toEqual([]);
  });
});

describe('Vida autónoma — a qué amigo va a ver (visit_friend)', () => {
  const friends: Friend[] = [
    { petId: 'a', name: 'Brasa', ownerId: 'u1', ownerName: 'Ana' },
    { petId: 'b', name: 'Lumo', ownerId: 'u2', ownerName: 'Luis' },
    { petId: 'c', name: 'Zarpa', ownerId: 'u3', ownerName: 'Eva' },
  ];
  const rel = (petId: string, valence: number, stage: string): MemoryRow =>
    ({ id: petId, kind: 'relation', layer: 'emotional', key: `emo:pet:${petId}`, subject: `pet:${petId}`, content: 'x', importance: 0.5, valence, stage, createdAt: new Date() }) as MemoryRow;

  it('sin relaciones guardadas elige igual que antes', () => {
    expect(withAffinity(friends, [])).toBe(friends);
    for (const r of [0, 0.2, 0.34, 0.5, 0.67, 0.99]) expect(pickFriend(friends, r)).toBe(friends[Math.floor(r * 3) % 3]);
  });

  it('con relaciones, va más a ver a su mejor amigo que a un desconocido', () => {
    const scored = withAffinity(friends, [rel('b', 0.8, 'best_friend'), rel('a', 0, 'stranger')]);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 1000; i++) counts[pickFriend(scored, (i + 0.5) / 1000).petId]++;
    expect(counts.b).toBeGreaterThan(counts.a * 3);
    expect(counts.b).toBeGreaterThan(counts.c * 3);
    // Nadie queda descartado del todo
    expect(counts.a).toBeGreaterThan(0);
    expect(counts.c).toBeGreaterThan(0);
  });

  it('usa la misma tirada: el resultado es estable para un mismo valor', () => {
    const scored = withAffinity(friends, [rel('b', 0.5, 'friend')]);
    expect(pickFriend(scored, 0.4)).toBe(pickFriend(scored, 0.4));
  });
});

describe('MindService.fulfilWish — deseos que se cumplen fuera del chat', () => {
  function setup(wishes: unknown) {
    const row: any = { id: 'pet-1', personality: { dims: neutralDims(), genes: [{ type: 'veloz' }], wishes } };
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
    const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)), pet: { updateMany: jest.fn(async () => ({ count: 1 })) } };
    const svc = new MindService(prisma, { getBalance: () => balance, getSpecies: () => [] } as any);
    return { svc, row, prisma };
  }
  const NOW = new Date('2026-11-18T12:00:00Z');

  it('si lo había expresado: entra en enfriamiento, gana felicidad acotada y conserva lo demás', async () => {
    const s = setup({ turn: 9, shownTurn: 4, shownId: 'go_explore', cooldownUntil: {} });
    expect(await s.svc.fulfilWish('pet-1', 'go_explore', NOW)).toBe(true);
    expect(new Date(s.row.personality.wishes.cooldownUntil.go_explore).getTime()).toBeGreaterThan(NOW.getTime());
    expect(s.row.personality.genes).toEqual([{ type: 'veloz' }]);
    const n = balance.personality.wishes.happinessOnFulfil;
    expect(s.prisma.pet.updateMany).toHaveBeenCalledWith({ where: { id: 'pet-1', happiness: { lte: 100 - n } }, data: { happiness: { increment: n } } });
  });

  it('si no lo había expresado no hay premio: ir de aventura no da felicidad extra porque sí', async () => {
    const s = setup({ turn: 9, cooldownUntil: {} });
    expect(await s.svc.fulfilWish('pet-1', 'go_explore', NOW)).toBe(false);
    expect(s.prisma.pet.updateMany).not.toHaveBeenCalled();
  });

  it('el mismo deseo no se premia dos veces seguidas', async () => {
    const s = setup({ turn: 9, shownId: 'see_friend', cooldownUntil: {} });
    expect(await s.svc.fulfilWish('pet-1', 'see_friend', NOW)).toBe(true);
    expect(await s.svc.fulfilWish('pet-1', 'see_friend', NOW)).toBe(false);
    expect(s.prisma.pet.updateMany).toHaveBeenCalledTimes(1);
  });
});
