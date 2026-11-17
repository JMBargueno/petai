import '@fontsource/bowlby-one';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/social.css';
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
