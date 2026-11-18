import * as fs from 'fs';
import * as path from 'path';
import { buildStoryContentSchema, validateStoryData } from './story-data.schemas';

const dir = path.resolve(__dirname, '../../../../shared/game-data');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, `${f}.json`), 'utf8'));
const load = () => ({ stories: read('stories'), locations: read('story-locations'), seeds: read('story-seeds') });

describe('story-data.schemas', () => {
  it('los datos reales de shared/game-data son válidos', () => {
    const { data, errors } = validateStoryData(load());
    expect(errors).toEqual([]);
    expect(data.seeds.length).toBeGreaterThanOrEqual(data.config.bucket.storiesPerDay);
    expect(data.locations.locations.some((l) => l.id === 'rotura-del-nexo')).toBe(true);
  });

  it('rechaza una localización cuya capa no es de su ranura', () => {
    const raw = load();
    raw.locations.locations[0].layers.bg = 'l2-prado-hebras';
    const { data, errors } = validateStoryData(raw);
    expect(data).toBeUndefined();
    expect(errors.join('\n')).toContain('no es de la ranura bg');
  });

  it('rechaza una localización abierta con un edificio en l1', () => {
    const raw = load();
    raw.locations.locations.find((l: any) => l.kind === 'open').layers.l1 = 'l1-coliseo';
    expect(validateStoryData(raw).errors.join('\n')).toContain('no cuadra con su capa l1');
  });

  it('exige semillas suficientes para llenar un día', () => {
    const raw = load();
    raw.seeds.stories = raw.seeds.stories.slice(0, 1);
    expect(validateStoryData(raw).errors.join('\n')).toContain('hacen falta al menos');
  });

  describe('buildStoryContentSchema', () => {
    const { data } = validateStoryData(load());
    const schema = buildStoryContentSchema(data.config, data.locations);
    const { id: _id, ...valid } = data.seeds[0];

    it('acepta una semilla', () => {
      expect(schema.safeParse(valid).success).toBe(true);
    });

    it('rechaza localizaciones inventadas, campos de más y escenas de menos', () => {
      const bad = JSON.parse(JSON.stringify(valid));
      bad.scenes[0].locationId = 'castillo-inventado';
      expect(schema.safeParse(bad).success).toBe(false);

      const extra = JSON.parse(JSON.stringify(valid));
      extra.scenes[0].choices[0].reward = 999;
      expect(schema.safeParse(extra).success).toBe(false);

      const short = { ...valid, scenes: valid.scenes.slice(0, 2) };
      expect(schema.safeParse(short).success).toBe(false);
    });

    it('rechaza una escena sin ninguna opción buena', () => {
      const bad = JSON.parse(JSON.stringify(valid));
      for (const c of bad.scenes[1].choices) c.score = 0;
      expect(schema.safeParse(bad).success).toBe(false);
    });
  });
});
