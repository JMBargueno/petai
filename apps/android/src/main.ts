import { mount } from 'svelte';
import App from './App.svelte';
import '@pockai/ui/fonts.css';
import '@pockai/ui/tokens.css';
import '@pockai/ui/base.css';
import '@pockai/ui/kit.css';
import './app.css';

mount(App, { target: document.getElementById('app')! });
