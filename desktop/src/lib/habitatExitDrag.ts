// Arrastre del Pockai desde su Hábitat: dentro de la sala lo lleva en la mano (sigue al cursor y
// aterriza donde se suelte); fuera del panel lo saca al escritorio.
//
// No usa drag-and-drop HTML5: fuera del panel la ventana transparente es click-through
// (ver clickthrough.ts) y en Windows Tauri intercepta el drop nativo, así que el evento
// `drop` nunca llegaba. Igual que el arrastre de la mascota (PetView), se usan eventos de
// ratón y `body.dataset.dragging` para que la ventana capture todo el viewport mientras dura.

/** Evento global que App escucha para sacar a la mascota en la posición soltada. */
export const EXIT_HABITAT_EVENT = 'petai:exit_habitat';
export type ExitHabitatDetail = { x: number; y: number };

const DRAG_THRESHOLD_PX = 6;
/** Si la salida al escritorio falla, el Pockai vuelve a verse en la sala pasado este tiempo. */
const UNHIDE_AFTER_EXIT_MS = 1500;

/**
 * La sala donde está el Pockai (IsoRoomView sobre `PockaiScene`), para llevarlo en la mano dentro
 * de ella en vez de con el «fantasma». Coordenadas siempre de la ventana.
 */
export interface RoomPetDrag {
  /** ¿El punto cae sobre la sala? */
  contains(x: number, y: number): boolean;
  /** Lo levanta (clip de agarre). `false` si no se puede (decorando, fuera…). */
  grab(x: number, y: number): boolean;
  move(x: number, y: number): void;
  /** Lo suelta en la sala: aterriza en la celda libre más cercana. */
  release(x: number, y: number): void;
  /** Lo devuelve a donde estaba. */
  cancel(): void;
  /** Lo oculta en la sala mientras el fantasma lo lleva por fuera. */
  setHidden(hidden: boolean): void;
}

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
 * Inicia (en mousedown) el arrastre. Solo cuenta como arrastre al superar un pequeño umbral.
 * Con `room`, mientras el cursor está sobre la sala el Pockai va en la mano dentro de ella; al
 * salir de la sala se dibuja el «fantasma» (`ghostSource`) siguiendo al cursor. Si se suelta
 * fuera del panel emite EXIT_HABITAT_EVENT con el punto.
 */
export function startHabitatExitDrag(e: MouseEvent, ghostSource: HTMLElement | null, room: RoomPetDrag | null = null) {
  if (e.button !== 0) return;
  e.preventDefault(); // evita selección de texto / drag nativo
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let held = false; // lo lleva la sala en la mano
  let ghost: HTMLElement | null = null;
  let half = { w: 0, h: 0 };

  // Desde ya: que el click-through no suelte el ratón al salir del panel
  document.body.dataset.dragging = '1';

  const showGhost = (x: number, y: number) => {
    if (!ghost && ghostSource) {
      ghost = buildGhost(ghostSource);
      const r = ghostSource.getBoundingClientRect();
      half = { w: r.width / 2, h: r.height / 2 };
      document.body.appendChild(ghost);
    }
    if (!ghost) return;
    ghost.style.display = '';
    const outside = !isOverPanel(x, y);
    ghost.style.transform = `translate(${x - half.w}px, ${y - half.h}px) scale(${outside ? 1.1 : 0.9})`;
  };
  const hideGhost = () => {
    if (ghost) ghost.style.display = 'none';
  };

  const onMove = (ev: MouseEvent) => {
    // mouseup perdido (p. ej. soltado fuera de la ventana): no dejar la captura pegada
    if (ev.buttons === 0) return onUp(ev);
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      held = !!room?.grab(startX, startY);
      document.body.style.cursor = 'grabbing';
    }
    if (held && room!.contains(ev.clientX, ev.clientY)) {
      room!.setHidden(false);
      room!.move(ev.clientX, ev.clientY);
      hideGhost();
    } else {
      if (held) room!.setHidden(true);
      showGhost(ev.clientX, ev.clientY);
    }
  };

  const onUp = (ev: MouseEvent) => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    delete document.body.dataset.dragging;
    document.body.style.cursor = '';
    const dragged = dragging || Math.hypot(ev.clientX - startX, ev.clientY - startY) >= DRAG_THRESHOLD_PX;
    ghost?.remove();
    const x = ev.clientX;
    const y = ev.clientY;
    if (held && room!.contains(x, y)) return room!.release(x, y);
    const exits = dragged && !isOverPanel(x, y);
    if (held) {
      room!.cancel();
      if (exits) {
        // Que no se vea volver a la sala mientras sale al escritorio
        room!.setHidden(true);
        setTimeout(() => room!.setHidden(false), UNHIDE_AFTER_EXIT_MS);
      }
    }
    if (!exits) return;
    window.dispatchEvent(new CustomEvent<ExitHabitatDetail>(EXIT_HABITAT_EVENT, { detail: { x, y } }));
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
