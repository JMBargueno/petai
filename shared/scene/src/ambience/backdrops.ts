/**
 * Fondos pintados de las salas (modo híbrido): un panorama por sala, pintado con Nano Banana y con
 * el cielo vuelto transparente (`scripts/art/habitat-backdrops`), que se ve detrás de la sala
 * isométrica y delante del cielo vivo. Vite resuelve las URLs en build, así que el bundle embed los
 * lleva consigo (Android/iOS sin red). Una sala sin fondo se ve como siempre: solo cielo.
 */
import { Assets, Texture } from 'pixi.js';

const FILES = import.meta.glob('../../../assets/habitat-backdrops/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** URL del fondo de una sala, o `null` si esa sala aún no tiene. */
export function backdropUrl(roomId: string | null | undefined): string | null {
  if (!roomId) return null;
  const hit = Object.entries(FILES).find(([file]) => file.endsWith(`/${roomId}.webp`));
  return hit ? hit[1] : null;
}

const cache = new Map<string, Promise<Texture | null>>();

/** Textura del fondo de una sala (cacheada). `null` si no hay arte o no carga. */
export function loadBackdrop(roomId: string | null | undefined): Promise<Texture | null> {
  const url = backdropUrl(roomId);
  if (!url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = Assets.load<Texture>(url).catch(() => null);
    cache.set(url, p);
  }
  return p;
}
