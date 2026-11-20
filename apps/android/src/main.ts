import { mount } from 'svelte';
import { initAppearance, resolvePlatform, setPlatform } from '@pockai/ui';
import App from './App.svelte';
import { installSound } from './audio';
import '@pockai/ui/fonts.css';
import '@pockai/ui/tokens.css';
import '@pockai/ui/themes.css';
import '@pockai/ui/scene.css';
import '@pockai/ui/base.css';
import '@pockai/ui/kit.css';
import '@pockai/ui/platform.css';
import './app.css';

// Antes de montar: los componentes se pintan como en Android (en desarrollo, `?platform=ios` deja
// probar iOS sin un Mac) y con la apariencia que el jugador eligió en este móvil.
setPlatform(resolvePlatform('android', location.search, import.meta.env.DEV));
initAppearance();

// Los juegos y el kit suenan con el motor del móvil (spec 40).
installSound();

const target = document.getElementById('app')!;
// En desarrollo, `?gallery` enseña el kit de componentes sin el núcleo, para diseñarlo por plataforma.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
  void import('@pockai/ui/gallery').then((m) => mount(m.default, { target }));
} else {
  mount(App, { target });
}
