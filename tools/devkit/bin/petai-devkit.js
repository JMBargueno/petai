#!/usr/bin/env node
/**
 * Lanzador del CLI `petai-devkit`. Registra `ts-node` (transpileOnly) para poder ejecutar los
 * comandos escritos en TypeScript directamente con `node`, sin un paso previo de build.
 */
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2022',
    moduleResolution: 'node',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: false,
    strictNullChecks: false,
    noImplicitAny: false,
  },
});

require('../src/index.ts');