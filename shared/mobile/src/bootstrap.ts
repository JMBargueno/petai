/**
 * El arranque de una app móvil, igual en Android y en iOS: la plataforma antes de montar (en
 * desarrollo, `?platform=ios` deja probar iOS sin un Mac), la apariencia que el jugador eligió en
 * este móvil, el sonido conectado al kit y a los juegos, y el shell.
 *
 * Las hojas de estilo no se importan aquí: van en `@pockai/mobile/styles`, que cada app carga antes
 * de su propio `app.css` para que el orden de las hojas quede a la vista en su `main.ts`.
 */
import { mount } from 'svelte';
import { initAppearance, resolvePlatform, setPlatform } from '@pockai/ui';
import MobileApp from './MobileApp.svelte';
import { installSound } from './audio';
import type { MobileConfig } from './config';

export function startMobileApp(config: MobileConfig, target: HTMLElement = document.getElementById('app')!): void {
  setPlatform(resolvePlatform(config.platform, location.search, import.meta.env.DEV));
  initAppearance();
  installSound(config.platform);

  // En desarrollo, `?gallery` enseña el kit de componentes sin el núcleo, para diseñarlo por plataforma.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
    void import('@pockai/ui/gallery').then((m) => mount(m.default, { target }));
    return;
  }
  mount(MobileApp, { target, props: { config } });
}
