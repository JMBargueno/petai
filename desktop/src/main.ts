import '@pockai/ui/fonts.css';
import '@pockai/ui/tokens.css';
import '@pockai/ui/base.css';
import '@pockai/ui/kit.css';
import './styles/desktop.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { onUiFeedback } from '@pockai/ui';
import { sfx } from './lib/audio';
import { initTheme } from './lib/theme';

// Antes de montar, para que la primera pintura ya salga con el tema elegido.
initTheme();

// Los componentes de @pockai/ui no suenan: avisan, y aquí se les pone el efecto de sonido.
const UI_SOUNDS = {
  modalOpen: 'ui.modal_open',
  modalClose: 'ui.modal_close',
  coinGain: 'ui.coin_gain',
  gemGain: 'ui.gem_gain',
} as const;
onUiFeedback((kind) => sfx(UI_SOUNDS[kind]));

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
