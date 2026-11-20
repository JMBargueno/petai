/**
 * El arranque de la app de iOS: las hojas de estilo (las comunes primero, las de esta app después) y
 * el shell compartido con la configuración de iOS. La lógica, la navegación y las pantallas están en
 * `@pockai/mobile`, que comparte con Android.
 */
import '@pockai/mobile/styles';
import './app.css';
import { startMobileApp } from '@pockai/mobile';
import { iosConfig } from './config';

startMobileApp(iosConfig);
