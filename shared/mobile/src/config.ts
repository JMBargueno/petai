/**
 * Lo que cambia entre las apps móviles, y nada más.
 *
 * El shell (`MobileApp.svelte`), el reflejo del núcleo (`core.ts`) y los contenedores de pantalla son
 * los mismos en Android y en iOS: la apariencia de cada sistema ya la pone `@pockai/ui` por el
 * atributo `data-platform` (Material 3 en `platform/android.css`, Cupertino en `platform/ios.css`),
 * así que aquí no hay nada de estilo.
 *
 * Regla: **una opción solo existe si hoy tiene dos valores distintos.** Lo que todavía no existe en
 * ninguna de las dos apps (pagos con Play Billing o StoreKit, inicio de sesión social, push) no se
 * declara hasta que haya backend y haya que distinguirlas; cuando llegue, entra aquí y no en una
 * copia del shell.
 */
import type { Bus } from '@pockai/audio';
import type { Platform } from '@pockai/ui';

export type MobilePlatform = Extract<Platform, 'android' | 'ios'>;

/** Pestaña de la barra inferior. `account` no está en la barra: se abre por el nombre de la cabecera. */
export type TabId = 'pet' | 'backpack' | 'play' | 'shop' | 'progress' | 'account';
export interface MobileTab {
  id: TabId;
  label: string;
  icon: string;
}
/** Sección dentro de una pestaña (el `Segmented` de arriba). */
export interface MobileSection {
  value: string;
  label: string;
  icon: string;
}

export interface MobileConfig {
  /** La plataforma de esta app: fija `data-platform` y los ajustes de sonido por defecto. */
  platform: MobilePlatform;
  /** Lo que se le dice a quien abre esta UI en un navegador, sin núcleo. */
  noCoreText: string;
  /** La barra de pestañas y sus iconos. */
  tabs: MobileTab[];
  /** Las secciones de cada pestaña. Una sección que no esté aquí no se pinta ni se puede alcanzar. */
  sections: Record<Exclude<TabId, 'backpack'>, MobileSection[]>;
  /** Qué tipos de sonido se ofrecen en Ajustes y con qué muestra. */
  audio: { buses: Bus[]; previews: Partial<Record<Bus, string>> };
  /** Si se pide el permiso de avisos al entrar (una vez). */
  askNotifications: boolean;
}

export const DEFAULT_TABS: MobileTab[] = [
  { id: 'pet', label: 'Mascota', icon: 'paw' },
  { id: 'backpack', label: 'Mochila', icon: 'gift' },
  { id: 'play', label: 'Jugar', icon: 'gamepad' },
  { id: 'shop', label: 'Tienda', icon: 'shop' },
  { id: 'progress', label: 'Progreso', icon: 'trophy' },
];

export const DEFAULT_SECTIONS: MobileConfig['sections'] = {
  pet: [
    { value: 'home', label: 'Inicio', icon: 'home' },
    { value: 'chat', label: 'Charla', icon: 'chat' },
    { value: 'bond', label: 'Vínculo', icon: 'bond' },
    { value: 'eggs', label: 'Huevos', icon: 'egg' },
    { value: 'wardrobe', label: 'Armario', icon: 'star' },
    { value: 'mind', label: 'Mente', icon: 'brain' },
    { value: 'habitat', label: 'Hábitat', icon: 'home' },
  ],
  play: [
    { value: 'games', label: 'Minijuegos', icon: 'gamepad' },
    { value: 'arena', label: 'Arena', icon: 'medal' },
    { value: 'raid', label: 'Raid', icon: 'swords' },
    { value: 'tournament', label: 'Torneo', icon: 'trophy' },
    { value: 'training', label: 'Entrenar', icon: 'castle' },
    { value: 'cooking', label: 'Cocina', icon: 'chef' },
    { value: 'adventure', label: 'Aventura', icon: 'map' },
  ],
  shop: [
    { value: 'store', label: 'Tienda', icon: 'shop' },
    { value: 'chests', label: 'Cofres', icon: 'gift' },
  ],
  progress: [
    { value: 'missions', label: 'Misiones', icon: 'target' },
    { value: 'season', label: 'Temporada', icon: 'trophy' },
  ],
  account: [
    { value: 'account', label: 'Cuenta', icon: 'user' },
    { value: 'profile', label: 'Perfil', icon: 'trophy' },
    { value: 'friends', label: 'Amigos', icon: 'users' },
    { value: 'visits', label: 'Visitas', icon: 'home' },
    { value: 'clans', label: 'Clanes', icon: 'shield' },
    { value: 'settings', label: 'Ajustes', icon: 'settings' },
  ],
};

/**
 * La config de una app móvil: lo de siempre salvo lo que cambie. En el móvil solo suenan efectos e
 * interfaz (la voz de la mascota y el ambiente no se empaquetan).
 */
export function mobileConfig(platform: MobilePlatform, patch: Partial<MobileConfig> = {}): MobileConfig {
  return {
    platform,
    noCoreText: 'Esta pantalla es la app del móvil: ábrela desde la app, no desde el navegador.',
    tabs: DEFAULT_TABS,
    sections: DEFAULT_SECTIONS,
    audio: { buses: ['sfx', 'ui'], previews: { sfx: 'mg.result.good' } },
    askNotifications: true,
    ...patch,
  };
}

/** La primera sección de una pestaña: con la que se abre. */
export function firstSection(config: MobileConfig, tab: Exclude<TabId, 'backpack'>): string {
  return config.sections[tab][0]?.value ?? '';
}
