/**
 * Las hojas de estilo de una app móvil, en el orden que importa: los tokens y el kit primero y
 * `platform.css` después (es el que cambia la geometría según `data-platform`), y al final la
 * disposición común del móvil. Cada app lo importa como `@pockai/mobile/styles` y añade su `app.css`
 * después, si tiene algo propio.
 */
import '@pockai/ui/fonts.css';
import '@pockai/ui/tokens.css';
import '@pockai/ui/themes.css';
import '@pockai/ui/scene.css';
import '@pockai/ui/base.css';
import '@pockai/ui/kit.css';
import '@pockai/ui/platform.css';
import '../styles/app.css';
