import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
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
    proxy: {
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
