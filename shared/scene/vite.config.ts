import { defineConfig } from 'vite';

/**
 * - `pnpm --filter @pockai/scene dev` → servidor con la página embed (`/?demo` para el panel).
 * - `pnpm --filter @pockai/scene build:embed` → `dist/embed/`, bundle autocontenido con rutas
 *   relativas para incrustarlo en una app nativa.
 * El escritorio y Android (Tauri) no usan este build: importan `@pockai/scene` como código fuente.
 */
export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist/embed',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2020',
  },
  test: { environment: 'node' },
} as never);
