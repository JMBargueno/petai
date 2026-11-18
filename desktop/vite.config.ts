import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { demoApi } from './vite.mock';

// Modo demo (`pnpm desktop:demo`): la API se sirve con datos de ejemplo y no hace falta backend.
const demo = process.env.VITE_MOCK === '1';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), demoApi(demo)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  // Opciones específicas de Tauri
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: demo ? undefined : {
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      // socket.io usa la ruta HTTP /socket.io (el "/realtime" es solo el namespace del gateway)
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
