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
  { id: 'apple', name: 'Manzana Crujiente', description: 'Una fruta fresca y dulce que sacia el hambre rápidamente.', priceCoins: 10 },
  { id: 'spicy_berry', name: 'Baya Ígnea', description: 'Una baya ardiente que calienta el espíritu. Favorita de las criaturas de fuego.', priceCoins: 25 },
  { id: 'sweet_coral', name: 'Coral Glaseado', description: 'Delicadeza marina dulce y refrescante. Favorita de las criaturas acuáticas.', priceCoins: 25 },
  { id: 'cake', name: 'Pastel de Fresas', description: 'Un dulce delicioso que aumenta mucho la felicidad, aunque no es lo más saludable.', priceCoins: 40 },
  { id: 'royal_feast', name: 'Banquete real', description: 'Llena del todo y da energía para una tarde entera de juegos.', priceCoins: 1500 },
  // Spec 41: solo drop y oculto (no salen en la tienda; sí en la Mochila)
  { id: 'ether_threader', kind: 'level_up', availability: 'drop', name: 'Enhebrador', description: 'Aguja de hilo vivo que cose una hebra más de Éter en la vena del Pockai y lo hace crecer.', priceCoins: 0 },
  { id: 'origin_nectar', kind: 'medicine', availability: 'hidden', name: 'Néctar del Origen', description: 'La primera gota del Origen, que sacia, alegra, reanima y cura cualquier mal.', priceCoins: 0 },
].map((f: any) => ({ kind: 'food', availability: 'shop', ...f }));

let inventory = [
  { itemId: 'apple', qty: 5, item: foods[0] },
  { itemId: 'spicy_berry', qty: 2, item: foods[1] },
  { itemId: 'ether_threader', qty: 2, item: foods[5] },
  { itemId: 'origin_nectar', qty: 1, item: foods[6] },
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
  xp: 320, // nivel 1 del hábitat: el único con fondo pintado por ahora
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
  { itemId: 'apple', name: 'Manzana Crujiente', qty: 3, tier: 'common', isNew: false },
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
  learned: { prefs: demoLearned },
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

// Aventura diaria: las historias semilla de game-data, jugables de verdad en la demo
const storySeeds = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/game-data/story-seeds.json'), 'utf8')).stories as any[];
const storyRewards = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/game-data/stories.json'), 'utf8')).rewards;
// Cocina: las recetas de verdad; lo cocinado y los buffs viven mientras dure el servidor de la demo
const mockRecipes = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/game-data/recipes.json'), 'utf8')) as any[];
const mockMenu = () => mockRecipes.find((r) => r.dailyMenu && r.weekday === new Date().getUTCDay());
let cookCurrent: any = null;
const cookBest: Record<string, number> = {};
let cookBuffs: { stat: string; value: number; source: string; sourceId: string; expiresAt: string }[] = [];
const storyPlays: Record<string, { answers: number[]; status: string; outcome: string | null }> = {};
const storyLimit = 3;
const storyPublic = (scene: any, index: number) => ({ index, locationId: scene.locationId, narration: scene.narration, event: scene.event, choices: scene.choices.map((c: any) => ({ label: c.label, approach: c.approach })) });
function storyOf(id: string) {
  const s = storySeeds.find((x) => x.id === id);
  if (!s) throw fail(404, 'Historia no encontrada');
  return s;
}
function storyState(id: string) {
  const s = storyOf(id);
  const p = storyPlays[id];
  const i = p.answers.length;
  return {
    storyId: id, title: s.title, synopsis: s.synopsis, sceneCount: s.scenes.length, status: p.status, sceneIndex: i,
    scene: i < s.scenes.length ? storyPublic(s.scenes[i], i) : null,
    answered: p.answers.map((o, k) => ({ sceneIndex: k, optionIndex: o, label: s.scenes[k].choices[o].label, consequence: s.scenes[k].choices[o].consequence })),
    result: p.status === 'completed' ? { outcome: p.outcome, score: 1, rewards: storyRewards[p.outcome ?? 'partial'] } : null,
  };
}

let visiting: null | { friendId: string } = null;

/** Iniciativa de ejemplo (la real la decide el backend con @pockai/mind). */
let talkLevel = 'normal';
let talkTurn = 0;
/** Lo que el Pockai de la demo ha aprendido que gusta. */
const demoLearned: Record<string, number> = { dance: 0.42, climb: -0.3 };
const TALK_DEMO = [
  { id: 'return_real_pet', kind: 'return', text: '¡Has vuelto! ¿Qué tal está Toby?' },
  { id: 'care_real_pet_fed', kind: 'care', text: '¿Has recordado dar de comer hoy a tu perro Toby?' },
  { id: 'wish_explore', kind: 'wish', text: '¿Salimos de aventura? Me apetece explorar.' },
  { id: 'idle_company', kind: 'idle', text: 'Me gusta estar aquí contigo.' },
];
const talkSettings = () => ({
  level: talkLevel,
  levels: [
    { id: 'quiet', desktopMinutes: 17, mobilePerDay: 1, onlyOnReturn: true },
    { id: 'normal', desktopMinutes: 17, mobilePerDay: 2, onlyOnReturn: false },
    { id: 'chatty', desktopMinutes: 7, mobilePerDay: 6, onlyOnReturn: false },
  ],
  talkFactor: 1.2,
});

/** Conversación de ejemplo del menú de visita (el real lo decide el backend). */
const TALK_LINES: Record<string, string> = {
  greet: 'Luna te saluda contenta.',
  pet: 'Luna ronronea con tus caricias.',
  treat: 'Luna acepta Manzana encantada.',
  play: 'Luna juega contigo un buen rato.',
  ask: 'Luna está tranquila y a gusto. Parece que quiere contarte algo: «Explorando encontré algo: Semilla solar.»',
  bye: 'Luna te acompaña hasta la puerta.',
};
const TALK_LABELS: Record<string, string> = { greet: 'Saludar', pet: 'Acariciar', treat: 'Ofrecer Manzana', play: 'Jugar un momento', ask: '¿Qué tal estás?', bye: 'Despedirse' };
let talk = { turn: 0, done: [] as string[], ended: false, last: null as any };
function talkReply(line: string) {
  const left = ['greet', 'pet', 'treat', 'play', 'ask'].filter((id) => !talk.done.includes(id));
  const options = talk.ended ? [] : [...(talk.done.length >= 5 ? [] : left), 'bye'].map((id) => ({ id, label: TALK_LABELS[id], ...(id === 'treat' ? { item: { id: 'apple', name: 'Manzana' } } : {}) }));
  talk.last = { turn: talk.turn, line, behavior: { action: 'greet_visitor', animation: 'happy', emote: 'wave', clip: talk.done[talk.done.length - 1] === 'treat' ? 'eat' : talk.done[talk.done.length - 1] === 'pet' ? 'love' : 'happy' }, options, remaining: Math.max(0, 5 - talk.done.length), ended: talk.ended, stage: 'friend', petName: 'Luna' };
  return talk.last;
}
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
  ['GET', /^\/shop$/, () => foods.filter((f) => f.availability === 'shop')],
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
  ['POST', /^\/pets\/([^/]+)\/use-item$/, ({ m, body }) => {
    const p = findPet(m[1]);
    const row = inventory.find((i) => i.itemId === body?.itemId);
    if (!row) throw fail(400, 'No posees este objeto en el inventario');
    row.qty -= 1;
    inventory = inventory.filter((i) => i.qty > 0);
    const kind = (row.item as any).kind;
    if (kind === 'level_up') p.level = Math.min(100, (p.level ?? 1) + 1);
    else if (kind === 'medicine') Object.assign(p, { hunger: 100, happiness: 100, energy: 100, health: 100, sick: false });
    else p.hunger = clamp(p.hunger + 15);
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
    { id: 'catch_food', name: 'Cosecha del Éter', durationSeconds: 30, maxCoins: 60, maxXp: 40, energyCost: 5 },
    { id: 'memory_match', name: 'Cristal de Recuerdos', durationSeconds: 45, maxCoins: 80, maxXp: 50, energyCost: 5 },
    { id: 'reflex', name: 'Pesca de Códices', durationSeconds: 20, maxCoins: 40, maxXp: 30, energyCost: 5 },
    // Pruebas de los Seis Flujos (spec 39)
    { id: 'pulso_voltaico', name: 'Pulso Voltaico', element: 'electric', durationSeconds: 30, maxCoins: 40, maxXp: 60, energyCost: 5 },
    { id: 'corriente_datos', name: 'Corriente de Datos', element: 'water', durationSeconds: 30, maxCoins: 40, maxXp: 60, energyCost: 5 },
    { id: 'raiz_fractal', name: 'Raíz Fractal', element: 'plant', durationSeconds: 45, maxCoins: 40, maxXp: 60, energyCost: 5 },
    { id: 'cifrado', name: 'Cifrado', element: 'shadow', durationSeconds: 45, maxCoins: 40, maxXp: 60, energyCost: 5 },
    { id: 'faro_claridad', name: 'Faro de Claridad', element: 'light', durationSeconds: 30, maxCoins: 40, maxXp: 60, energyCost: 5 },
    { id: 'forja_termica', name: 'Forja Térmica', element: 'fire', durationSeconds: 30, maxCoins: 40, maxXp: 60, energyCost: 5 },
  ]],
  ['POST', /^\/minigames\/([^/]+)\/start$/, ({ m, body }) => ({ sessionId: uid('mg'), gameId: m[1], variant: body?.variant === 'easy' ? 'easy' : 'standard', seed: 42, durationSeconds: m[1] === 'reflex' ? 20 : 30, maxScorePerSecond: 3, expiresAt: iso(5 * MIN) })],
  ['POST', /^\/minigames\/sessions\/[^/]+\/finish$|^\/minigames\/finish$|^\/minigames\/[^/]+\/finish$/, ({ body }) => ({
    score: body?.score ?? 12,
    rewards: { coins: 24, xp: 18, happiness: 6 },
    pet: pets[0],
    verified: Array.isArray(body?.log),
    affinity: false,
    item: (body?.score ?? 0) >= 20 ? { itemId: 'spicy_berry', qty: 1 } : null,
  })],
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
  // Cocina (spec 15): recetas de verdad de recipes.json; el menú es el del día de la semana (UTC).
  ['GET', /^\/cooking\/daily-menu$/, () => { const m = mockMenu(); return { date: iso().slice(0, 10), recipeId: m.id, recipeName: m.name, description: m.description, weekday: m.weekday, difficulty: m.difficulty, ingredients: m.ingredients, buff: { stat: m.buff.stat, value: Math.round(m.buff.value * 1.5) }, bonus: 'buff ×1.5 hoy', nextReset: iso(12 * HOUR) }; }],
  ['GET', /^\/cooking\/recipes/, () => mockRecipes.map((r: any) => { const today = !!r.dailyMenu && r.weekday === new Date().getUTCDay(); const available = r.dailyMenu ? today : r.unlockLevel <= 30; return { id: r.id, name: r.name, description: r.description ?? null, difficulty: r.difficulty, unlockLevel: r.unlockLevel, dailyMenu: !!r.dailyMenu, weekday: r.weekday ?? null, today, available, ingredients: available ? r.ingredients : null, buff: today ? { stat: r.buff.stat, value: Math.round(r.buff.value * 1.5) } : r.buff, best: cookBest[r.id] ?? null, perfect: (cookBest[r.id] ?? -1) >= r.ingredients.length }; })],
  ['GET', /^\/cooking\/buffs/, () => cookBuffs],
  ['POST', /^\/cooking\/start$/, ({ body }) => {
    const r = (body?.recipeId ? mockRecipes.find((x: any) => x.id === body.recipeId) : null) ?? mockMenu();
    cookCurrent = r;
    const decoys = ['apple', 'cake', 'healthy_salad', 'spicy_berry', 'dawn_honey'].filter((d) => !r.ingredients.includes(d)).slice(0, Math.min(3, Math.ceil(r.difficulty / 2)));
    const order = [...r.ingredients, ...decoys].sort((x, y) => (x < y ? -1 : 1));
    const d = r.difficulty - 1;
    return { sessionId: uid('ck'), recipeId: r.id, recipeName: r.name, recipeDescription: r.description ?? null, difficulty: r.difficulty, isDailyMenu: !!r.dailyMenu, ingredients: r.ingredients, order, hotPotPositions: r.difficulty > 1 ? [Math.min(2, r.ingredients.length - 1)] : [], revealMs: [900, 800, 700, 600, 500][d], durationSeconds: [45, 40, 35, 30, 25][d], hotPotWindowMs: [6000, 5000, 4500, 4000, 3500][d], seed: 42, expiresAt: iso(MIN) };
  }],
  ['POST', /^\/cooking\/submit$/, ({ body }) => {
    const r = cookCurrent ?? mockMenu();
    const picked: string[] = Array.isArray(body?.picked) ? body.picked : [];
    const at: number[] = Array.isArray(body?.pickedAt) ? body.pickedAt : [];
    // Aproximación de la alineación del servidor: avanza por la receta casando en orden.
    const slots: string[] = r.ingredients.map(() => 'miss');
    let j = 0;
    r.ingredients.forEach((ing: string, i: number) => { const k = picked.indexOf(ing, j); if (k >= 0) { slots[i] = k > 0 && i === Math.min(2, r.ingredients.length - 1) && r.difficulty > 1 && at[k] - at[k - 1] > 6000 ? 'burned' : 'ok'; j = k + 1; } });
    const ok = slots.filter((x) => x === 'ok').length;
    const pct = ok / r.ingredients.length;
    const grade = pct >= 1 ? 'perfect' : pct >= 0.6 ? 'good' : 'bad';
    const factor = (grade === 'perfect' ? 1 : 0.5) * (r.dailyMenu ? 1.5 : 1);
    const buff = grade === 'bad' ? null : { stat: r.buff.stat, value: Math.max(1, Math.round(r.buff.value * factor)), durationMs: 24 * HOUR };
    if (buff) for (const stat of buff.stat === 'all' ? ['atk', 'def', 'esp', 'vel'] : [buff.stat]) { cookBuffs = cookBuffs.filter((x) => x.stat !== stat); cookBuffs.push({ stat, value: buff.value, source: 'cooking', sourceId: r.id, expiresAt: iso(24 * HOUR) }); }
    cookBest[r.id] = Math.max(cookBest[r.id] ?? 0, ok);
    const speedBonus = grade === 'perfect' ? 9 : 0;
    return { score: ok, buff, coins: Math.floor(pct * 40) + speedBonus, speedBonus, correctPct: Math.round(pct * 100), grade, slots, message: null };
  }],
  ['GET', /^\/stories\/today$/, () => ({
    day: iso().slice(0, 10), plan: 'pro', limit: storyLimit, used: Object.keys(storyPlays).length, resetsAt: iso(8 * HOUR),
    stories: storySeeds.slice(0, 4).map((s, slot) => ({
      id: s.id, slot, title: s.title, synopsis: s.synopsis, sceneCount: s.scenes.length, locationIds: s.scenes.map((sc: any) => sc.locationId),
      chronicle: slot === 0 ? { chapter: 2, closes: false } : null,
      previously: slot === 0 ? { title: 'El frío de la Deriva', decided: 'Avisaron por el Eco de que las hebras se estaban aflojando.' } : null,
      rerun: slot === 3,
      play: storyPlays[s.id] ? { status: storyPlays[s.id].status, sceneIndex: storyPlays[s.id].answers.length, outcome: storyPlays[s.id].outcome } : null,
    })),
  })],
  ['GET', /^\/stories\/history$/, () => [
    { storyId: 'old-1', day: iso(-DAY).slice(0, 10), title: 'El frío de la Deriva', status: 'completed', outcome: 'win', score: 0.83, xpAwarded: 30, coinsAwarded: 20, startedAt: iso(-DAY), finishedAt: iso(-DAY + 6 * MIN), answers: [{ sceneIndex: 0, optionIndex: 1, label: 'Avisar al Nexo por el Eco', withMajority: true }, { sceneIndex: 1, optionIndex: 0, label: 'Trenzar los bordes', withMajority: false }, { sceneIndex: 2, optionIndex: 0, label: 'Quedarse a hacerle compañía', withMajority: true }] },
  ]],
  ['POST', /^\/stories\/([^/]+)\/start$/, ({ m }) => {
    storyOf(m[1]);
    if (!storyPlays[m[1]]) {
      if (Object.keys(storyPlays).length >= storyLimit) throw fail(403, 'Ya has vivido todas tus historias de hoy.');
      storyPlays[m[1]] = { answers: [], status: 'active', outcome: null };
    }
    return storyState(m[1]);
  }],
  ['POST', /^\/stories\/([^/]+)\/answer$/, ({ m, body }) => {
    const s = storyOf(m[1]);
    const p = storyPlays[m[1]];
    if (!p) throw fail(404, 'No has empezado esa historia');
    const scene = s.scenes[body.sceneIndex];
    if (body.sceneIndex !== p.answers.length || !scene?.choices[body.optionIndex]) throw fail(409, 'Esa escena ya está respondida');
    p.answers.push(body.optionIndex);
    const last = p.answers.length >= s.scenes.length;
    const counts = scene.choices.map((_: unknown, k: number) => 12 + ((k * 17 + body.sceneIndex * 5) % 23) + (k === body.optionIndex ? 1 : 0));
    let completed = null;
    if (last) {
      const total = p.answers.reduce((sum, o, k) => sum + s.scenes[k].choices[o].score, 0) / (s.scenes.length * 2);
      p.outcome = total >= 0.7 ? 'win' : total >= 0.4 ? 'partial' : 'lose';
      p.status = 'completed';
      completed = { outcome: p.outcome, score: total, rewards: storyRewards[p.outcome], memory: `Viví una aventura: ${s.title}.` };
    }
    return { sceneIndex: body.sceneIndex, optionIndex: body.optionIndex, consequence: scene.choices[body.optionIndex].consequence, community: { counts, total: counts.reduce((a: number, b: number) => a + b, 0) }, next: last ? null : storyPublic(s.scenes[body.sceneIndex + 1], body.sceneIndex + 1), completed };
  }],
  ['GET', /^\/habitat$/, () => ({
    petId: 'p-1',
    habitatSeed: 7,
    rooms: habitats.rooms.map((r: any, i: number) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      gridWidth: r.gridWidth,
      gridHeight: r.gridHeight,
      blocked: r.blocked ?? [],
      unlocked: i === 0,
      active: i === 0,
      theme: r.theme ?? null,
      items: i === 0 ? [{ id: 'it-1', furnitureId: 'soft_bed', x: 2, y: 3, rotation: 0 }, { id: 'it-2', furnitureId: 'toy_ball', x: 7, y: 5, rotation: 0 }] : [],
    })),
  })],
  ['GET', /^\/habitat\/catalog$/, () => habitats],
  ['GET', /^\/habitat\/buffs$/, () => ({ petId: 'p-1', activeBuffs: { energy_recovery_boost: 0.15, happiness_decay_reduction: 0.05 }, itemCount: 2 })],
  ['GET', /^\/habitat\/visitors$/, () => ({ visitors: [] })],
  ['POST', /^\/pets\/[^/]+\/initiative$/, ({ body }) => {
    const phrase = body?.back ? TALK_DEMO[0] : TALK_DEMO[1 + (talkTurn++ % (TALK_DEMO.length - 1))];
    return { phrase, retryInMs: 60_000, level: talkLevel, feeling: 'content' };
  }],
  ['GET', /^\/pets\/[^/]+\/initiative\/settings$/, () => talkSettings()],
  ['POST', /^\/pets\/[^/]+\/mind\/reinforce$/, ({ body }) => {
    const v = demoLearned[body?.behavior] ?? 0;
    const up = body?.signal !== 'pickup';
    demoLearned[body?.behavior] = Math.round((v + 0.12 * ((up ? 1 : -1) - v)) * 1000) / 1000;
    return { applied: true, behavior: body?.behavior, prefs: demoLearned };
  }],
  ['PUT', /^\/pets\/[^/]+\/initiative\/settings$/, ({ body }) => ((talkLevel = body?.level ?? talkLevel), talkSettings())],
  ['POST', /^\/habitat\/furniture\/([^/]+)\/place$/, ({ m, body }) => {
    const f = habitats.furniture.find((x: any) => x.id === m[1]);
    spend(f?.currency ?? 'coins', f?.price ?? 0);
    return { message: 'Colocado', furnitureId: m[1], room: f?.room ?? 'sala', itemId: uid('it'), x: body?.x ?? 0, y: body?.y ?? 0, rotation: body?.rotation ?? 0 };
  }],
  ['POST', /^\/habitat\/visit$/, ({ body }) => ((visiting = { friendId: body?.friendId ?? 'u-2' }), { success: true, visit: { visitorId: 'u-demo', visitorName: user.displayName, pet: { petId: 'p-1', nickname: 'Fuego', speciesName: 'Ignisaur', speciesId: 'ignisaur', spriteRef: 'sprites/ignisaur_idle' }, startedAt: iso() }, energy: 54 })],
  ['POST', /^\/habitat\/visit\/end$/, () => ((visiting = null), (talk = { turn: 0, done: [], ended: false, last: null }), { ok: true })],
  ['GET', /^\/habitat\/visit\/room$/, () => {
    const sala: any = habitats.rooms[0];
    return {
      ownerId: 'u-2',
      room: {
        id: sala.id,
        name: sala.name,
        theme: sala.theme ?? null,
        gridWidth: sala.gridWidth,
        gridHeight: sala.gridHeight,
        blocked: sala.blocked ?? [],
        items: [
          { id: 'f-1', furnitureId: 'soft_bed', x: 1, y: 1, rotation: 0 },
          { id: 'f-2', furnitureId: 'toy_ball', x: 5, y: 4, rotation: 0 },
        ],
      },
      furniture: habitats.furniture.filter((f: any) => ['soft_bed', 'toy_ball'].includes(f.id)).map((f: any) => ({ id: f.id, name: f.name, footprint: f.footprint ?? [1, 1], mount: f.mount ?? 'floor', interaction: f.interaction })),
      host: { petId: 'p-20', nickname: 'Luna', speciesName: 'Axolunar', speciesId: 'axolunar', spriteRef: 'axolunar', stage: 'juvenile', look: { palette: { primary: '#7FB7E6', secondary: '#F4C6E0' }, pattern: null, visualSeed: 77, shiny: false, accessories: {} } },
      guest: { petId: 'p-1', nickname: 'Fuego', speciesName: 'Ignisaur', speciesId: 'ignisaur', spriteRef: 'ignisaur', stage: 'juvenile', look: { palette: { primary: '#E25822', secondary: '#F3C544' }, pattern: null, visualSeed: 1337, shiny: false, accessories: {} } },
    };
  }],
  ['POST', /^\/habitat\/items\/([^/]+)\/use$/, () => ({ applied: true, interaction: 'play', petId: 'p-1', vitals: { hunger: 72, happiness: 83, energy: 63, hygiene: 36 }, remainingToday: 5 })],
  ['POST', /^\/habitat\/visit\/interact$/, ({ body }) => {
    if (body?.choice === undefined) {
      if (talk.last && !talk.ended) return talk.last;
      talk = { turn: 1, done: [], ended: false, last: null };
      return talkReply('Luna te reconoce y viene derecha hacia ti.');
    }
    if (body.turn !== undefined && body.turn !== talk.turn) return talk.last;
    const id = talk.last?.options?.[body.choice]?.id ?? 'bye';
    talk.turn++;
    if (id === 'bye') talk.ended = true;
    else talk.done.push(id);
    return talkReply(TALK_LINES[id]);
  }],
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
