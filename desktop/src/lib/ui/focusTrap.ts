/**
 * Acción de Svelte para diálogos: al montarse guarda el foco anterior, lo lleva al diálogo,
 * lo mantiene dentro con Tab / Mayús+Tab y lo devuelve al cerrarse.
 * Uso: `<div role="dialog" tabindex="-1" use:focusTrap>`.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function focusTrap(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement | null;

  // Foco inicial: el elemento marcado con `data-autofocus`, o el propio diálogo.
  const initial =
    node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>('[data-autofocus-wrap] button') ?? node;
  queueMicrotask(() => initial.focus({ preventScroll: true }));

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusables(node);
    if (items.length === 0) {
      e.preventDefault();
      node.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!node.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    },
  };
}
