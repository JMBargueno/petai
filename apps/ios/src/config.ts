/**
 * Lo que distingue a la app de iOS del shell compartido (`@pockai/mobile`): su plataforma, el aviso
 * de cuando se abre fuera de la app y, llegado el caso, qué pestañas y secciones enseña.
 *
 * El juego entra entero desde el primer día: las pantallas son las mismas (`DEFAULT_SECTIONS`) y los
 * contenedores solo usan `query` y `perform` del núcleo, que no dependen del sistema. Si alguna se
 * portara mal en el simulador, se quita de aquí: para eso está esta configuración.
 */
import { mobileConfig, type MobileConfig } from '@pockai/mobile';

export const iosConfig: MobileConfig = mobileConfig('ios', {
  noCoreText: 'Esta pantalla es la app de iPhone: ábrela desde la app, no desde el navegador.',
});
