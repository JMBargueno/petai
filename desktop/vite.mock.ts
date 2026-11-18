/**
 * Modo demo del escritorio: responde a la API (`/v1/*`) con datos de ejemplo para revisar la
 * interfaz sin backend ni base de datos. Solo se activa con `VITE_MOCK=1` (`pnpm desktop:demo`);
 * en cualquier otro caso el plugin no hace nada y la app habla con el servidor real.
 *
 * No es un simulador del juego: las escrituras devuelven una respuesta verosímil y ajustan lo
 * mínimo (saldo, inventario) para poder recorrer los flujos. Para forzar un error en una ruta,
 * añade `?__fail=1` o define `MOCK_FAIL` con parte de la ruta (p. ej. `MOCK_FAIL=/v1/chests`).
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Handler = (ctx: { m: RegExpMatchArray; body: any; query: URLSearchParams }) => unknown;

const now = Date.now();
const iso = (deltaMs = 0) => new Date(now + deltaMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const balance = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/game-data/balance.json'), 'utf8'));
const habitats = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/game-data/habitats.json'), 'utf8'));

// ── Estado mutable de la sesión demo ─────────────────────────────────────────
const user = {
  id: 'u-demo',
  email: 'demo@pockai.test',
  displayName: 'Entrenadora Demo',
  handle: 'demo',
  emailVerified: true,
  coins: 1250,
  gems: 40,
  timezone: 'Europe/Madrid',
  notificationPrefs: { hunger: true, hygiene: true, energy: true, happiness: false, social: true, maxPerDay: 6 },
};

function pet(id: string, nickname: string, speciesId: string, speciesName: string, element: string, rarity: string, extra: object = {}) {
  return {
    id,
    nickname,
    speciesId,
    speciesName,
    species: { id: speciesId, name: speciesName, element, spriteKey: speciesId },
    spriteRef: `sprites/${speciesId}_idle`,
    stage: 'baby',
    rarity,
    level: 7,
    xp: 340,
    hunger: 72,
    happiness: 81,
    energy: 64,
    hygiene: 38,
    health: 100,
    sleeping: false,
    sick: false,
    shiny: false,
    inHabitat: false,
    intelligence: 180,
    visualSeed: 12345,
    size: 1,
    pattern: { id: 'none' },
    palette: { primary: '#fb4903', secondary: '#ffd731' },
    bondingLevel: 3,
    bonding: { value: 46, level: 3 },
    desktopSkills: {},
    strategy: 'balanced',
    createdAt: iso(-12 * DAY),
    ...extra,
  };
}

const pets = [
  pet('p-1', 'Fuego', 'ignisaur', 'Ignisaur', 'fire', 'rare'),
  pet('p-2', 'Brote', 'florabud', 'Florabud', 'plant', 'common', { level: 3, hunger: 20, happiness: 55, energy: 90, hygiene: 80 }),
];

let eggs = [
  { id: 'e-1', eggType: 'común', hatchesAt: iso(-HOUR) },
  { id: 'e-2', eggType: 'raro', hatchesAt: iso(3 * HOUR + 12 * MIN) },
];

const foods = [
  { id: 'apple', name: 'Manzana', description: 'Sacia un poco y sube el ánimo.', priceCoins: 20 },
  { id: 'berry_bowl', name: 'Cuenco de bayas', description: 'Un tentempié dulce. +15 de saciedad.', priceCoins: 45 },
  { id: 'grilled_fish', name: 'Pescado a la brasa', description: 'Comida completa. +40 de saciedad y +5 de felicidad.', priceCoins: 120 },
  { id: 'royal_feast', name: 'Banquete real', description: 'Llena del todo y da energía para una tarde entera de juegos.', priceCoins: 1500 },
];

let inventory = [
  { itemId: 'apple', qty: 5, item: foods[0] },
  { itemId: 'berry_bowl', qty: 2, item: foods[1] },
];

const friends = [
  { id: 'f-1', status: 'accepted', direction: 'outgoing', otherUserId: 'u-2', otherDisplayName: 'Marta', otherHandle: 'marta', otherPet: { petId: 'p-20', nickname: 'Luna', speciesName: 'Axolunar' }, updatedAt: iso(-2 * DAY) },
  { id: 'f-2', status: 'accepted', direction: 'incoming', otherUserId: 'u-3', otherDisplayName: 'Un nombre de jugador bastante largo', otherHandle: 'nombre_largo_de_verdad', otherPet: { petId: 'p-30', nickname: 'Chispa', speciesName: 'Ignisaur' }, updatedAt: iso(-5 * DAY) },
  { id: 'f-3', status: 'pending', direction: 'incoming', otherUserId: 'u-4', otherDisplayName: 'Dani', otherHandle: 'dani', otherPet: null, updatedAt: iso(-3 * HOUR) },
  { id: 'f-4', status: 'pending', direction: 'outgoing', otherUserId: 'u-5', otherDisplayName: 'Sofía', otherHandle: 'sofia', otherPet: null, updatedAt: iso(-DAY) },
];

const clanMembers = [
  { userId: 'u-2', displayName: 'Marta', handle: 'marta', role: 'creator', isOnline: true, joinedAt: iso(-40 * DAY) },
  { userId: 'u-demo', displayName: 'Entrenadora Demo', handle: 'demo', role: 'admin', isOnline: true, joinedAt: iso(-30 * DAY) },
  { userId: 'u-3', displayName: 'Un nombre de jugador bastante largo', handle: 'nombre_largo_de_verdad', role: 'moderator', isOnline: false, joinedAt: iso(-20 * DAY) },
  { userId: 'u-4', displayName: 'Dani', handle: 'dani', role: 'member', isOnline: false, joinedAt: iso(-3 * DAY) },
  { userId: 'u-6', displayName: 'Iker', handle: 'iker', role: 'member', isOnline: true, joinedAt: iso(-2 * DAY) },
  { userId: 'u-7', displayName: 'Noa', handle: 'noa', role: 'member', isOnline: false, joinedAt: iso(-DAY) },
  { userId: 'u-8', displayName: 'Leo', handle: 'leo', role: 'member', isOnline: false, joinedAt: iso(-HOUR) },
];

/** Pockai activo de cada miembro para el hábitat del Nexo (Dani no tiene ninguno). */
const habitatPets: Record<string, object> = {
  'u-2': { id: 'p-20', nickname: 'Luna', species: { id: 'axolunar', name: 'Axolunar' }, pattern: { id: 'spots' }, rarity: 'normal', stage: 'juvenile', palette: { primary: '#8fd3ff', secondary: '#ffd1f0' }, visualSeed: 77, level: 14 },
  'u-demo': { id: 'p-1', nickname: 'Fuego', species: { id: 'ignisaur', name: 'Ignisaur' }, pattern: { id: 'none' }, rarity: 'normal', stage: 'baby', palette: { primary: '#fb4903', secondary: '#ffd731' }, visualSeed: 12345, level: 7 },
  'u-3': { id: 'p-30', nickname: 'Chispa', species: { id: 'livolt', name: 'Livolt' }, pattern: { id: 'stripes' }, rarity: 'rare', stage: 'adult', palette: { primary: '#ffe14d', secondary: '#4d6bff' }, visualSeed: 31, level: 28 },
  'u-6': { id: 'p-60', nickname: 'Brasa', species: { id: 'magmadillo', name: 'Magmadillo' }, pattern: { id: 'scales' }, rarity: 'super_rare', stage: 'juvenile', palette: { primary: '#7a2b1a', secondary: '#ff8a3d' }, visualSeed: 9, level: 19 },
  'u-7': { id: 'p-70', nickname: 'Bruma', species: { id: 'nubeballena', name: 'Nubeballena' }, pattern: { id: 'none' }, rarity: 'super_rare', stage: 'baby', palette: { primary: '#cfe8ff', secondary: '#8aa6ff' }, visualSeed: 5, level: 4, sleeping: true },
  'u-8': { id: 'p-80', nickname: 'Ascua', species: { id: 'fenixel', name: 'Fenixel' }, pattern: { id: 'galaxy' }, rarity: 'legendary', stage: 'adult', palette: { primary: '#ff5a2d', secondary: '#ffd447' }, visualSeed: 101, level: 33, shiny: true },
};

/** Hábitat del Nexo: hasta 5 residentes, el tuyo siempre, el resto sorteado en cada llamada. */
function clanHabitat(xp: number) {
  const tiers = [0, 500, 2000, 6000, 15000];
  const tier = tiers.filter((t) => xp >= t).length;
  const others = clanMembers.filter((m) => m.userId !== 'u-demo' && habitatPets[m.userId]).sort(() => Math.random() - 0.5);
  const chosen = [clanMembers.find((m) => m.userId === 'u-demo')!, ...others].slice(0, 5);
  return {
    clanId: 'c-1',
    xp,
    tier,
    tierId: ['claro', 'campamento', 'santuario', 'ciudadela', 'celestial'][tier - 1],
    nextTierXp: tiers[tier] ?? null,
    residents: chosen.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      handle: m.handle,
      role: m.role,
      isMe: m.userId === 'u-demo',
      pet: { shiny: false, sleeping: false, sick: false, accessories: {}, hunger: 80, happiness: 85, energy: 70, hygiene: 75, health: 100, ...habitatPets[m.userId] },
    })),
  };
}
const clan = {
  id: 'c-1',
  name: 'Nexo de Resonancia',
  tag: 'NEXO',
  description: 'Clan tranquilo para cuidar pockais y hacer raids los fines de semana.',
  leaderId: 'u-2',
  xp: 4820,
  memberCount: clanMembers.length,
  leader: { userId: 'u-2', displayName: 'Marta', handle: 'marta' },
  members: clanMembers,
};
let clanGoals = [
  { id: 'g-1', clanId: 'c-1', title: 'Visitas de la semana', description: 'Entre todos, 50 visitas a hábitats.', metric: 'visits', target: 50, progress: 31, status: 'active', createdAt: iso(-4 * DAY) },
  { id: 'g-2', clanId: 'c-1', title: 'Subir el clan a nivel 5', description: '', metric: 'xp', target: 5000, progress: 5000, status: 'completed', createdAt: iso(-10 * DAY), completedAt: iso(-DAY) },
];
let clanMessages = [
  { id: 'm-1', clanId: 'c-1', userId: 'u-2', senderName: 'Marta', body: '¿Raid esta noche a las 21:00?', createdAt: iso(-50 * MIN) },
  { id: 'm-2', clanId: 'c-1', userId: 'u-demo', senderName: 'Entrenadora Demo', body: 'Me apunto. Dejo aquí la guía: https://pockai.world/es/guias/raid-de-fuego-estrategias-y-composiciones-recomendadas', createdAt: iso(-45 * MIN) },
  { id: 'm-3', clanId: 'c-1', userId: 'u-3', senderName: 'Un nombre de jugador bastante largo', body: 'Yo llego un poco tarde, empezad sin mí.', createdAt: iso(-10 * MIN) },
];

const mission = (id: string, description: string, current: number, target: number, claimed: boolean, reward: object, resetsIn: number) => ({
  id,
  type: id,
  description,
  target,
  current,
  completed: current >= target,
  claimed,
  reward: { coins: 0, gems: 0, xp: 0, ...reward },
  resetsAt: iso(resetsIn),
});
const missions = {
  timestamp: iso(),
  daily: [
    mission('feed_3', 'Da de comer a tu pockai 3 veces', 3, 3, false, { coins: 50, xp: 20 }, 9 * HOUR),
    mission('play_1', 'Juega 1 minijuego', 1, 1, true, { coins: 30, xp: 10 }, 9 * HOUR),
    mission('chat_5', 'Envía 5 mensajes a tu pockai', 2, 5, false, { coins: 40, xp: 15 }, 9 * HOUR),
  ],
  weekly: [
    mission('arena_10', 'Gana 10 combates en la Arena', 4, 10, false, { coins: 300, gems: 5, xp: 120 }, 4 * DAY),
    mission('visit_5', 'Visita el hábitat de 5 amigos', 5, 5, false, { gems: 3, xp: 60 }, 4 * DAY),
  ],
  dailyChestUnlocked: false,
};

let chests = [
  { id: 'ch-1', type: 'bronze', source: 'daily_missions', createdAt: iso(-DAY) },
  { id: 'ch-2', type: 'gold', source: 'season_pass', createdAt: iso(-2 * DAY) },
];
const drops = [
  { itemId: 'apple', name: 'Manzana', qty: 3, tier: 'common', isNew: false },
  { itemId: 'soft_bed', name: 'Cama Suave', qty: 1, tier: 'uncommon', isNew: true },
  { itemId: 'gems', name: 'Gemas', qty: 5, tier: 'rare', isNew: false },
];

const league = { id: 'silver', name: 'Plata', minElo: 1200, next: { id: 'gold', name: 'Oro', minElo: 1500 }, toNext: 160 };
const combat = (petId: string) => ({
  petId,
  name: pets.find((p) => p.id === petId)?.nickname ?? 'Fuego',
  element: 'fire',
  level: 7,
  stats: { hp: 120, atk: 34, def: 28, vel: 31, esp: 22 },
  allocated: { hp: 2, atk: 3, def: 1, vel: 0, esp: 0 },
  statPoints: 4,
  mood: 78,
  strategy: 'balanced',
  elo: 1340,
  league,
  unlockedSkills: ['ember', 'tail_whip', 'focus'],
  equippedSkills: ['ember', 'tail_whip'],
  battlesToday: 2,
  dailyLimit: 5,
  energyCost: 10,
  canFight: true,
  reason: null,
});
const battles = ['win', 'loss', 'win', 'draw', 'win'].map((outcome, i) => ({
  id: `b-${i}`,
  createdAt: iso(-(i + 1) * 3 * HOUR),
  role: i % 2 ? 'defender' : 'attacker',
  outcome,
  eloDelta: outcome === 'win' ? 14 : outcome === 'loss' ? -11 : 0,
  rounds: 6 + i,
  me: { name: 'Fuego', level: 7, element: 'fire' },
  opponent: { name: ['Luna', 'Chispa', 'Roca', 'Bruma', 'Un rival con nombre largo'][i], level: 6 + i, element: ['water', 'electric', 'plant', 'shadow', 'light'][i], isBot: i === 2 },
}));
const leaderboard = Array.from({ length: 12 }, (_, i) => ({
  rank: i + 1,
  petId: i === 6 ? 'p-1' : `lp-${i}`,
  name: i === 6 ? 'Fuego' : ['Aurora', 'Trueno', 'Niebla', 'Coral', 'Ascua', 'Lirio', '', 'Onda', 'Pétalo', 'Rayo', 'Musgo', 'Eco'][i],
  owner: i === 6 ? 'Entrenadora Demo' : `Jugador ${i + 1}`,
  speciesId: 'ignisaur',
  level: 20 - i,
  elo: 1900 - i * 90,
  league: i < 3 ? 'Diamante' : i < 7 ? 'Oro' : 'Plata',
  score: 1900 - i * 90,
  mine: i === 6,
}));

const tournament = {
  id: 't-1',
  status: 'entry',
  entryFee: 15,
  totalPrizePool: 480,
  entryDeadline: iso(2 * DAY),
  startedAt: null,
  endsAt: iso(5 * DAY),
  entryCount: 21,
  bracketSize: 32,
  hasEntered: false,
  myPlacement: null,
};
const bracketP = (name: string, elo: number, element: string) => ({ name, elo, element });
const bracket = {
  rounds: {
    '1': [
      { id: 'bm-1', slot: 0, status: 'finished', winnerId: 'a', petA: bracketP('Aurora', 1900, 'light'), petB: bracketP('Un rival con nombre largo', 1710, 'shadow') },
      { id: 'bm-2', slot: 1, status: 'pending', winnerId: null, petA: bracketP('Trueno', 1810, 'electric'), petB: bracketP('Coral', 1740, 'water') },
    ],
    '2': [{ id: 'bm-3', slot: 0, status: 'pending', winnerId: null, petA: bracketP('Aurora', 1900, 'light'), petB: null }],
  },
  entries: [],
};

const raid = {
  id: 'r-1',
  theme: 'Coloso de Magma',
  element: 'fire',
  level: 40,
  hpGlobal: 500000,
  hpRemaining: 312400,
  hpPercent: 62,
  status: 'active',
  startedAt: iso(-2 * DAY),
  endsAt: iso(3 * DAY),
  participantCount: 184,
  myContribution: { damageDealt: 4210, attacks: 3, percentage: 0.84 },
};

const bonding = {
  value: 46,
  tier: 'friend',
  tierName: 'Amigo',
  lastInteractionAt: iso(-5 * HOUR),
  history: {
    items: [
      { id: 'bh-1', delta: 2, reason: 'feed', value: 46, createdAt: iso(-5 * HOUR) },
      { id: 'bh-2', delta: 3, reason: 'chat', value: 44, createdAt: iso(-8 * HOUR) },
      { id: 'bh-3', delta: -1.23, reason: 'decay', value: 41, createdAt: iso(-DAY) },
    ],
    nextCursor: null,
  },
  decayInfo: { decayRatePerDay: 1.5, isDecaying: false, graceWindowHours: 24, decayStartHours: 24, hoursSinceInteraction: 5, acumulatedDecay: 1.23 },
  unlocks: { greeting: true, memoryRecall: true, emotionalReactions: false, patternUnlocked: false, sleepNearCursor: false },
};

const dim = (value: number, keyword: string, label: string) => ({ value, keyword, label });
const mind = (petId: string) => ({
  petId,
  dimensions: {
    curiosity: dim(63, 'curious', 'Curioso'),
    sociability: dim(48, 'balanced', 'Equilibrado'),
    bravery: dim(81, 'brave', 'Valiente'),
    affection: dim(70, 'warm', 'Cariñoso'),
    temper: dim(22, 'calm', 'Tranquilo'),
  },
  legacy: { trait: 'curious', temperament: 'calm' },
  mood: 'content',
  bondingTier: 'friend',
  intelligenceTier: 'chat',
  memory: { counts: { episodic: 12, semantic: 5, emotional: 3 }, capacity: { episodic: 40, semantic: 20, emotional: 10 } },
  recentLife: [
    { id: 'l-1', kind: 'event', content: 'Ganó un combate en la Arena contra Luna.', createdAt: iso(-3 * HOUR) },
    { id: 'l-2', kind: 'encounter', content: 'Recibió la visita de Chispa en su sala.', createdAt: iso(-DAY) },
  ],
});

const ach = (id: string, category: string, name: string, tier: string, current: number, target: number, status: string) => ({
  id,
  category,
  name,
  description: `Descripción del logro «${name}».`,
  badgeIcon: 'star',
  hidden: false,
  tier,
  target,
  current,
  status,
  unlockedAt: status === 'unlocked' ? iso(-3 * DAY) : null,
  claimed: status === 'unlocked',
  reward: { coins: 100, gems: 0, xp: 50, itemId: null },
});
const achievements = {
  timestamp: iso(),
  achievementsPublic: true,
  categories: {
    care: [ach('a-1', 'care', 'Primer bocado', 'common', 1, 1, 'unlocked'), ach('a-2', 'care', 'Cocinero constante', 'rare', 34, 100, 'in_progress')],
    social: [ach('a-3', 'social', 'Buen vecino', 'epic', 10, 10, 'unlocked'), ach('a-4', 'social', 'Alma del clan', 'legendary', 0, 50, 'locked')],
    arena: [ach('a-5', 'arena', 'Primera victoria', 'common', 1, 1, 'unlocked'), ach('a-6', 'arena', 'Racha imparable', 'rare', 3, 10, 'in_progress')],
  },
};
const badges = Object.values(achievements.categories)
  .flat()
  .filter((a) => a.status === 'unlocked')
  .map((a) => ({ id: a.id, name: a.name, description: a.description, badgeIcon: a.badgeIcon, category: a.category, tier: a.tier, unlockedAt: a.unlockedAt as string }));
let featuredBadges = ['a-1', 'a-3'];
const profile = (over: object = {}) => ({
  id: 'u-demo',
  displayName: user.displayName,
  handle: user.handle,
  title: 'Cuidadora constante',
  accountXp: 2380,
  createdAt: iso(-60 * DAY),
  isPro: false,
  achievementsPublic: true,
  pet: { id: 'p-1', nickname: 'Fuego', speciesName: 'Ignisaur', element: 'fire', rarity: 'rare', level: 7, stage: 'baby', shiny: false },
  stats: { playMinutes: 1840, feeds: 212, cleans: 96, sleeps: 61, eggsHatched: 2, byRarity: { normal: 1, rare: 1 }, shinies: 0, habitatVisits: 17, friends: 2, streakCurrent: 6, streakBest: 14, proDays: 0, coinsSpent: 5400, gemsSpent: 20 },
  badges,
  featuredBadges,
  achievementCount: { unlocked: badges.length, total: 6 },
  proSince: null,
  ...over,
});

const season = {
  id: 's-1',
  name: 'Temporada de las Brasas',
  theme: 'fire',
  startTime: iso(-20 * DAY),
  endTime: iso(22 * DAY),
  isActive: true,
  timeRemainingMs: 22 * DAY,
  passPrice: 30,
  passCurrency: 'gems',
  maxTier: 30,
  xpPerTier: 500,
  upcoming: null,
};
const tier = (n: number) => ({ tier: n, freeRewards: [{ type: 'coins', value: 100 * n }], premiumRewards: [{ type: 'gems', value: 2 * n }] });
const seasonProgress = { seasonId: 's-1', seasonName: season.name, currentTier: 4, totalXp: 2180, xpPerTier: 500, maxTier: 30, xpToNextTier: 320, hasPass: false, unlockedTiers: [1, 2, 3, 4].map(tier), nextReward: tier(5), seasonExpired: false };

const adventureScene = {
  order: 1,
  text: 'Fuego encuentra una cueva que respira vapor caliente. Dentro se oye un goteo y, más al fondo, algo que parece un ronquido.',
  choices: [
    { label: 'Entrar despacio', hint: 'Valentía' },
    { label: 'Llamar desde fuera', hint: 'Sociabilidad' },
    { label: 'Rodear la colina', hint: 'Curiosidad' },
  ],
};

let visiting: null | { friendId: string } = null;
let tick = 0;
const uid = (p: string) => `${p}-${++tick}`;

function spend(currency: 'coins' | 'gems', amount: number) {
  if (user[currency] < amount) throw fail(400, currency === 'coins' ? 'No tienes suficientes monedas' : 'No tienes suficientes gemas');
  user[currency] -= amount;
}
function fail(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
const findPet = (id: string) => pets.find((p) => p.id === id) ?? pets[0];
const clamp = (n: number) => Math.max(0, Math.min(100, n));

// ── Rutas ────────────────────────────────────────────────────────────────────
const routes: [string, RegExp, Handler][] = [
  ['POST', /^\/auth\/(login|register)$/, () => ({ accessToken: 'demo-access', refreshToken: 'demo-refresh', user })],
  ['POST', /^\/auth\/logout$/, () => ({ ok: true })],
  ['GET', /^\/auth\/registration-config$/, () => ({ inviteRequired: false })],
  ['GET', /^\/auth\/handle-available$/, () => ({ available: true })],
  ['GET', /^\/me$/, () => user],
  ['PATCH', /^\/me$/, ({ body }) => Object.assign(user, body)],
  ['GET', /^\/me\/profile$/, () => profile()],
  ['PUT', /^\/me\/featured-badges$/, ({ body }) => ((featuredBadges = body.achIds ?? []), { featuredBadges })],
  ['GET', /^\/users\/[^/]+\/profile$/, () => profile({ id: 'u-2', displayName: 'Marta', handle: 'marta', title: 'Forjadora del Nexo', isFriend: true, isSelf: false, isPro: true })],
  ['GET', /^\/catalog$/, () => ({ foods, eggPriceCoins: 50 })],
  ['GET', /^\/shop$/, () => foods],
  ['POST', /^\/shop\/buy$/, ({ body }) => {
    const food = foods.find((f) => f.id === body.itemId) ?? foods[0];
    spend('coins', food.priceCoins);
    const row = inventory.find((i) => i.itemId === food.id);
    if (row) row.qty += 1;
    else inventory.push({ itemId: food.id, qty: 1, item: food });
    return { user, inventory };
  }],
  ['GET', /^\/inventory$/, () => inventory],
  ['GET', /^\/eggs$/, () => eggs],
  ['POST', /^\/eggs\/buy$/, () => {
    spend('coins', 50);
    const egg = { id: uid('e'), eggType: 'común', hatchesAt: iso(2 * HOUR) };
    eggs.push(egg);
    return egg;
  }],
  ['POST', /^\/eggs\/([^/]+)\/hatch$/, ({ m, body }) => {
    eggs = eggs.filter((e) => e.id !== m[1]);
    const born = pet(uid('p'), body?.nickname || 'Gota', 'axolunar', 'Axolunar', 'water', 'rare', { level: 1 });
    pets.push(born);
    return born;
  }],
  ['GET', /^\/pets$/, () => pets],
  ['POST', /^\/pets\/([^/]+)\/feed$/, ({ m, body }) => {
    const p = findPet(m[1]);
    const row = inventory.find((i) => i.itemId === body?.itemId);
    if (!row) throw fail(400, 'No te queda ese alimento');
    row.qty -= 1;
    inventory = inventory.filter((i) => i.qty > 0);
    p.hunger = clamp(p.hunger + 15);
    return p;
  }],
  ['POST', /^\/pets\/([^/]+)\/clean$/, ({ m }) => Object.assign(findPet(m[1]), { hygiene: 100 })],
  ['POST', /^\/pets\/([^/]+)\/sleep$/, ({ m }) => Object.assign(findPet(m[1]), { sleeping: true })],
  ['POST', /^\/pets\/([^/]+)\/wake$/, ({ m }) => Object.assign(findPet(m[1]), { sleeping: false })],
  ['PATCH', /^\/pets\/([^/]+)\/in-habitat$/, ({ m, body }) => Object.assign(findPet(m[1]), { inHabitat: !!body.inHabitat })],
  ['PATCH', /^\/pets\/([^/]+)\/desktop-skills$/, ({ m, body }) => Object.assign(findPet(m[1]), { desktopSkills: body.skills })],
  ['PATCH', /^\/pets\/([^/]+)$/, ({ m, body }) => Object.assign(findPet(m[1]), body)],
  ['GET', /^\/pets\/([^/]+)\/bonding$/, () => bonding],
  ['GET', /^\/pets\/([^/]+)\/mind$/, ({ m }) => mind(m[1])],
  ['GET', /^\/pets\/([^/]+)\/memories$/, () => ({
    unlocked: true,
    unlockAt: 100,
    intelligence: 180,
    memories: [
      { id: 'mem-1', kind: 'fact', layer: 'semantic', importance: 0.8, content: 'A su cuidadora le gusta el café por la mañana.', createdAt: iso(-2 * DAY) },
      { id: 'mem-2', kind: 'event', layer: 'episodic', importance: 0.5, content: 'Pasaron la tarde ordenando archivos del proyecto de fin de grado.', createdAt: iso(-DAY) },
    ],
  })],
  ['DELETE', /^\/pets\/([^/]+)\/memories/, () => ({ deleted: 1 })],
  ['GET', /^\/pets\/([^/]+)\/chat\/history$/, () => [
    { id: 'c-1', role: 'user', content: 'Hola, ¿qué tal has dormido?' },
    { id: 'c-2', role: 'assistant', content: '¡Genial! He soñado que ganábamos el torneo. ¿Jugamos luego?' },
    { id: 'c-3', role: 'user', content: 'Mira este enlace: https://pockai.world/es/guias/como-cuidar-de-tu-pockai-en-sus-primeros-dias-sin-agobiarte' },
  ]],
  ['GET', /^\/pets\/([^/]+)\/actions$/, () => []],
  ['GET', /^\/pets\/([^/]+)\/combat$/, ({ m }) => combat(m[1])],
  ['POST', /^\/pets\/([^/]+)\/combat\/stats$/, ({ m }) => ({ ...combat(m[1]), statPoints: 0 })],
  ['PUT', /^\/pets\/([^/]+)\/combat\/skills$/, ({ m, body }) => ({ ...combat(m[1]), equippedSkills: body.skills })],
  ['GET', /^\/ai\/usage$/, () => ({ month: iso().slice(0, 7), tokens: 12400, requests: 38, quota: null, remaining: null, mode: 'managed', plan: 'free', daily: { used: 4, limit: 15, resetsAt: iso(9 * HOUR) } })],
  ['GET', /^\/ai\/config$/, () => ({ mode: 'managed', configured: false })],
  ['GET', /^\/billing\/plans$/, () => ({
    pricing: { monthlyPriceUsd: 4.99, monthlyPriceEur: 4.99, trialDays: 7 },
    plans: {
      free: { name: 'Gratis', priceUsd: 0, priceEur: 0, dailyMessages: 15, maxInputChars: 240, maxOutputTokens: 300, agentTools: false },
      pro: { name: 'Pro', priceUsd: 4.99, priceEur: 4.99, dailyMessages: 200, maxInputChars: 1000, maxOutputTokens: 800, agentTools: true },
      byok: { name: 'Tu clave', priceUsd: 0, priceEur: 0, dailyMessages: null, maxInputChars: 1000, rateLimitPerMinute: 20 },
    },
  })],
  ['GET', /^\/billing\/entitlement$/, () => ({ plan: 'free', source: null })],
  ['GET', /^\/reminders\/due$/, () => []],
  ['GET', /^\/reminders$/, () => [{ id: 'rem-1', text: 'Beber agua', dueAt: iso(2 * HOUR) }]],
  ['DELETE', /^\/reminders\/[^/]+$/, () => ({ ok: true })],
  ['GET', /^\/environmental\/status$/, () => ({
    timeOfDay: 'afternoon',
    weather: { condition: 'clear', temperature: 18, weatherCode: 2, cached: false, fetchedAt: iso(0), sunrise: '07:45', sunset: '18:05' },
    activity: { active: true, mode: 'active', lastActiveAt: iso(0) },
    festival: null,
  })],
  ['GET', /^\/minigames$/, () => [
    { id: 'catch_food', name: 'Atrapa la comida', durationSeconds: 30, maxCoins: 60, maxXp: 40, energyCost: 5 },
    { id: 'memory_match', name: 'Parejas', durationSeconds: 45, maxCoins: 80, maxXp: 50, energyCost: 5 },
    { id: 'reflex', name: 'Reflejos', durationSeconds: 20, maxCoins: 40, maxXp: 30, energyCost: 5 },
  ]],
  ['POST', /^\/minigames\/([^/]+)\/start$/, ({ m }) => ({ sessionId: uid('mg'), gameId: m[1], seed: 42, durationSeconds: m[1] === 'reflex' ? 20 : 30, maxScorePerSecond: 3, expiresAt: iso(5 * MIN) })],
  ['POST', /^\/minigames\/sessions\/[^/]+\/finish$|^\/minigames\/finish$|^\/minigames\/[^/]+\/finish$/, ({ body }) => ({ score: body?.score ?? 12, rewards: { coins: 24, xp: 18, happiness: 6 }, pet: pets[0] })],
  ['GET', /^\/arena\/leagues$/, () => ({ leagues: [{ id: 'bronze', name: 'Bronce', minElo: 0 }, league, league.next], dailyFreeBattles: 5, energyCost: 10 })],
  ['GET', /^\/battles$/, () => battles],
  ['GET', /^\/leaderboard$/, () => ({ scope: 'global', entries: leaderboard, me: { rank: 7, score: 1360 } })],
  ['GET', /^\/raid\/current$/, () => raid],
  ['GET', /^\/raid\/leaderboard$/, () => ({ raidId: 'r-1', totalDamage: 187600, hpRemaining: raid.hpRemaining, entries: leaderboard.slice(0, 8).map((e) => ({ rank: e.rank, userId: `u-${e.rank}`, displayName: e.owner, petId: e.petId, petName: e.name || 'Fuego', petLevel: e.level, petElement: 'fire', damageDealt: 9000 - e.rank * 700, percentage: 4.8 - e.rank * 0.4, attacks: 6, mine: e.mine })) })],
  ['GET', /^\/raid\/history$/, () => [{ id: 'r-0', theme: 'Leviatán de Bruma', element: 'water', hpGlobal: 400000, startedAt: iso(-12 * DAY), endedAt: iso(-7 * DAY), status: 'defeated' }]],
  ['GET', /^\/tournament\/current$/, () => tournament],
  ['POST', /^\/tournament\/enter$/, ({ body }) => (spend('gems', tournament.entryFee), (tournament.hasEntered = true), { tournamentId: 't-1', petId: body.petId, elo: 1340, feePaid: tournament.entryFee })],
  ['GET', /^\/tournament\/bracket$/, () => bracket],
  ['GET', /^\/tournament\/standings$/, () => ({ tournamentId: 't-1', status: 'entry', total: 21, limit: 20, offset: 0, entries: leaderboard.slice(0, 8).map((e) => ({ rank: e.rank, userId: `u-${e.rank}`, petId: e.petId, petName: e.name || 'Fuego', elo: e.elo, placement: null, mine: e.mine })), me: { rank: 7, placement: null } })],
  ['GET', /^\/training\/active-buff$/, () => ({ active: true, buff: { petId: 'p-1', multiplier: 1.1, stats: ['atk'], expiresAt: iso(40 * MIN), remainingMs: 40 * MIN } })],
  ['POST', /^\/training\/start$/, ({ body }) => ({ sessionId: uid('tr'), petId: body.petId, seed: 7, hearts: 3, currentFloor: 1, floors: [1, 2, 3, 4, 5].map((floor) => ({ floor, enemyElement: ['plant', 'water', 'electric', 'shadow', 'light'][floor - 1], enemyName: ['Brotón', 'Marea', 'Chispazo', 'Penumbra', 'Fulgor'][floor - 1], enemyLevel: 4 + floor })) })],
  ['POST', /^\/training\/submit$/, ({ body }) => ({ floor: 1, result: 'advanced', enemyElement: 'plant', playerElement: body.element, multiplier: 1.5, hearts: 3, currentFloor: 2, status: 'active', predictionBonus: false })],
  ['GET', /^\/cooking\/daily-menu$/, () => ({ date: iso().slice(0, 10), recipeId: 'stew', recipeName: 'Guiso de brasas', difficulty: 2, ingredients: ['Seta', 'Baya', 'Raíz', 'Miel'], buff: { stat: 'energy', value: 10 }, bonus: 'Doble de monedas hoy' })],
  ['POST', /^\/cooking\/start$/, () => ({ sessionId: uid('ck'), recipeId: 'stew', recipeName: 'Guiso de brasas', difficulty: 2, ingredients: ['Seta', 'Baya', 'Raíz', 'Miel'], order: ['Baya', 'Miel', 'Seta', 'Raíz'], hotPotPositions: [1], durationSeconds: 30, seed: 3, expiresAt: iso(2 * MIN) })],
  ['POST', /^\/cooking\/submit$/, () => ({ score: 75, buff: { stat: 'energy', value: 10, durationMs: HOUR }, coins: 40, correctPct: 75, message: '¡Casi perfecto!' })],
  ['GET', /^\/adventure\/current$/, () => ({ active: false })],
  ['GET', /^\/adventure\/history$/, () => [
    { adventureId: 'ad-1', theme: 'El faro apagado', sceneCount: 4, outcome: 'win', score: 82, xpAwarded: 60, coinsAwarded: 90, isPremium: false, startedAt: iso(-DAY), finishedAt: iso(-DAY + 10 * MIN) },
    { adventureId: 'ad-2', theme: 'La cueva que respira', sceneCount: 4, outcome: 'lose', score: 20, xpAwarded: 10, coinsAwarded: 0, isPremium: true, startedAt: iso(-3 * DAY), finishedAt: iso(-3 * DAY + 8 * MIN) },
  ]],
  ['POST', /^\/adventure\/start$/, ({ body }) => (body.premium && spend('gems', 10), { adventureId: uid('ad'), theme: 'La cueva que respira', sceneCount: 3, currentScene: 1, scene: adventureScene, isPremium: !!body.premium, retriesLeft: 1 })],
  ['POST', /^\/adventure\/choose$/, () => ({ completed: true, outcome: 'partial', score: 55, rewards: { xp: 35, coins: 40 }, memory: 'Fuego salió de la cueva con un mechón chamuscado y una historia que contar.' })],
  ['GET', /^\/habitat$/, () => ({
    petId: 'p-1',
    habitatSeed: 7,
    rooms: habitats.rooms.map((r: any, i: number) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      gridWidth: r.gridWidth,
      gridHeight: r.gridHeight,
      unlocked: i === 0,
      active: i === 0,
      theme: r.theme ?? null,
      items: i === 0 ? [{ id: 'it-1', furnitureId: 'soft_bed', x: 2, y: 3, rotation: 0 }, { id: 'it-2', furnitureId: 'toy_ball', x: 7, y: 5, rotation: 0 }] : [],
    })),
  })],
  ['GET', /^\/habitat\/catalog$/, () => habitats],
  ['GET', /^\/habitat\/buffs$/, () => ({ petId: 'p-1', activeBuffs: { energy_recovery_boost: 0.15, happiness_decay_reduction: 0.05 }, itemCount: 2 })],
  ['GET', /^\/habitat\/visitors$/, () => ({ visitors: [] })],
  ['POST', /^\/habitat\/furniture\/([^/]+)\/place$/, ({ m, body }) => {
    const f = habitats.furniture.find((x: any) => x.id === m[1]);
    spend(f?.currency ?? 'coins', f?.price ?? 0);
    return { message: 'Colocado', furnitureId: m[1], room: f?.room ?? 'sala', itemId: uid('it'), x: body?.x ?? 0, y: body?.y ?? 0, rotation: body?.rotation ?? 0 };
  }],
  ['POST', /^\/habitat\/visit$/, ({ body }) => ((visiting = { friendId: body?.friendId ?? 'u-2' }), { success: true, visit: { visitorId: 'u-demo', visitorName: user.displayName, pet: { petId: 'p-1', nickname: 'Fuego', speciesName: 'Ignisaur', speciesId: 'ignisaur', spriteRef: 'sprites/ignisaur_idle' }, startedAt: iso() }, energy: 54 })],
  ['POST', /^\/habitat\/visit\/end$/, () => ((visiting = null), { ok: true })],
  ['GET', /^\/coop\/friends$/, () => friends],
  ['POST', /^\/coop\/friends$/, ({ body }) => {
    const f = { id: uid('f'), status: 'pending', direction: 'outgoing', otherUserId: uid('u'), otherDisplayName: body?.handle ?? 'Nuevo', otherHandle: body?.handle ?? null, otherPet: null, updatedAt: iso() };
    friends.push(f);
    return f;
  }],
  ['POST', /^\/coop\/friends\/([^/]+)\/(accept|decline)$/, ({ m }) => {
    const f = friends.find((x) => x.id === m[1]);
    if (f) f.status = m[2] === 'accept' ? 'accepted' : 'revoked';
    return f;
  }],
  ['POST', /^\/coop\/visit$/, () => ({ success: true, message: '¡Luna te lo agradece!', xpGained: 12, petState: { hunger: 80, happiness: 90, hygiene: 70 } })],
  ['GET', /^\/coop\/history$/, () => ({
    userId: 'u-demo',
    visits: [
      { id: 'v-1', kind: 'care', direction: 'out', otherUserId: 'u-2', otherName: 'Marta', otherHandle: 'marta', visitorId: 'u-demo', action: 'feed', petId: 'p-20', xpGained: 12, createdAt: iso(-4 * HOUR) },
      { id: 'v-2', kind: 'habitat', direction: 'in', otherUserId: 'u-3', otherName: 'Un nombre de jugador bastante largo', otherHandle: 'nombre_largo_de_verdad', visitorId: 'u-3', action: 'habitat', petId: 'p-1', xpGained: 0, createdAt: iso(-DAY), endedAt: iso(-DAY + 20 * MIN) },
    ],
  })],
  ['GET', /^\/presence\/([^/]+)$/, ({ m }) => ({ userId: m[1], devices: [], hasActiveDevices: m[1] === 'u-2' })],
  ['GET', /^\/clans$/, () => clan],
  ['GET', /^\/clans\/[^/]+\/members$/, () => clan],
  // `?xp=` fuerza la XP para revisar cada nivel del hábitat (p. ej. /v1/clans/c-1/habitat?xp=15000)
  ['GET', /^\/clans\/[^/]+\/habitat$/, ({ query }) => clanHabitat(Number(query.get('xp') ?? clan.xp))],
  ['POST', /^\/pets\/([^/]+)\/activate$/, ({ m }) => ({ activePetId: m[1] })],
  ['GET', /^\/clans\/[^/]+\/goals$/, () => clanGoals],
  ['POST', /^\/clans\/[^/]+\/goals$/, ({ body }) => {
    const g = { id: uid('g'), clanId: 'c-1', description: '', metric: 'generic', progress: 0, status: 'active', createdAt: iso(), ...body };
    clanGoals.push(g);
    return g;
  }],
  ['POST', /^\/clans\/[^/]+\/goals\/([^/]+)\/progress$/, ({ m, body }) => {
    const g = clanGoals.find((x) => x.id === m[1])!;
    g.progress = Math.min(g.target, g.progress + (body?.amount ?? 1));
    if (g.progress >= g.target) g.status = 'completed';
    return g;
  }],
  ['DELETE', /^\/clans\/[^/]+\/goals\/([^/]+)$/, ({ m }) => ((clanGoals = clanGoals.filter((g) => g.id !== m[1])), { ok: true })],
  ['GET', /^\/clans\/[^/]+\/messages$/, () => clanMessages],
  ['POST', /^\/clans\/[^/]+\/messages$/, ({ body }) => {
    const msg = { id: uid('m'), clanId: 'c-1', userId: 'u-demo', senderName: user.displayName, body: body.body, createdAt: iso() };
    clanMessages.push(msg);
    return msg;
  }],
  ['DELETE', /^\/clans\/[^/]+\/messages\/([^/]+)$/, ({ m }) => ((clanMessages = clanMessages.filter((x) => x.id !== m[1])), { success: true })],
  ['POST', /^\/clans\/leave$/, () => ({ ok: true })],
  ['GET', /^\/missions$/, () => missions],
  ['GET', /^\/missions\/summary$/, () => ({ dailyCompleted: 2, dailyTotal: 3, weeklyCompleted: 1, weeklyTotal: 2, streak: 6, bestStreak: 14 })],
  ['POST', /^\/missions\/([^/]+)\/claim$/, ({ m }) => {
    const all = [...missions.daily, ...missions.weekly];
    const ms = all.find((x) => x.id === m[1])!;
    ms.claimed = true;
    user.coins += ms.reward.coins;
    user.gems += ms.reward.gems;
    return { mission: { id: ms.id, type: ms.type, completed: true }, reward: ms.reward, dailyChestUnlocked: false };
  }],
  ['GET', /^\/seasons\/current$/, () => season],
  ['GET', /^\/seasons\/progress$/, () => seasonProgress],
  ['POST', /^\/seasons\/pass\/purchase$/, () => (spend('gems', season.passPrice), (seasonProgress.hasPass = true), { hasPass: true, gemsRemaining: user.gems })],
  ['GET', /^\/chests$/, () => ({ chests })],
  ['GET', /^\/chests\/history$/, () => ({ openings: [{ chestId: 'ch-0', type: 'silver', drops, openedAt: iso(-3 * DAY) }], total: 1 })],
  ['POST', /^\/chests\/open$/, ({ body }) => {
    const chest = chests.find((c) => c.id === body.chestId) ?? chests[0];
    chests = chests.filter((c) => c.id !== chest?.id);
    return { chest: { ...chest, openedAt: iso() }, drops, pityProgress: { count: 4, threshold: 10, minTier: 'rare' } };
  }],
  ['POST', /^\/chests\/purchase$/, ({ body }) => {
    const method = body.paymentMethod === 'gems' ? 'gems' : 'coins';
    spend(method, balance.chests?.[body.type ?? 'bronze']?.prices?.[method] ?? 0);
    const chest = { id: uid('ch'), type: body.type ?? 'bronze', source: 'purchase', createdAt: iso() };
    chests.push(chest);
    return { chest, coinsRemaining: user.coins, gemsRemaining: user.gems };
  }],
  ['GET', /^\/achievements$/, () => achievements],
  ['GET', /^\/reengagement\/status$/, () => ({ petId: 'p-1', nickname: 'Fuego', lastLoginAt: iso(-HOUR), absenceMs: HOUR, active: false, tier: null, plan: null, recoveryBuff: { active: false, until: null, remainingMs: 0 }, alreadyCompleted: true })],
  ['GET', /^\/reengagement\/diary$/, () => ({ petId: 'p-1', entries: [], generatedAt: iso(), cached: true })],
];

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data ?? null));
}

export function demoApi(enabled: boolean): Plugin {
  return {
    name: 'pockai-demo-api',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return;
      server.config.logger.info('\n  Modo demo: /v1/* responde con datos de ejemplo (desktop/vite.mock.ts)\n');
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname.startsWith('/socket.io')) return send(res, 404, { message: 'Sin tiempo real en modo demo' });
        if (!url.pathname.startsWith('/v1/')) return next();

        const route = url.pathname.slice(3);
        const method = (req.method ?? 'GET').toUpperCase();
        const body = method === 'GET' ? {} : await readBody(req);
        const failOn = process.env.MOCK_FAIL;
        if (url.searchParams.has('__fail') || (failOn && url.pathname.includes(failOn))) {
          return send(res, 500, { message: 'Error simulado del modo demo' });
        }
        // Latencia corta para poder ver los estados de carga.
        await new Promise((r) => setTimeout(r, Number(process.env.MOCK_DELAY ?? 250)));

        for (const [verb, re, handler] of routes) {
          const m = method === verb ? route.match(re) : null;
          if (!m) continue;
          try {
            return send(res, 200, handler({ m, body, query: url.searchParams }));
          } catch (e: any) {
            return send(res, e.status ?? 500, { message: e.message });
          }
        }
        server.config.logger.warn(`  [demo] sin datos para ${method} ${url.pathname}`);
        return send(res, method === 'GET' ? 404 : 200, method === 'GET' ? { message: 'Sin datos de ejemplo' } : { ok: true });
      });
    },
  };
}
