import type { GameEvent } from './models';
import { eventStatus } from './models';
import { MockRepository } from './repository';
import { seedEvents, seedItems, seedPets, seedUsers } from './seed';

interface Thing {
  id: string;
  name: string;
  price: number;
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const seed = (): Thing[] => [
  { id: 'a', name: 'Manzana', price: 10 },
  { id: 'b', name: 'Baya', price: 25 },
];

function setup(storage = memoryStorage()) {
  const audit = { record: vi.fn() };
  const repo = new MockRepository<Thing>('cosas', seed, (t) => t.name, storage, audit, 0);
  return { repo, audit, storage };
}

describe('MockRepository', () => {
  it('devuelve la semilla mientras no haya cambios', async () => {
    const { repo, storage } = setup();
    expect(await repo.list()).toEqual(seed());
    expect(storage.length).toBe(0);
  });

  it('crea, actualiza y borra, dejando rastro en el registro', async () => {
    const { repo, audit } = setup();

    await repo.create({ id: 'c', name: 'Coral', price: 5 });
    await repo.update('a', { price: 99 });
    await repo.remove('b');

    expect(await repo.list()).toEqual([
      { id: 'c', name: 'Coral', price: 5 },
      { id: 'a', name: 'Manzana', price: 99 },
    ]);
    expect(audit.record.mock.calls).toEqual([
      ['Alta', 'cosas', 'Coral'],
      ['Cambio', 'cosas', 'Manzana (price)'],
      ['Baja', 'cosas', 'Baya'],
    ]);
  });

  it('persiste entre instancias que comparten almacén', async () => {
    const { repo, storage } = setup();
    await repo.update('a', { price: 77 });

    const other = setup(storage).repo;
    expect((await other.list()).find((t) => t.id === 'a')?.price).toBe(77);
  });

  it('no deja cambiar el id ni duplicarlo', async () => {
    const { repo } = setup();
    const updated = await repo.update('a', { id: 'zzz', name: 'Otra' });
    expect(updated.id).toBe('a');
    await expect(repo.create({ id: 'a', name: 'Repetida', price: 1 })).rejects.toThrow(/Ya existe/);
    await expect(repo.update('nope', { price: 1 })).rejects.toThrow(/No existe/);
  });

  it('reset vuelve a la semilla', async () => {
    const { repo } = setup();
    await repo.remove('a');
    await repo.reset();
    expect(await repo.list()).toEqual(seed());
  });

  it('descarta datos corruptos del almacén', async () => {
    const storage = memoryStorage();
    storage.setItem('pockai.admin.cosas', '{no es json');
    expect(await setup(storage).repo.list()).toEqual(seed());
  });
});

describe('semillas', () => {
  it('son deterministas y con ids únicos', () => {
    expect(seedUsers()).toEqual(seedUsers());
    expect(seedPets().map((p) => p.id)).toEqual(seedPets().map((p) => p.id));
    for (const rows of [seedItems(), seedEvents(), seedUsers(), seedPets()]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
  });

  it('el catálogo parte de shared/game-data y las mascotas tienen dueño existente', () => {
    expect(seedItems().some((i) => i.id === 'apple' && i.priceCoins === 10)).toBe(true);
    const emails = new Set(seedUsers().map((u) => u.email));
    expect(seedPets().every((p) => emails.has(p.owner))).toBe(true);
  });
});

describe('eventStatus', () => {
  const event: GameEvent = {
    id: 'e',
    name: 'E',
    type: 'festival',
    startDate: '2026-12-10',
    endDate: '2026-12-12',
    enabled: true,
    notes: '',
  };

  it('se calcula a partir de las fechas (ambas inclusive)', () => {
    expect(eventStatus(event, '2026-12-09')).toBe('Programado');
    expect(eventStatus(event, '2026-12-10')).toBe('Activo');
    expect(eventStatus(event, '2026-12-12')).toBe('Activo');
    expect(eventStatus(event, '2026-12-13')).toBe('Finalizado');
  });

  it('el interruptor manda sobre las fechas', () => {
    expect(eventStatus({ ...event, enabled: false }, '2026-12-11')).toBe('Desactivado');
  });
});
