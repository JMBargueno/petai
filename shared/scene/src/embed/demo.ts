/**
 * Panel de depuración del bundle embed: simula a la app nativa enviando mensajes del protocolo y
 * muestra los eventos que devuelve la escena.
 *  - `index.html?demo`       → solo el Pockai.
 *  - `index.html?demo=room`  → la sala isométrica con muebles de ejemplo (edición incluida).
 */
import { PATTERNS } from '../assets';
import type { RoomState } from '../protocol';
import { DEMO_ROOMS, demoRoom } from './demoRoom';

const PALETTES: Record<string, { primary: string; secondary: string }> = {
  ignisaur: { primary: '#E25822', secondary: '#F3C544' },
  axolunar: { primary: '#38A3A5', secondary: '#80ED99' },
  florabud: { primary: '#57CC99', secondary: '#C7F9CC' },
};
const CLIPS = ['idle', 'walk', 'happy', 'eat', 'sleep', 'attack', 'sad', 'dance', 'level_up'];

export function mountDemo(send: (raw: unknown) => void, withRoom: boolean): void {
  const panel = document.createElement('form');
  panel.className = 'demo';
  panel.innerHTML = `
    <label>Especie <select name="species">${Object.keys(PALETTES).map((s) => `<option>${s}</option>`).join('')}<option>desconocida</option></select></label>
    <label>Etapa <select name="stage"><option>baby</option><option>juvenile</option><option selected>adult</option><option>final</option><option>egg</option></select></label>
    <label>Patrón <select name="pattern"><option value="">—</option>${Object.keys(PATTERNS).map((p) => `<option>${p}</option>`).join('')}</select></label>
    <label>Semilla <input name="seed" type="number" value="1337"></label>
    ${
      withRoom
        ? `<label>Sala <select name="room">${DEMO_ROOMS.map((r) => `<option>${r}</option>`).join('')}</select></label>
    <div class="row">
      <button type="button" data-act="idle">pasear</button><button type="button" data-act="sleep">dormir</button><button type="button" data-act="away">fuera</button>
      <button type="button" data-night>noche</button>
    </div>
    <div class="row"><button type="button" data-edit>editar</button><button type="button" data-rotate>girar (R)</button></div>`
        : `<div class="row">${CLIPS.map((c) => `<button type="button" data-clip="${c}">${c}</button>`).join('')}</div>
    <div class="row"><button type="button" data-facing="1">→</button><button type="button" data-facing="-1">←</button></div>`
    }
    <div class="row"><button type="button" data-pause>pausa</button></div>
    <ol class="log" aria-live="polite"></ol>`;
  document.body.appendChild(panel);
  const log = panel.querySelector('.log')!;
  const field = (n: string) => (panel.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '';

  let room: RoomState | null = null;
  const sendRoom = () => {
    room = demoRoom(field('room'));
    send({ type: 'setRoom', room });
  };

  const setPet = () => {
    const species = field('species');
    send({
      type: 'setPet',
      pet: {
        species,
        stage: field('stage'),
        palette: PALETTES[species] ?? PALETTES.ignisaur,
        pattern: field('pattern') || null,
        visualSeed: Number(field('seed')) || 1,
      },
    });
  };
  panel.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).getAttribute('name') === 'room') sendRoom();
    else setPet();
  });

  let paused = false;
  let night = false;
  let edit = false;
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.clip) send({ type: 'playClip', clip: b.dataset.clip, once: !['idle', 'sleep', 'walk'].includes(b.dataset.clip) });
    if (b.dataset.facing) send({ type: 'setFacing', facing: Number(b.dataset.facing) });
    if (b.dataset.act) send({ type: 'setActivity', activity: b.dataset.act });
    if (b.hasAttribute('data-night')) send({ type: 'setNight', night: (night = !night) });
    if (b.hasAttribute('data-edit')) {
      send({ type: 'setEditMode', edit: (edit = !edit) });
      b.textContent = edit ? 'terminar' : 'editar';
    }
    if (b.hasAttribute('data-rotate')) send({ type: 'rotateSelected' });
    if (b.hasAttribute('data-pause')) send({ type: 'setPaused', paused: (paused = !paused) });
  });

  window.addEventListener('pockai:event', (e) => {
    const ev = (e as CustomEvent).detail;
    // Hace de "servidor": acepta el movimiento y lo guarda en su copia de la sala.
    if (ev.type === 'furnitureMoved' && room) {
      room = { ...room, items: room.items.map((i) => (i.id === ev.itemId ? { ...i, x: ev.x, y: ev.y, rotation: ev.rotation } : i)) };
    }
    const li = document.createElement('li');
    li.textContent = JSON.stringify(ev);
    log.prepend(li);
    while (log.children.length > 8) log.lastChild!.remove();
  });

  setPet();
  if (withRoom) sendRoom();
}
