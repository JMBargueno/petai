import { defineConfig } from 'vite';

/**
 * - `pnpm --filter @pockai/minigames dev` → página embed (`/?demo=catch_food` para probar un juego).
 * - `pnpm --filter @pockai/minigames build:embed` → `dist/embed/`, bundle autocontenido con rutas
 *   relativas para copiarlo a los assets de Android y al bundle de iOS.
 * El escritorio no usa este build: importa `@pockai/minigames` como código fuente.
 */
export default defineConfig({
  base: './',
  server: { port: 5181, strictPort: true, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist/embed',
    emptyOutDir: true,
    target: 'es2020',
  },
  test: { environment: 'node' },
} as never);
