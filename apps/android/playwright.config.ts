import { defineConfig } from '@playwright/test';

/**
 * Tests visuales del kit de @pockai/ui: el muestrario (`?gallery`) en cada plataforma × tema × esquema.
 * Comprueban la geometría y los colores calculados (que no dependen del sistema operativo) y adjuntan
 * una captura de cada combinación al informe para revisarla a ojo.
 *
 * En la CI se usa el Chromium de Playwright; en local, el Edge del sistema (sin descargar nada).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5184',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    channel: process.env.CI ? undefined : 'msedge',
  },
  webServer: {
    command: 'pnpm exec vite --port 5184 --strictPort',
    url: 'http://localhost:5184/?gallery',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
