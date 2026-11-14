#!/usr/bin/env tsx
/**
 * validate-animations.ts — Feature 027 (iOS + Skia Animation Engine).
 *
 * Valida `shared/assets/animation-specs.json` (formato AnimationSpec): frames, fps,
 * easing, loop y triggers de transición. Se corre en CI/dev:
 *
 *   tsx scripts/validate-animations.ts
 *   tsx scripts/validate-animations.ts shared/assets/other.json
 *
 * Salida: un reporte JSON `{ ok, errors, warnings }` en stdout. Exit code 0 si OK,
 * 1 si hay errores (los warnings no fallan la build).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID_EASINGS = new Set([
  'linear',
  'easeInQuad',
  'easeOutCubic',
  'easeInOutSine',
  'elastic',
]);
const MIN_FPS = 1;
const MAX_FPS = 240;
// Estados terminales permitidos sin transición de salida (se quedan en el último frame).
const TERMINAL_STATES = new Set(['victory', 'defeat']);

interface Trigger {
  on: string;
  to: string;
  once?: boolean;
}

interface StateSpec {
  frames: number[];
  fps?: number;
  easing?: string;
  loop?: boolean;
  triggers?: Trigger[];
}

interface SpeciesSpec {
  species: string;
  sheet?: { frames?: number };
  defaultFps?: number;
  states: Record<string, StateSpec>;
}

interface AnimationSpecsFile {
  version: number;
  validEasings?: string[];
  specs: SpeciesSpec[];
}

function validate(specs: AnimationSpecsFile): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (specs.version !== 1) {
    errors.push(`version debe ser 1 (recibido: ${specs.version})`);
  }
  if (!Array.isArray(specs.specs) || specs.specs.length === 0) {
    errors.push('specs debe ser un array no vacío');
    return { errors, warnings };
  }

  const speciesSeen = new Set<string>();
  for (const spec of specs.specs) {
    const label = `species "${spec.species}"`;
    if (!spec.species) {
      errors.push('Falta `species` en un spec');
      continue;
    }
    if (speciesSeen.has(spec.species)) {
      errors.push(`Spec duplicado para ${label}`);
    }
    speciesSeen.add(spec.species);

    const sheetFrames = spec.sheet?.frames ?? null;
    if (sheetFrames !== null && (!Number.isInteger(sheetFrames) || sheetFrames <= 0)) {
      errors.push(`${label}: sheet.frames inválido (${sheetFrames})`);
    }

    if (!spec.states || Object.keys(spec.states).length === 0) {
      errors.push(`${label}: states vacío`);
      continue;
    }

    const stateNames = new Set(Object.keys(spec.states));
    for (const [stateName, state] of Object.entries(spec.states)) {
      const sLabel = `${label} / state "${stateName}"`;

      if (!Array.isArray(state.frames) || state.frames.length === 0) {
        errors.push(`${sLabel}: frames debe ser un array no vacío`);
      } else {
        for (const f of state.frames) {
          if (!Number.isInteger(f) || f < 0) {
            errors.push(`${sLabel}: frame inválido (${f})`);
            break;
          }
          if (sheetFrames !== null && f >= sheetFrames) {
            errors.push(`${sLabel}: frame ${f} excede el sprite sheet (${sheetFrames} frames)`);
            break;
          }
        }
        // Orden ascendente (permite repetir frames para "hold").
        for (let i = 1; i < state.frames.length; i++) {
          if (state.frames[i] < state.frames[i - 1]) {
            errors.push(`${sLabel}: frames no están ordenados ascendente`);
            break;
          }
        }
      }

      const fps = state.fps ?? spec.defaultFps ?? 0;
      if (!Number.isFinite(fps) || fps < MIN_FPS || fps > MAX_FPS) {
        errors.push(`${sLabel}: fps inválido (${fps}, rango ${MIN_FPS}-${MAX_FPS})`);
      }

      if (state.easing !== undefined && !VALID_EASINGS.has(state.easing)) {
        errors.push(
          `${sLabel}: easing inválido "${state.easing}" (válidos: ${[...VALID_EASINGS].join(', ')})`,
        );
      }

      if (state.loop !== undefined && typeof state.loop !== 'boolean') {
        errors.push(`${sLabel}: loop debe ser booleano`);
      }

      const triggers = state.triggers ?? [];
      for (const t of triggers) {
        if (!t.on || !t.to) {
          errors.push(`${sLabel}: trigger incompleto (requiere on y to)`);
          continue;
        }
        if (!stateNames.has(t.to)) {
          errors.push(`${sLabel}: trigger apunta a estado inexistente "${t.to}"`);
        }
      }

      // Huérfanos: estado sin transición de salida (salvo terminales).
      if (triggers.length === 0 && !TERMINAL_STATES.has(stateName)) {
        warnings.push(`${sLabel}: sin transición de salida (¿estado huérfano?)`);
      }
    }
  }

  return { errors, warnings };
}

function main(): void {
  const arg = process.argv[2];
  const target = arg ?? 'shared/assets/animation-specs.json';
  const fullPath = resolve(process.cwd(), target);

  let parsed: AnimationSpecsFile;
  try {
    parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as AnimationSpecsFile;
  } catch (err) {
    const errors = [`No se pudo leer/parsear ${target}: ${(err as Error).message}`];
    console.log(JSON.stringify({ ok: false, errors, warnings: [] }, null, 2));
    process.exit(1);
  }

  const { errors, warnings } = validate(parsed);
  const ok = errors.length === 0;
  console.log(JSON.stringify({ ok, errors, warnings }, null, 2));
  if (ok) {
    console.log(`✓ animation-specs válidos (${parsed.specs.length} species)`);
  } else {
    console.error(`✗ ${errors.length} error(es) en animation-specs`);
  }
  process.exit(ok ? 0 : 1);
}

main();
