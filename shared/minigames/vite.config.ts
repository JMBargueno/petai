import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const SHARED_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };

/**
 * En desarrollo sirve `shared/assets` en `/shared-assets/`: de ahí salen las hojas de la mascota, que
 * no van en el bundle (en Android la app ya las lleva en sus assets, junto al embed).
 */
const sharedAssets = (): Plugin => ({
  name: 'pockai-shared-assets',
  configureServer(server) {
    server.middlewares.use('/shared-assets', (req, res, next) => {
      const file = path.join(SHARED_ASSETS, decodeURIComponent((req.url ?? '').split('?')[0]));
      const type = MIME[path.extname(file)];
      if (!type || !file.startsWith(SHARED_ASSETS) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
      res.setHeader('Content-Type', type);
      fs.createReadStream(file).pipe(res);
    });
  },
});

/**
 * - `pnpm --filter @pockai/minigames dev` → página embed (`/?demo=catch_food` para probar un juego).
 * - `pnpm --filter @pockai/minigames build:embed` → `dist/embed/`, bundle autocontenido con rutas
 *   relativas para incrustarlo en una app nativa.
 * El escritorio y Android (Tauri) no usan este build: importan `@pockai/minigames` como código fuente.
 */
export default defineConfig({
  base: './',
  plugins: [sharedAssets()],
  server: { port: 5181, strictPort: true, fs: { allow: ['..'] } },
  build: {
    outDir: 'dist/embed',
    emptyOutDir: true,
    target: 'es2020',
  },
  test: { environment: 'node' },
} as never);
