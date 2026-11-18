// Arranca Vite en modo demo: la API (/v1/*) se sirve con datos de ejemplo (vite.mock.ts).
// Usa otro puerto que `dev` para poder tener los dos abiertos a la vez.
import { spawn } from 'node:child_process';

const port = process.env.DEMO_PORT ?? '5175';
const child = spawn('vite', ['--port', port, '--strictPort'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_MOCK: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
