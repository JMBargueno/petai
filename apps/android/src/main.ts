import { mount } from 'svelte';
import App from './App.svelte';
import { installSound } from './audio';
import '@pockai/ui/fonts.css';
import '@pockai/ui/tokens.css';
import '@pockai/ui/base.css';
import '@pockai/ui/kit.css';
import './app.css';

// Los juegos y el kit suenan con el motor del móvil (spec 40).
installSound();

mount(App, { target: document.getElementById('app')! });
