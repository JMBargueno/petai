import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tauri carga esta UI en el webview del móvil. En desarrollo, el dispositivo (o el emulador) la pide
// al equipo por la red, así que el servidor escucha en la dirección que indique TAURI_DEV_HOST.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  // Una sola copia de Svelte: el shell vive en @pockai/mobile y sus runas tienen que ser las de aquí.
  resolve: { dedupe: ['svelte'] },
  server: {
    port: 5183,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5184 } : undefined,
  },
});
