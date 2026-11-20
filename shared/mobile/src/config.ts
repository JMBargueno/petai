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
  { id: 'pet', label: 'Mascota', icon: 'ui:pet' },
  { id: 'backpack', label: 'Mochila', icon: 'ui:backpack' },
  { id: 'play', label: 'Jugar', icon: 'ui:play' },
  { id: 'shop', label: 'Tienda', icon: 'ui:shop' },
  { id: 'progress', label: 'Progreso', icon: 'ui:progress' },
];

export const DEFAULT_SECTIONS: MobileConfig['sections'] = {
  pet: [
    { value: 'home', label: 'Inicio', icon: 'ui:home' },
    { value: 'chat', label: 'Charla', icon: 'ui:chat' },
    { value: 'bond', label: 'Vínculo', icon: 'ui:bonding' },
    { value: 'eggs', label: 'Huevos', icon: 'ui:hatch' },
    { value: 'wardrobe', label: 'Armario', icon: 'ui:wardrobe' },
    { value: 'mind', label: 'Mente', icon: 'ui:mind' },
    { value: 'habitat', label: 'Hábitat', icon: 'ui:habitat' },
  ],
  play: [
    { value: 'games', label: 'Minijuegos', icon: 'ui:games' },
    { value: 'arena', label: 'Arena', icon: 'ui:arena' },
    { value: 'raid', label: 'Raid', icon: 'ui:raid' },
    { value: 'tournament', label: 'Torneo', icon: 'ui:tournament' },
    { value: 'training', label: 'Entrenar', icon: 'ui:training' },
    { value: 'cooking', label: 'Cocina', icon: 'ui:cooking' },
    { value: 'adventure', label: 'Aventura', icon: 'ui:adventure' },
  ],
  shop: [
    { value: 'store', label: 'Tienda', icon: 'ui:store' },
    { value: 'chests', label: 'Cofres', icon: 'ui:chests' },
  ],
  progress: [
    { value: 'missions', label: 'Misiones', icon: 'ui:missions' },
    { value: 'season', label: 'Temporada', icon: 'ui:seasons' },
  ],
  account: [
    { value: 'account', label: 'Cuenta', icon: 'ui:account' },
    { value: 'profile', label: 'Perfil', icon: 'ui:profile' },
    { value: 'friends', label: 'Amigos', icon: 'ui:friends' },
    { value: 'visits', label: 'Visitas', icon: 'ui:visits' },
    { value: 'clans', label: 'Clanes', icon: 'ui:clans' },
    { value: 'settings', label: 'Ajustes', icon: 'ui:settings' },
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
