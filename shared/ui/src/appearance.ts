import { derived, get, readable, writable, type Readable } from 'svelte/store';
import { DEFAULT_THEME, getTheme, isThemeId, type CanvasPalette, type ColorScheme } from './themes';

/**
 * Apariencia de la app, elegida por el jugador y guardada en cada dispositivo. Son dos ejes:
 * - el tema (`classic`, `cozy`…; ver src/themes), que cambia la paleta y algunos fondos;
 * - el esquema (seguir al sistema, claro u oscuro).
 *
 * Se aplica en <html> como `data-theme="<id>"` y `data-scheme="light|dark"` (sin `data-scheme`
 * manda el sistema). Los tokens usan light-dark(), así que basta con cambiar los atributos.
 * Un tema que solo admite un esquema lo fuerza, pero la elección del jugador se conserva para
 * cuando vuelva a otro tema.
 */
export type SchemeChoice = 'system' | ColorScheme;
export interface Appearance {
  theme: string;
  scheme: SchemeChoice;
}

export const APPEARANCE_KEY = 'pockai_appearance';
/** Clave del antiguo selector claro/oscuro del escritorio: se migra la primera vez. */
export const LEGACY_THEME_KEY = 'pockai_theme';
export const DEFAULT_APPEARANCE: Appearance = { theme: DEFAULT_THEME, scheme: 'system' };

const SCHEMES: readonly SchemeChoice[] = ['system', 'light', 'dark'];

type ReadStorage = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem' | 'removeItem'>>;
type WriteStorage = Pick<Storage, 'setItem'>;
type AppearanceRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };
type MediaQuery = Pick<MediaQueryList, 'matches'> & {
  addEventListener?(type: 'change', cb: () => void): void;
  removeEventListener?(type: 'change', cb: () => void): void;
};
type AppearanceWindow = {
  addEventListener(type: 'storage', cb: (e: { key: string | null }) => void): void;
  removeEventListener(type: 'storage', cb: (e: { key: string | null }) => void): void;
};

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
const defaultRoot = (): AppearanceRoot | undefined => (typeof document !== 'undefined' ? document.documentElement : undefined);
const darkQuery = (): MediaQuery | undefined =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;

function normalize(raw: Partial<Appearance> | null | undefined): Appearance {
  return {
    theme: isThemeId(raw?.theme) ? raw.theme : DEFAULT_APPEARANCE.theme,
    scheme: SCHEMES.includes(raw?.scheme as SchemeChoice) ? (raw!.scheme as SchemeChoice) : DEFAULT_APPEARANCE.scheme,
  };
}

/** Lee la apariencia guardada. Si solo existe la clave antigua (`pockai_theme`), la migra. */
export function loadAppearance(storage: ReadStorage | undefined = defaultStorage()): Appearance {
  try {
    const raw = storage?.getItem(APPEARANCE_KEY);
    if (raw) return normalize(JSON.parse(raw));
    const legacy = storage?.getItem(LEGACY_THEME_KEY);
    if (legacy !== null && legacy !== undefined) {
      const migrated = normalize({ theme: DEFAULT_THEME, scheme: legacy as SchemeChoice });
      storage?.setItem?.(APPEARANCE_KEY, serialize(migrated));
      storage?.removeItem?.(LEGACY_THEME_KEY);
      return migrated;
    }
  } catch {
    /* almacenamiento roto o JSON inválido: la apariencia por defecto */
  }
  return { ...DEFAULT_APPEARANCE };
}

function serialize(a: Appearance): string {
  return JSON.stringify({ v: 1, theme: a.theme, scheme: a.scheme });
}

/** El esquema que hay que forzar (`data-scheme`), o `null` si manda el sistema. */
export function forcedScheme(a: Appearance): ColorScheme | null {
  const { schemes } = getTheme(a.theme);
  if (schemes.length === 1) return schemes[0];
  return a.scheme === 'system' ? null : a.scheme;
}

/** El esquema que se ve de verdad. */
export function effectiveScheme(a: Appearance, prefersDark = darkQuery()?.matches ?? false): ColorScheme {
  return forcedScheme(a) ?? (prefersDark ? 'dark' : 'light');
}

/** Pone los atributos en <html>. Las barras del sistema las sigue `initAppearance` (ver systemChrome). */
export function applyAppearance(a: Appearance, root: AppearanceRoot | undefined = defaultRoot()) {
  if (!root) return;
  root.setAttribute('data-theme', a.theme);
  const forced = forcedScheme(a);
  if (forced) root.setAttribute('data-scheme', forced);
  else root.removeAttribute('data-scheme');
}

/**
 * Puente nativo de las barras del sistema. En Android lo expone MainActivity.kt (iconos claros u
 * oscuros según el fondo del tema); en el escritorio y el navegador no existe y no pasa nada.
 */
export type SystemBars = { setDark(dark: boolean): void };
const nativeBars = (): SystemBars | undefined =>
  (globalThis as { PockaiSystemBars?: SystemBars }).PockaiSystemBars;

/**
 * Ajusta lo que pinta el sistema alrededor de la app al tema y esquema que se ven: el color de la
 * barra (`<meta name="theme-color">`) y el color de sus iconos (puente nativo).
 */
export function systemChrome(resolved: { theme: string; scheme: ColorScheme }, bars: SystemBars | undefined = nativeBars()) {
  try {
    bars?.setDark(resolved.scheme === 'dark');
  } catch {
    /* el puente nativo no está listo: la próxima actualización lo intentará otra vez */
  }
  if (typeof document === 'undefined' || !document.head) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = getTheme(resolved.theme).swatch[resolved.scheme][0];
}

/** Apariencia elegida (lo que se guarda). */
export const appearance = writable<Appearance>({ ...DEFAULT_APPEARANCE });

/** Cambia el tema o el esquema, lo aplica y lo recuerda en este dispositivo. */
export function setAppearance(patch: Partial<Appearance>, storage: WriteStorage | undefined = defaultStorage()) {
  const next = normalize({ ...get(appearance), ...patch });
  appearance.set(next);
  applyAppearance(next);
  try {
    storage?.setItem(APPEARANCE_KEY, serialize(next));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  return next;
}

/**
 * Aplica la apariencia guardada. La app la llama en main.ts antes de montar, para que la primera
 * pintura ya salga bien. Escucha el evento `storage` para que las otras ventanas del escritorio
 * cambien a la vez, y mantiene las barras del sistema (color e iconos) al día, también cuando el
 * sistema cambia de claro a oscuro. Devuelve la función que deja de escuchar.
 */
export function initAppearance(
  opts: { storage?: ReadStorage; root?: AppearanceRoot; win?: AppearanceWindow; bars?: SystemBars } = {},
): () => void {
  const storage = 'storage' in opts ? opts.storage : defaultStorage();
  const root = 'root' in opts ? opts.root : defaultRoot();
  const win: AppearanceWindow | undefined =
    'win' in opts ? opts.win : typeof window !== 'undefined' ? (window as unknown as AppearanceWindow) : undefined;
  const sync = () => {
    const a = loadAppearance(storage);
    appearance.set(a);
    applyAppearance(a, root);
  };
  sync();
  const onStorage = (e: { key: string | null }) => {
    if (e.key === APPEARANCE_KEY || e.key === null) sync();
  };
  win?.addEventListener('storage', onStorage);
  const stopChrome = resolvedAppearance.subscribe((r) => systemChrome(r, 'bars' in opts ? opts.bars : nativeBars()));
  return () => {
    win?.removeEventListener('storage', onStorage);
    stopChrome();
  };
}

/** Preferencia de oscuro del sistema, viva. */
const systemPrefersDark: Readable<boolean> = readable(false, (set) => {
  const mq = darkQuery();
  if (!mq) return;
  set(mq.matches);
  const onChange = () => set(mq.matches);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
});

/** Tema y esquema que se ven ahora, también cuando cambia el sistema. */
export const resolvedAppearance: Readable<{ theme: string; scheme: ColorScheme }> = derived(
  [appearance, systemPrefersDark],
  ([a, dark]) => ({ theme: a.theme, scheme: effectiveScheme(a, dark) }),
);

/** Paleta de canvas del tema y esquema dados (por defecto, los que se ven ahora). */
export function canvasPalette(resolved: { theme: string; scheme: ColorScheme } = get(resolvedAppearance)): CanvasPalette {
  return getTheme(resolved.theme).canvas[resolved.scheme];
}

/** Para dibujos en canvas o Pixi: avisa al momento y cada vez que cambian tema o esquema. */
export function onAppearanceChange(cb: (resolved: { theme: string; scheme: ColorScheme }, palette: CanvasPalette) => void) {
  return resolvedAppearance.subscribe((r) => cb(r, canvasPalette(r)));
}
