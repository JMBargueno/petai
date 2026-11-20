/**
 * Lo que distingue a la app de Android del shell compartido (`@pockai/mobile`): su plataforma, el
 * aviso de cuando se abre fuera de la app y, llegado el caso, qué pestañas y secciones enseña. Hoy
 * todo lo demás es lo de serie: las dos apps tienen el mismo juego.
 */
import { mobileConfig, type MobileConfig } from '@pockai/mobile';

export const androidConfig: MobileConfig = mobileConfig('android', {
  noCoreText: 'Esta pantalla es la app de Android: ábrela desde la app, no desde el navegador.',
});
