import festivals from '../../../../../shared/game-data/festivals.json';
import foods from '../../../../../shared/game-data/foods.json';
import seasons from '../../../../../shared/game-data/seasons.json';
import species from '../../../../../shared/game-data/species.json';
import type { AdminUser, CatalogItem, GameEvent, ItemKind, PetEntry, SpeciesEntry } from './models';

/**
 * Semillas del mock. El catálogo, las festividades, las temporadas y las especies salen de
 * shared/game-data (los mismos ficheros que usa el juego); huevos, torneos, raids, usuarios
 * y mascotas son inventados y deterministas (misma semilla → mismos datos).
 */

/** PRNG determinista (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromNow = (days: number) => isoDate(new Date(Date.now() + days * 86_400_000));

export function seedItems(): CatalogItem[] {
  const catalog: CatalogItem[] = foods.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind as ItemKind,
    description: f.description,
    priceCoins: f.priceCoins,
    priceGems: f.priceGems,
    active: true,
  }));
  const egg = (id: string, name: string, priceCoins: number, priceGems: number): CatalogItem => ({
    id,
    name,
    kind: 'egg',
    description: 'Precio de ejemplo: el backend aún no expone el catálogo de huevos.',
    priceCoins,
    priceGems,
    active: true,
  });
  const pass = (s: { id: string; name: string; passPrice: number }): CatalogItem => ({
    id: `pass_${s.id}`,
    name: `Pase · ${s.name}`,
    kind: 'pass',
    description: 'Pase de temporada (precio en gemas).',
    priceCoins: 0,
    priceGems: s.passPrice,
    active: true,
  });
  return [
    ...catalog,
    egg('egg_basic', 'Huevo básico', 250, 0),
    egg('egg_rare', 'Huevo raro', 0, 15),
    egg('egg_legendary', 'Huevo legendario', 0, 60),
    pass(seasons.currentSeason),
    pass(seasons.upcomingSeason),
  ];
}

export function seedEvents(): GameEvent[] {
  const year = new Date().getFullYear();
  const fromFestivals: GameEvent[] = festivals.map((f) => {
    const end = f as { monthEnd?: number; dayEnd?: number };
    return {
      id: f.id,
      name: f.name,
      type: 'festival',
      startDate: `${year}-${pad(f.monthStart)}-${pad(f.dayStart)}`,
      endDate: `${year}-${pad(end.monthEnd ?? f.monthStart)}-${pad(end.dayEnd ?? f.dayStart)}`,
      enabled: true,
      notes: `Accesorio: ${f.accessory}. ${f.message}`,
    };
  });
  const fromSeasons: GameEvent[] = [seasons.currentSeason, seasons.upcomingSeason].map((s) => ({
    id: `season_${s.id}`,
    name: s.name,
    type: 'season',
    startDate: s.startTime.slice(0, 10),
    endDate: s.endTime.slice(0, 10),
    enabled: true,
    notes: `${s.maxTier} niveles · ${s.xpPerTier} XP por nivel`,
  }));
  return [
    ...fromFestivals,
    ...fromSeasons,
    {
      id: 'tournament_demo',
      name: 'Copa Amanecer',
      type: 'tournament',
      startDate: daysFromNow(7),
      endDate: daysFromNow(9),
      enabled: true,
      notes: 'Torneo de ejemplo: eliminatoria de 16 participantes.',
    },
    {
      id: 'raid_demo',
      name: 'Raid: Coloso de Ceniza',
      type: 'raid',
      startDate: daysFromNow(-1),
      endDate: daysFromNow(2),
      enabled: true,
      notes: 'Raid cooperativa de ejemplo.',
    },
  ];
}

const NAMES = ['Ada', 'Bruno', 'Carla', 'Dani', 'Elena', 'Fer', 'Gala', 'Hugo', 'Inés', 'Javi', 'Kira', 'Leo', 'Marta', 'Nico', 'Olga', 'Pau', 'Quim', 'Rosa', 'Saúl', 'Tere', 'Unai', 'Vera', 'Xavi', 'Yago'];
const NICKNAMES = ['Chispa', 'Luna', 'Brote', 'Tizón', 'Gota', 'Mochi', 'Pixel', 'Nube', 'Trufa', 'Rayo', 'Kiwi', 'Bolita', 'Sombra', 'Coco', 'Miso', 'Pompa'];
const RARITY_ROLL: [string, number][] = [['normal', 0.6], ['rare', 0.85], ['super_rare', 0.95], ['legendary', 0.99], ['mythic', 1]];

export function seedUsers(): AdminUser[] {
  const next = rng(20261114);
  return NAMES.map((name, i) => ({
    id: `user-${pad(i + 1)}`,
    // Dominio reservado para ejemplos: ninguna de estas cuentas existe.
    email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}${i + 1}@example.com`,
    displayName: name,
    coins: Math.floor(next() * 5000),
    gems: Math.floor(next() * 120),
    accountXp: Math.floor(next() * 20000),
    status: next() < 0.1 ? 'suspended' : 'active',
    createdAt: daysFromNow(-Math.floor(next() * 300)),
  }));
}

export function seedSpecies(): SpeciesEntry[] {
  return species.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    element: s.element,
    rarity: s.rarity,
    ...s.baseStats,
    favoriteFood: s.favoriteFood,
    spriteKey: s.spriteKey,
  }));
}

export function seedPets(): PetEntry[] {
  const next = rng(42);
  const users = seedUsers();
  const stageFor = (level: number): PetEntry['stage'] =>
    level >= 50 ? 'final' : level >= 25 ? 'adult' : level >= 10 ? 'juvenile' : 'baby';
  return Array.from({ length: 40 }, (_, i) => {
    const roll = next();
    const level = 1 + Math.floor(next() ** 2 * 70);
    return {
      id: `pet-${pad(i + 1)}`,
      nickname: NICKNAMES[Math.floor(next() * NICKNAMES.length)],
      speciesId: species[Math.floor(next() * species.length)].id,
      owner: users[Math.floor(next() * users.length)].email,
      rarity: RARITY_ROLL.find(([, limit]) => roll < limit)![0],
      level,
      stage: stageFor(level),
      shiny: next() < 0.05,
      sick: next() < 0.08,
    };
  });
}
