/**
 * Registro de temas de la app. Un tema cambia la paleta y algunos fondos; se combina con el esquema
 * claro/oscuro (src/appearance.ts) y nunca con la plataforma (src/platform.ts).
 *
 * Para añadir un tema:
 *   1. styles/themes/<id>.css con `:root[data-theme='<id>'] { … }`, redefiniendo tokens semánticos
 *      (tokens.css) y de decorado (scene.css) con light-dark() (ver cozy.css).
 *   2. Importarlo en styles/themes.css.
 *   3. src/themes/<id>.ts con su manifiesto (esquemas, muestra y paleta de canvas).
 *   4. Añadirlo a THEMES aquí abajo.
 *   5. `pnpm --filter @pockai/ui test` comprueba el registro y el contraste del texto.
 */
import { classic } from './classic';
import { cozy } from './cozy';
import type { ThemeManifest } from './types';

export type { CanvasPalette, ColorScheme, ThemeManifest } from './types';

export const DEFAULT_THEME = 'classic';

export const THEMES: readonly ThemeManifest[] = [classic, cozy];

export function getTheme(id: string | null | undefined): ThemeManifest {
  return THEMES.find((t) => t.id === id) ?? classic;
}

export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((t) => t.id === id);
}
