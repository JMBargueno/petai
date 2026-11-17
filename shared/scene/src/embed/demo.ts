/**
 * Panel de depuración del bundle embed (`index.html?demo`): simula a la app nativa enviando
 * mensajes del protocolo y muestra los eventos que devuelve la escena.
 */
import { PATTERNS } from '../assets';

const PALETTES: Record<string, { primary: string; secondary: string }> = {
  ignisaur: { primary: '#E25822', secondary: '#F3C544' },
  axolunar: { primary: '#38A3A5', secondary: '#80ED99' },
  florabud: { primary: '#57CC99', secondary: '#C7F9CC' },
};
const CLIPS = ['idle', 'walk', 'happy', 'eat', 'sleep', 'attack', 'sad', 'dance', 'level_up'];

export function mountDemo(send: (raw: unknown) => void): void {
  const panel = document.createElement('form');
  panel.className = 'demo';
  panel.innerHTML = `
    <label>Especie <select name="species">${Object.keys(PALETTES).map((s) => `<option>${s}</option>`).join('')}<option>desconocida</option></select></label>
    <label>Etapa <select name="stage"><option>baby</option><option>juvenile</option><option selected>adult</option><option>final</option><option>egg</option></select></label>
    <label>Patrón <select name="pattern"><option value="">—</option>${Object.keys(PATTERNS).map((p) => `<option>${p}</option>`).join('')}</select></label>
    <label>Semilla <input name="seed" type="number" value="1337"></label>
    <div class="row">${CLIPS.map((c) => `<button type="button" data-clip="${c}">${c}</button>`).join('')}</div>
    <div class="row"><button type="button" data-facing="1">→</button><button type="button" data-facing="-1">←</button><button type="button" data-pause>pausa</button></div>
    <ol class="log" aria-live="polite"></ol>`;
  document.body.appendChild(panel);
  const log = panel.querySelector('.log')!;
  const field = (n: string) => (panel.elements.namedItem(n) as HTMLInputElement).value;

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
  panel.addEventListener('change', setPet);
  let paused = false;
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.clip) send({ type: 'playClip', clip: b.dataset.clip, once: b.dataset.clip !== 'idle' && b.dataset.clip !== 'sleep' && b.dataset.clip !== 'walk' });
    if (b.dataset.facing) send({ type: 'setFacing', facing: Number(b.dataset.facing) });
    if (b.hasAttribute('data-pause')) send({ type: 'setPaused', paused: (paused = !paused) });
  });
  window.addEventListener('pockai:event', (e) => {
    const li = document.createElement('li');
    li.textContent = JSON.stringify((e as CustomEvent).detail);
    log.prepend(li);
    while (log.children.length > 8) log.lastChild!.remove();
  });
  setPet();
}
