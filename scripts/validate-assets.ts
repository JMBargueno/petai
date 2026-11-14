/**
 * PetAI Asset Pipeline Validator (TypeScript source)
 * Valida la integridad de shared/assets/ conforme a docs/ART_PIPELINE.md
 */
import * as fs from 'fs';
import * as path from 'path';

interface FrameTag {
  name: string;
  from: number;
  to: number;
  direction?: string;
}

interface AnimJson {
  meta?: {
    frameTags?: FrameTag[];
    size?: { w: number; h: number };
  };
}

const CRITICAL_TAGS = ['idle', 'walk', 'eat', 'happy', 'sleep', 'attack'] as const;
const RECOMMENDED_TAGS: Record<string, string> = {
  idle_alt: 'idle',
  sit: 'idle',
  clean: 'happy',
  sad: 'idle',
  sick: 'idle',
  cast: 'attack',
  hurt: 'idle',
  faint: 'sleep',
  talk: 'happy'
};

function readPngDimensions(filePath: string): { width: number; height: number } {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(24);
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);

  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
    throw new Error(`Archivo no es un PNG válido: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

export function validateAssets(projectRoot: string): { criticalErrors: number; warnings: number } {
  const sharedAssetsDir = path.join(projectRoot, 'shared', 'assets');
  const sharedGameDataDir = path.join(projectRoot, 'shared', 'game-data');

  let criticalErrors = 0;
  let warnings = 0;

  // 1. palettes.json
  const palettesPath = path.join(sharedAssetsDir, 'palettes.json');
  if (!fs.existsSync(palettesPath)) {
    criticalErrors++;
  }

  // 2. patterns/
  const patternsData = JSON.parse(fs.readFileSync(path.join(sharedGameDataDir, 'patterns.json'), 'utf8'));
  for (const pat of patternsData) {
    if (pat.id === 'plain') continue;
    const patFile = path.join(sharedAssetsDir, 'patterns', `${pat.id}.png`);
    if (!fs.existsSync(patFile)) {
      criticalErrors++;
    } else {
      const dim = readPngDimensions(patFile);
      if (dim.width !== 256 || dim.height !== 256) criticalErrors++;
    }
  }

  // 3. species/
  const speciesData = JSON.parse(fs.readFileSync(path.join(sharedGameDataDir, 'species.json'), 'utf8'));
  for (const sp of speciesData) {
    const spDir = path.join(sharedAssetsDir, 'species', sp.id);
    const basePath = path.join(spDir, 'base.png');
    const maskPath = path.join(spDir, 'mask.png');
    const animPath = path.join(spDir, 'anim.json');

    if (!fs.existsSync(basePath) || !fs.existsSync(maskPath) || !fs.existsSync(animPath)) {
      criticalErrors++;
      continue;
    }

    const baseDim = readPngDimensions(basePath);
    const maskDim = readPngDimensions(maskPath);
    if (baseDim.width !== maskDim.width || baseDim.height !== maskDim.height) {
      criticalErrors++;
    }

    const animData: AnimJson = JSON.parse(fs.readFileSync(animPath, 'utf8'));
    const tagNames = new Set((animData.meta?.frameTags || []).map(t => t.name));

    for (const crit of CRITICAL_TAGS) {
      if (!tagNames.has(crit)) criticalErrors++;
    }

    for (const rec of Object.keys(RECOMMENDED_TAGS)) {
      if (!tagNames.has(rec)) warnings++;
    }
  }

  return { criticalErrors, warnings };
}
