/**
 * PRNG determinista (mulberry32). El motor de combate solo usa este generador, así que
 * la misma semilla y los mismos luchadores producen siempre el mismo registro.
 *
 * La implementación vive en `@pockai/mind` (la comparten el escritorio y la escena); este
 * archivo se conserva para no cambiar los imports del resto del backend.
 */
export { createRng, hashSeed } from '@pockai/mind/node';
