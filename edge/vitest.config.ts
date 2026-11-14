import { defineConfig } from 'vitest/config';

/** Tests del edge (feature 009-edge-cdn, T017). Ambiente `node` (Request/Response/performance). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});