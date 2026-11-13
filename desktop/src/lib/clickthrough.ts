// Click-through inteligente: informa al proceso nativo (Tauri) de las zonas
// interactivas. Fuera de ellas, la ventana deja pasar los clics al escritorio.
// En el navegador (sin Tauri) no hace nada.

const INTERACTIVE_SELECTOR = '.pet-container, .toggle-panel-pill, .panel-card';
const REFRESH_MS = 50;

type Rect = { x: number; y: number; w: number; h: number };

function collectRects(): Rect[] {
  const rects: Rect[] = [];
  document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR).forEach((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
  });
  return rects;
}

export function startClickThrough(): () => void {
  if (!('__TAURI_INTERNALS__' in window)) return () => {};

  let stopped = false;
  let last = '';

  import('@tauri-apps/api/core').then(({ invoke }) => {
    const timer = setInterval(() => {
      if (stopped) return clearInterval(timer);
      const rects = collectRects();
      const key = JSON.stringify(rects);
      if (key === last) return;
      last = key;
      invoke('set_hit_regions', { rects }).catch((err) =>
        console.warn('[click-through] set_hit_regions falló:', err),
      );
    }, REFRESH_MS);
  });

  return () => {
    stopped = true;
  };
}
