import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Config de tests unitarios del desktop (feature 009-edge-cdn, T008/T009).
 *
 * Solo cubre el código de `src/lib/*.ts` (AssetLoader, GameDataClient, PredictivePreloader). Usa
 * ambiente `node` (Blob/TextEncoder/ArrayBuffer disponibles en Node ≥ 18). Los imports `?raw` de
 * `sprites.ts` no se cargan aquí (los specs no importan `sprites.ts`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/lib/**/*.spec.ts'],
  },
});