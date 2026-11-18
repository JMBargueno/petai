/**
 * `@pockai/scene/backdrop`: fondos por capas SIN Pixi (modelo puro + pintor Canvas 2D). Lo importan
 * las pantallas que solo necesitan un fondo animado; la escena de la aventura usa el pintor Pixi.
 */
export * from './model';
export { layerUrl } from './layerUrls';
export { mountBackdrop, paintPrims, type BackdropHandle, type BackdropOptions } from './canvas2d';
