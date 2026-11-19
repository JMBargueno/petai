/**
 * Sonidos de interfaz del escritorio (spec 40, F1) con un solo oyente de clics en el documento, en
 * vez de tocar cada botón. Decide el sonido por el elemento pulsado:
 *
 *   - `data-sound="<id>"` en el elemento o un antepasado: ese sonido; `data-sound="none"`: ninguno.
 *   - interruptor (`role="switch"`): `ui.toggle_on` / `ui.toggle_off` según cómo queda;
 *   - pestaña (`role="tab"` o la barra `.nav-tabs`): `ui.tab`;
 *   - botón fantasma o de solo icono: `ui.tap_soft`; cualquier otro botón: `ui.tap`.
 *
 * Los botones deshabilitados no suenan. Los sonidos con significado propio (comprar, error, aviso)
 * los dispara su código con `sfx()`; para que el clic no se sume, ese botón lleva `data-sound`.
 */
import { sfx } from './audio';

const CLICKABLE = 'button, [role="button"], [role="tab"], [role="switch"], a[href], summary';

/** Lo que se usa de un `Element` (un fake en los tests). */
export interface UiSoundTarget {
  closest(selectors: string): UiSoundTarget | null;
  getAttribute(name: string): string | null;
  matches(selectors: string): boolean;
}

/** Sonido de un clic sobre `el` (o `null`). `checkedAfter` = estado del interruptor tras el clic. */
export function soundForClick(el: UiSoundTarget | null, checkedAfter?: boolean): string | null {
  if (!el) return null;
  const tagged = el.closest('[data-sound]');
  if (tagged) {
    const id = tagged.getAttribute('data-sound');
    return !id || id === 'none' ? null : id;
  }
  const target = el.closest(CLICKABLE);
  if (!target) return null;
  if (target.matches(':disabled, [aria-disabled="true"]')) return null;
  if (target.matches('[role="switch"]')) return checkedAfter ? 'ui.toggle_on' : 'ui.toggle_off';
  if (target.matches('[role="tab"]') || target.closest('.nav-tabs')) return 'ui.tab';
  if (target.matches('.btn--ghost, .btn--icon, .ui-ibtn')) return 'ui.tap_soft';
  return 'ui.tap';
}

let installed = false;

/** Engancha el oyente una sola vez (App.svelte al montar). */
export function installUiSounds(root: Document = document): () => void {
  if (installed) return () => {};
  installed = true;
  const onClick = (e: Event) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    const sw = el.closest('[role="switch"]');
    if (sw) {
      // El interruptor cambia aria-checked al procesar el clic: se lee justo después.
      setTimeout(() => {
        const id = soundForClick(el, sw.getAttribute('aria-checked') === 'true');
        if (id) sfx(id);
      }, 0);
      return;
    }
    const id = soundForClick(el);
    if (id) sfx(id);
  };
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('click', onClick, true);
    installed = false;
  };
}
