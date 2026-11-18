// Arrastre para sacar al Pockai de su Hábitat (panel → escritorio).
//
// No usa drag-and-drop HTML5: fuera del panel la ventana transparente es click-through
// (ver clickthrough.ts) y en Windows Tauri intercepta el drop nativo, así que el evento
// `drop` nunca llegaba. Igual que el arrastre de la mascota (PetView), se usan eventos de
// ratón y `body.dataset.dragging` para que la ventana capture todo el viewport mientras dura.

/** Evento global que App escucha para sacar a la mascota en la posición soltada. */
export const EXIT_HABITAT_EVENT = 'petai:exit_habitat';
export type ExitHabitatDetail = { x: number; y: number };

const DRAG_THRESHOLD_PX = 6;

function isOverPanel(x: number, y: number): boolean {
  if (!document.elementsFromPoint) return false;
  return document.elementsFromPoint(x, y).some((el) => !!el.closest('.panel-card'));
}

/** Copia visual del avatar (los <canvas> clonados salen vacíos: se repinta su contenido). */
function buildGhost(source: HTMLElement): HTMLElement {
  const r = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  const srcCanvases = source.querySelectorAll('canvas');
  ghost.querySelectorAll('canvas').forEach((c, i) => {
    const src = srcCanvases[i];
    if (src) c.getContext('2d')?.drawImage(src, 0, 0);
  });
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '99999',
    opacity: '0.9',
    filter: 'drop-shadow(0 6px 10px rgb(0 0 0 / 0.35))',
  });
  return ghost;
}

/**
 * Inicia (en mousedown) el arrastre de salida. Solo cuenta como arrastre al superar un
 * pequeño umbral; si se suelta fuera del panel emite EXIT_HABITAT_EVENT con el punto.
 * `ghostSource` es el elemento que se dibuja siguiendo al cursor.
 */
export function startHabitatExitDrag(e: MouseEvent, ghostSource: HTMLElement | null) {
  if (e.button !== 0) return;
  e.preventDefault(); // evita selección de texto / drag nativo
  const startX = e.clientX;
  const startY = e.clientY;
  let ghost: HTMLElement | null = null;
  let half = { w: 0, h: 0 };

  // Desde ya: que el click-through no suelte el ratón al salir del panel
  document.body.dataset.dragging = '1';

  const place = (x: number, y: number) => {
    if (!ghost) return;
    const outside = !isOverPanel(x, y);
    ghost.style.transform = `translate(${x - half.w}px, ${y - half.h}px) scale(${outside ? 1.1 : 0.9})`;
  };

  const onMove = (ev: MouseEvent) => {
    // mouseup perdido (p. ej. soltado fuera de la ventana): no dejar la captura pegada
    if (ev.buttons === 0) return onUp(ev);
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      if (ghostSource) {
        ghost = buildGhost(ghostSource);
        const r = ghostSource.getBoundingClientRect();
        half = { w: r.width / 2, h: r.height / 2 };
        document.body.appendChild(ghost);
      }
      document.body.style.cursor = 'grabbing';
    }
    place(ev.clientX, ev.clientY);
  };

  const onUp = (ev: MouseEvent) => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    delete document.body.dataset.dragging;
    document.body.style.cursor = '';
    const dragged = !!ghost || Math.hypot(ev.clientX - startX, ev.clientY - startY) >= DRAG_THRESHOLD_PX;
    ghost?.remove();
    if (!dragged || isOverPanel(ev.clientX, ev.clientY)) return;
    window.dispatchEvent(
      new CustomEvent<ExitHabitatDetail>(EXIT_HABITAT_EVENT, { detail: { x: ev.clientX, y: ev.clientY } }),
    );
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
