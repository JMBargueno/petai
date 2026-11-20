/**
 * El arranque de la app de Android: las hojas de estilo (las comunes primero, las de esta app
 * después) y el shell compartido con la configuración de Android. La lógica, la navegación y las
 * pantallas están en `@pockai/mobile`, que comparte con iOS.
 */
import '@pockai/mobile/styles';
import './app.css';
import { startMobileApp } from '@pockai/mobile';
import { androidConfig } from './config';

startMobileApp(androidConfig);
