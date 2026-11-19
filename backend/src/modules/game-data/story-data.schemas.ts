/**
 * Schemas zod de la aventura diaria (DecisionStoryGenerator): `stories.json`, `story-locations.json`
 * y `story-seeds.json`.
 *
 * `buildStoryContentSchema` valida el contenido de UNA historia y se usa igual para las semillas
 * escritas a mano y para la salida de la IA del sistema, de modo que ambas cumplen las mismas reglas.
 * `validateStoryData` replica las reglas de `scripts/validate-game-data.js`.
 */
import { z } from 'zod';
import { ELEMENTS } from './game-data.schemas';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color hex #RRGGBB');
const kebabId = z.string().regex(/^[a-z][a-z0-9-]*$/, 'id en kebab-case').max(64);

export const STORY_SLOTS = ['bg', 'l1', 'l2', 'l3'] as const;
export type StorySlot = (typeof STORY_SLOTS)[number];
export const STORY_LIFE = ['none', 'dust', 'firefly', 'stardust', 'ember'] as const;
export const STORY_TIMES = ['dawn', 'day', 'dusk', 'night'] as const;
export const STORY_WEATHER = ['clear', 'rain', 'snow', 'fog', 'storm'] as const;
export const STORY_OUTCOMES = ['win', 'partial', 'lose'] as const;
export type StoryOutcome = (typeof STORY_OUTCOMES)[number];

const rewardSchema = z.object({
  xp: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  happiness: z.number().int().nonnegative(),
});

/** stories.json */
export const storiesConfigSchema = z
  .object({
    _comment: z.string().optional(),
    version: z.string(),
    scenesPerStory: z.number().int().min(1).max(6),
    choicesPerScene: z
      .object({ min: z.number().int().min(2), max: z.number().int().max(4) })
      .refine((c) => c.max >= c.min, { message: 'choicesPerScene.max debe ser >= min' }),
    bucket: z
      .object({
        storiesPerDay: z.number().int().min(1).max(8),
        timezone: z.string().min(1),
        generateAtHour: z.number().int().min(0).max(23),
        aiDeadlineHour: z.number().int().min(0).max(23),
        attemptsPerStory: z.number().int().min(1).max(5),
      })
      .refine((b) => b.aiDeadlineHour > b.generateAtHour, { message: 'bucket.aiDeadlineHour debe ser posterior a generateAtHour' }),
    canon: z.object({ minVotesForCanon: z.number().int().min(1) }),
    arc: z.object({ maxChapters: z.number().int().min(2), contextChapters: z.number().int().min(1) }),
    rerun: z.object({ minAgeDays: z.number().int().min(1) }),
    outcome: z
      .object({ winAt: z.number().min(0).max(1), partialAt: z.number().min(0).max(1) })
      .refine((o) => o.winAt > o.partialAt, { message: 'outcome.winAt debe ser mayor que partialAt' }),
    rewards: z.object({ win: rewardSchema, partial: rewardSchema, lose: rewardSchema }),
    text: z.object({
      titleMax: z.number().int().positive(),
      synopsisMax: z.number().int().positive(),
      narrationMax: z.number().int().positive(),
      eventMax: z.number().int().positive(),
      labelMax: z.number().int().positive(),
      consequenceMax: z.number().int().positive(),
      canonLineMax: z.number().int().positive(),
    }),
    eventKinds: z.array(z.string().min(1)).min(1),
    approaches: z.array(z.string().min(1)).min(1),
    eventFx: z.array(z.string().min(1)),
  })
  .strict();
export type StoriesConfig = z.infer<typeof storiesConfigSchema>;

const layerSetSchema = z.object({ bg: kebabId, l1: kebabId, l2: kebabId, l3: kebabId }).strict();
const groundSchema = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([top, bottom]) => bottom > top, { message: 'ground debe ser [arriba, abajo] con abajo > arriba' });

/** story-locations.json */
export const storyLocationsSchema = z
  .object({
    _comment: z.string().optional(),
    version: z.string(),
    slots: z.array(z.enum(STORY_SLOTS)).length(STORY_SLOTS.length),
    layers: z
      .array(
        z
          .object({
            id: kebabId,
            slot: z.enum(STORY_SLOTS),
            name: z.string().min(1),
            /** Silueta procedural de reserva mientras no hay imagen pintada. */
            shape: z.string().min(1),
            color: hexColor,
            parallax: z.number().min(0).max(2),
            drift: z.number().min(0).max(0.1),
            sway: z.number().min(0).max(0.05),
            /** Solo en `l1`: la capa es un edificio (localizaciones `building`). */
            building: z.boolean().optional(),
          })
          .strict(),
      )
      .min(STORY_SLOTS.length),
    locations: z
      .array(
        z
          .object({
            id: kebabId,
            name: z.string().min(1),
            kind: z.enum(['open', 'building']),
            lore: z.string().min(1).max(200),
            layers: layerSetSchema,
            ground: groundSchema,
            flow: z.enum(ELEMENTS),
            life: z.enum(STORY_LIFE),
          })
          .strict(),
      )
      .min(1),
    screens: z.record(
      z.string(),
      z.object({ name: z.string().min(1), layers: layerSetSchema, flow: z.enum(ELEMENTS), life: z.enum(STORY_LIFE) }).strict(),
    ),
  })
  .strict();
export type StoryLocations = z.infer<typeof storyLocationsSchema>;

export interface StoryChoice {
  label: string;
  consequence: string;
  canonLine: string;
  approach: string;
  /** 0-2. Interno: nunca se envía al cliente. */
  score: number;
}
export interface StoryScene {
  locationId: string;
  mood?: { timeOfDay?: (typeof STORY_TIMES)[number]; weather?: (typeof STORY_WEATHER)[number] };
  narration: string;
  event: { kind: string; text: string; fx?: string };
  choices: StoryChoice[];
}
export interface StoryContent {
  title: string;
  synopsis: string;
  scenes: StoryScene[];
}
/** Forma de `DecisionStory.scenes` en la base de datos. */
export interface StoredScenes {
  v: 1;
  scenes: StoryScene[];
}

/**
 * Schema del contenido de una historia (título, sinopsis y escenas) para una configuración y un
 * catálogo dados. Es estricto: un campo de más o una localización inventada invalidan la historia.
 */
export function buildStoryContentSchema(cfg: StoriesConfig, locations: StoryLocations): z.ZodType<StoryContent> {
  const text = (max: number) => z.string().trim().min(1).max(max);
  const locationIds = new Set(locations.locations.map((l) => l.id));
  const choice = z
    .object({
      label: text(cfg.text.labelMax),
      consequence: text(cfg.text.consequenceMax),
      canonLine: text(cfg.text.canonLineMax),
      approach: z.string().refine((a) => cfg.approaches.includes(a), { message: `approach debe ser uno de: ${cfg.approaches.join(', ')}` }),
      score: z.number().int().min(0).max(2),
    })
    .strict();
  const scene = z
    .object({
      locationId: z.string().refine((id) => locationIds.has(id), { message: `locationId desconocido; usa uno de: ${[...locationIds].join(', ')}` }),
      mood: z.object({ timeOfDay: z.enum(STORY_TIMES).optional(), weather: z.enum(STORY_WEATHER).optional() }).strict().optional(),
      narration: text(cfg.text.narrationMax),
      event: z
        .object({
          kind: z.string().refine((k) => cfg.eventKinds.includes(k), { message: `event.kind debe ser uno de: ${cfg.eventKinds.join(', ')}` }),
          text: text(cfg.text.eventMax),
          fx: z
            .string()
            .refine((f) => cfg.eventFx.includes(f), { message: `event.fx debe ser uno de: ${cfg.eventFx.join(', ')}` })
            .optional(),
        })
        .strict(),
      choices: z
        .array(choice)
        .min(cfg.choicesPerScene.min)
        .max(cfg.choicesPerScene.max)
        .refine((cs) => new Set(cs.map((c) => c.label.toLowerCase())).size === cs.length, { message: 'las opciones de una escena no pueden repetirse' })
        .refine((cs) => cs.some((c) => c.score === 2), { message: 'cada escena necesita al menos una opción con score 2' }),
    })
    .strict();
  return z
    .object({
      title: text(cfg.text.titleMax),
      synopsis: text(cfg.text.synopsisMax),
      scenes: z
        .array(scene)
        .length(cfg.scenesPerStory)
        .refine((ss) => new Set(ss.map((s) => s.locationId)).size >= Math.min(2, cfg.scenesPerStory), {
          message: 'la historia debe pasar por al menos dos localizaciones distintas',
        }),
    })
    .strict() as unknown as z.ZodType<StoryContent>;
}

/** story-seeds.json (la forma de cada historia se valida aparte con `buildStoryContentSchema`). */
export const storySeedsSchema = z
  .object({
    _comment: z.string().optional(),
    version: z.string(),
    stories: z.array(z.object({ id: kebabId }).passthrough()).min(1),
  })
  .strict();

export interface StoryData {
  config: StoriesConfig;
  locations: StoryLocations;
  seeds: Array<StoryContent & { id: string }>;
}

function issuesOf(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${prefix}${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`);
}

/**
 * Valida los tres archivos y sus referencias cruzadas. Devuelve los datos ya parseados o la lista de
 * problemas (vacía = todo válido).
 */
export function validateStoryData(raw: { stories: unknown; locations: unknown; seeds: unknown }): { data?: StoryData; errors: string[] } {
  const errors: string[] = [];
  const cfg = storiesConfigSchema.safeParse(raw.stories);
  if (!cfg.success) errors.push(...issuesOf('stories.json', cfg.error));
  const loc = storyLocationsSchema.safeParse(raw.locations);
  if (!loc.success) errors.push(...issuesOf('story-locations.json', loc.error));
  const seeds = storySeedsSchema.safeParse(raw.seeds);
  if (!seeds.success) errors.push(...issuesOf('story-seeds.json', seeds.error));
  if (!cfg.success || !loc.success || !seeds.success) return { errors };

  // Capas: ids únicos y cada ranura con al menos una capa.
  const layerSlot = new Map<string, StorySlot>();
  for (const layer of loc.data.layers) {
    if (layerSlot.has(layer.id)) errors.push(`story-locations.json: capa duplicada '${layer.id}'`);
    layerSlot.set(layer.id, layer.slot);
    if (layer.building && layer.slot !== 'l1') errors.push(`story-locations.json: la capa '${layer.id}' es edificio y debe ir en la ranura l1`);
  }
  const buildings = new Set(loc.data.layers.filter((l) => l.building).map((l) => l.id));
  const checkSet = (where: string, layers: Record<StorySlot, string>) => {
    for (const slot of STORY_SLOTS) {
      const id = layers[slot];
      if (!layerSlot.has(id)) errors.push(`${where}: la capa '${id}' no existe`);
      else if (layerSlot.get(id) !== slot) errors.push(`${where}: la capa '${id}' no es de la ranura ${slot}`);
    }
  };
  const locationIds = new Set<string>();
  for (const l of loc.data.locations) {
    if (locationIds.has(l.id)) errors.push(`story-locations.json: localización duplicada '${l.id}'`);
    locationIds.add(l.id);
    checkSet(`localización ${l.id}`, l.layers);
    if ((l.kind === 'building') !== buildings.has(l.layers.l1)) {
      errors.push(`localización ${l.id}: kind '${l.kind}' no cuadra con su capa l1 ('${l.layers.l1}')`);
    }
  }
  for (const kind of ['open', 'building'] as const) {
    if (!loc.data.locations.some((l) => l.kind === kind)) errors.push(`story-locations.json: falta alguna localización de tipo '${kind}'`);
  }
  for (const [id, screen] of Object.entries(loc.data.screens)) checkSet(`pantalla ${id}`, screen.layers);

  // Semillas: misma forma que las historias de la IA, ids únicos y suficientes para llenar un día.
  const content = buildStoryContentSchema(cfg.data, loc.data);
  const seedIds = new Set<string>();
  const parsedSeeds: StoryData['seeds'] = [];
  for (const seed of seeds.data.stories) {
    const { id, ...rest } = seed as { id: string };
    if (seedIds.has(id)) errors.push(`story-seeds.json: semilla duplicada '${id}'`);
    seedIds.add(id);
    const parsed = content.safeParse(rest);
    if (parsed.success) parsedSeeds.push({ id, ...parsed.data });
    else errors.push(...issuesOf(`semilla ${id}`, parsed.error));
  }
  if (seedIds.size < cfg.data.bucket.storiesPerDay) {
    errors.push(`story-seeds.json: hacen falta al menos ${cfg.data.bucket.storiesPerDay} semillas para llenar un día (hay ${seedIds.size})`);
  }

  if (errors.length > 0) return { errors };
  return { data: { config: cfg.data, locations: loc.data, seeds: parsedSeeds }, errors };
}
