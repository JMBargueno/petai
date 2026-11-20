/**
 * Lo que cambia entre las apps móviles, y nada más.
 *
 * El shell (`MobileApp.svelte`), el reflejo del núcleo (`core.ts`) y los contenedores de pantalla son
 * los mismos en Android y en iOS: la apariencia de cada sistema ya la pone `@pockai/ui` por el
 * atributo `data-platform` (Material 3 en `platform/android.css`, Cupertino en `platform/ios.css`),
 * así que aquí no hay nada de estilo.
 *
 * Destinos y secciones vienen de `@pockai/ui` (`nav.ts`), igual que en el escritorio: aquí solo se
 * ponen las etiquetas e iconos del móvil y qué va en la barra.
 *
 * Regla: **una opción solo existe si hoy tiene dos valores distintos.** Lo que todavía no existe en
 * ninguna de las dos apps (pagos con Play Billing o StoreKit, inicio de sesión social, push) no se
 * declara hasta que haya backend y haya que distinguirlas; cuando llegue, entra aquí y no en una
 * copia del shell.
 */
import type { Bus } from '@pockai/audio';
import type { Platform } from '@pockai/ui';
import type { MobileBarDest, NavDest, NavSub } from '@pockai/ui';

export type MobilePlatform = Extract<Platform, 'android' | 'ios'>;

/** Destino de la barra inferior. Tienda y Ajustes no están aquí: van en la cabecera. */
export type TabId = MobileBarDest;

export interface MobileTab {
  id: TabId;
  label: string;
  icon: string;
}

/** Sección dentro de un destino (el `Segmented` de arriba). `value` es una clave real de `nav.ts`. */
export interface MobileSection<S extends string = string> {
  value: S;
  label: string;
  icon: string;
}

/**
 * Las secciones de cada destino. Tipado contra `NavSub`: una clave que no exista en `nav.ts` no
 * compila. Un destino sin secciones (Chat, Ajustes) lleva `[]`.
 */
export type MobileSections = { [D in NavDest]: MobileSection<NavSub<D>>[] };

export interface MobileConfig {
  /** La plataforma de esta app: fija `data-platform` y los ajustes de sonido por defecto. */
  platform: MobilePlatform;
  /** Lo que se le dice a quien abre esta UI en un navegador, sin núcleo. */
  noCoreText: string;
  /** La barra de pestañas y sus iconos. */
  tabs: MobileTab[];
  /** Las secciones de cada destino. Una sección que no esté aquí no se pinta ni se puede alcanzar. */
  sections: MobileSections;
  /** Qué tipos de sonido se ofrecen en Ajustes y con qué muestra. */
  audio: { buses: Bus[]; previews: Partial<Record<Bus, string>> };
  /** Si se pide el permiso de avisos al entrar (una vez). */
  askNotifications: boolean;
}

/** La barra inferior, en orden. Chat va en el centro. */
export const DEFAULT_TABS: MobileTab[] = [
  { id: 'pet', label: 'Mascota', icon: 'ui:pet' },
  { id: 'play', label: 'Jugar', icon: 'ui:play' },
  { id: 'chat', label: 'Chat', icon: 'ui:chat' },
  { id: 'social', label: 'Social', icon: 'ui:social' },
  { id: 'progress', label: 'Progreso', icon: 'ui:progress' },
];

export const DEFAULT_SECTIONS: MobileSections = {
  pet: [
    { value: 'home', label: 'Inicio', icon: 'ui:home' },
    { value: 'backpack', label: 'Mochila', icon: 'ui:backpack' },
    { value: 'hatch', label: 'Huevos', icon: 'ui:hatch' },
    { value: 'bonding', label: 'Vínculo', icon: 'ui:bonding' },
    { value: 'mind', label: 'Mente', icon: 'ui:mind' },
    { value: 'habitat', label: 'Hábitat', icon: 'ui:habitat' },
    { value: 'wardrobe', label: 'Armario', icon: 'ui:wardrobe' },
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
  chat: [],
  social: [
    { value: 'profile', label: 'Perfil', icon: 'ui:profile' },
    { value: 'friends', label: 'Amigos', icon: 'ui:friends' },
    { value: 'clans', label: 'Clanes', icon: 'ui:clans' },
    { value: 'visits', label: 'Visitas', icon: 'ui:visits' },
  ],
  progress: [
    { value: 'missions', label: 'Misiones', icon: 'ui:missions' },
    { value: 'seasons', label: 'Temporada', icon: 'ui:seasons' },
  ],
  // La tienda y sus cofres: se abren desde la cabecera, con su propio `Segmented`.
  shop: [
    { value: 'store', label: 'Tienda', icon: 'ui:store' },
    { value: 'chests', label: 'Cofres', icon: 'ui:chests' },
  ],
  // Ajustes es una sola pantalla con sus tarjetas (cuenta, apariencia, sonido): sin `Segmented`.
  settings: [],
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
