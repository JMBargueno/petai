import { defineConfig } from 'vitest/config';

/** Tests unitarios de la lógica de @pockai/ui (plataforma, apariencia y temas). Sin DOM. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
