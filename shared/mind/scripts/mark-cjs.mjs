// El paquete es "type": "module", pero dist/node es CommonJS (lo carga el backend con require).
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../dist/node/package.json', import.meta.url), '{ "type": "commonjs" }\n');
