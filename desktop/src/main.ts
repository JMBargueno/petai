import '@fontsource/bowlby-one';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/kit.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initTheme } from './lib/theme';

// Antes de montar, para que la primera pintura ya salga con el tema elegido.
initTheme();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
