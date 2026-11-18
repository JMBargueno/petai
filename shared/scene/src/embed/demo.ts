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
  livolt: { primary: '#FFD166', secondary: '#FFEBB3' },
  inktopus: { primary: '#4A4E69', secondary: '#9A8C98' },
  solarejo: { primary: '#F4F1DE', secondary: '#E07A5F' },
  magmadillo: { primary: '#C2452D', secondary: '#FFB627' },
  nubeballena: { primary: '#4F86C6', secondary: '#E8F1FA' },
  cactuerno: { primary: '#4FAF7A', secondary: '#F7B2C4' },
  fenixel: { primary: '#E8483A', secondary: '#FFD166' },
  cerbito: { primary: '#6A5C9E', secondary: '#D7C7F0' },
  kirisol: { primary: '#FFF4D6', secondary: '#F4A259' },
  leviatin: { primary: '#3D4FA8', secondary: '#9FE8E0' },
  yggdrito: { primary: '#6FAE3A', secondary: '#C9A06B' },
  primpulso: { primary: '#F2C230', secondary: '#7DF9FF' },
};
/** Prendas de ejemplo por ranura (ids de shared/game-data/accessories.json). */
const DEMO_ACCESSORIES: Record<string, string[]> = {
  head: ['acc_gorro_lana_azul', 'acc_gorro_fiesta', 'ach_item_care_crown'],
  face: ['acc_gafas_estudio'],
  neck: ['acc_bufanda_menta', 'ach_item_care_blanket'],
  back: ['acc_capa_gala', 'acc_alas_nube', 'ach_item_battle_legend'],
};
/** Climas de ejemplo (código WMO de Open-Meteo). */
const WEATHERS: [string, number][] = [
  ['despejado', 0],
  ['poco nuboso', 2],
  ['cubierto', 3],
  ['niebla', 45],
  ['llovizna', 51],
  ['lluvia', 63],
  ['lluvia fuerte', 65],
  ['nieve', 73],
  ['tormenta', 95],
];
const CLIPS = ['idle', 'walk', 'happy', 'eat', 'sleep', 'attack', 'sad', 'dance', 'level_up'];

export function mountDemo(send: (raw: unknown) => void, withRoom: boolean): void {
  const panel = document.createElement('form');
  panel.className = 'demo';
  panel.innerHTML = `
    <label>Especie <select name="species">${Object.keys(PALETTES).map((s) => `<option>${s}</option>`).join('')}<option>desconocida</option></select></label>
    <label>Etapa <select name="stage"><option>baby</option><option>juvenile</option><option selected>adult</option><option>final</option><option>egg</option></select></label>
    <label>Patrón <select name="pattern"><option value="">—</option>${Object.keys(PATTERNS).map((p) => `<option>${p}</option>`).join('')}</select></label>
    <label>Semilla <input name="seed" type="number" value="1337"></label>
    ${Object.entries(DEMO_ACCESSORIES).map(([slot, ids]) => `<label>${slot} <select name="acc_${slot}"><option value="">—</option>${ids.map((i) => `<option>${i}</option>`).join('')}</select></label>`).join('')}
    ${
      withRoom
        ? `<label>Sala <select name="room">${DEMO_ROOMS.map((r) => `<option>${r}</option>`).join('')}</select></label>
    <div class="row">
      <button type="button" data-act="idle">pasear</button><button type="button" data-act="sleep">dormir</button><button type="button" data-act="away">fuera</button>
      <button type="button" data-night>luces</button>
    </div>
    <label>Hora <input name="clock" type="range" min="0" max="1439" step="5" value="720"> <output name="clockOut">reloj</output></label>
    <label>Clima <select name="weather">${WEATHERS.map(([label, code]) => `<option value="${code}">${label}</option>`).join('')}</select></label>
    <label>Temp °C <input name="temp" type="number" value="18"></label>
    <div class="row"><button type="button" data-realclock>hora real</button></div>
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
        accessories: Object.fromEntries(Object.keys(DEMO_ACCESSORIES).map((slot) => [slot, field(`acc_${slot}`)]).filter(([, id]) => id)),
      },
    });
  };
  /** Hora forzada (`null` = reloj del dispositivo) y clima elegidos en el panel. */
  let clock: number | null = null;
  const sendAmbience = () => {
    const out = panel.elements.namedItem('clockOut') as HTMLOutputElement | null;
    if (out) out.value = clock === null ? 'reloj' : `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
    send({
      type: 'setAmbience',
      clock,
      weather: { code: Number(field('weather')), temperature: Number(field('temp')) },
    });
  };
  panel.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).getAttribute('name') !== 'clock') return;
    clock = Number(field('clock'));
    sendAmbience();
  });
  panel.addEventListener('change', (e) => {
    const name = (e.target as HTMLElement).getAttribute('name');
    if (name === 'room') sendRoom();
    else if (name === 'weather' || name === 'temp') sendAmbience();
    else if (name !== 'clock') setPet();
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
    if (b.hasAttribute('data-realclock')) {
      clock = null;
      sendAmbience();
    }
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
