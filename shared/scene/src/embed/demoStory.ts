/**
 * Demo de la escena de la aventura diaria: `index.html?demo=story`. Hace de anfitrión: recorre las
 * localizaciones como una historia (entrar → evento → responder → reaccionar → salir) con el mismo
 * protocolo que usan el escritorio y Android.
 *  - `&loc=<id>`     empieza en esa localización.
 *  - `&phase=await`  la primera escena llega ya en esa fase (simula una recarga).
 *  - `&auto=1`       responde solo, para verla de corrido.
 */
import { LOCATION_IDS, locationComposition } from '../backdrop/model';
import { STORY_TIMES, STORY_WEATHER, type StoryPhase, type StoryState } from '../protocol';

const FX = ['', 'portal-nexo', 'resonancia', 'hebra-invocacion', 'glitch-animo', 'polvo-estatico', 'destello-prisma'];

export function mountStoryDemo(send: (raw: unknown) => void): void {
  const params = new URLSearchParams(location.search);
  const auto = params.get('auto') === '1';
  let index = Math.max(0, LOCATION_IDS.indexOf(params.get('loc') ?? ''));
  let scene = 0;
  let story: StoryState;

  const panel = document.createElement('div');
  panel.className = 'demo';
  panel.innerHTML = `
    <strong>Aventura diaria · escena</strong>
    <div class="row">
      <select name="loc" aria-label="Localización">${LOCATION_IDS.map((id) => `<option value="${id}">${locationComposition(id)?.name ?? id}</option>`).join('')}</select>
      <select name="time" aria-label="Hora"><option value="">hora real</option>${STORY_TIMES.map((t) => `<option>${t}</option>`).join('')}</select>
      <select name="weather" aria-label="Clima"><option value="">clima real</option>${STORY_WEATHER.map((t) => `<option>${t}</option>`).join('')}</select>
      <select name="fx" aria-label="Efecto del evento">${FX.map((f) => `<option value="${f}">${f || 'sin efecto'}</option>`).join('')}</select>
    </div>
    <div class="row" data-choices hidden>
      <button data-clip="happy">Respuesta buena</button>
      <button data-clip="sad">Respuesta mala</button>
    </div>
    <div class="row"><span data-status>…</span></div>
    <ul class="log" aria-label="Eventos de la escena"></ul>`;
  document.body.appendChild(panel);
  const q = <T extends HTMLElement>(sel: string) => panel.querySelector(sel) as T;
  const loc = q<HTMLSelectElement>('[name=loc]');
  const choices = q<HTMLDivElement>('[data-choices]');
  const status = q<HTMLSpanElement>('[data-status]');
  const log = q<HTMLUListElement>('.log');

  const push = (patch: Partial<StoryState>) => {
    story = { ...story, ...patch };
    send({ type: 'setStory', story });
    status.textContent = `${story.locationId} · ${story.phase}`;
  };

  const begin = (phase: StoryPhase = 'enter') => {
    const time = q<HTMLSelectElement>('[name=time]').value;
    const weather = q<HTMLSelectElement>('[name=weather]').value;
    const fx = q<HTMLSelectElement>('[name=fx]').value;
    loc.value = LOCATION_IDS[index];
    choices.hidden = phase !== 'await';
    story = { key: `demo:${++scene}`, locationId: LOCATION_IDS[index], phase };
    if (time || weather) story.mood = { ...(time ? { timeOfDay: time as never } : {}), ...(weather ? { weather: weather as never } : {}) };
    if (fx) story.fx = fx;
    push({});
  };

  const answer = (clip: string) => {
    choices.hidden = true;
    push({ phase: 'react', clip });
  };

  loc.addEventListener('change', () => {
    index = LOCATION_IDS.indexOf(loc.value);
    begin();
  });
  for (const name of ['time', 'weather', 'fx']) q<HTMLSelectElement>(`[name=${name}]`).addEventListener('change', () => begin());
  choices.addEventListener('click', (e) => {
    const clip = (e.target as HTMLElement).closest('button')?.dataset.clip;
    if (clip) answer(clip);
  });

  window.addEventListener('pockai:event', (e) => {
    const ev = (e as CustomEvent).detail;
    const li = document.createElement('li');
    li.textContent = JSON.stringify(ev);
    log.prepend(li);
    while (log.children.length > 8) log.lastChild!.remove();
    if (ev.type !== 'storyBeat' || ev.key !== story.key) return;
    if (ev.beat === 'arrived') {
      push({ phase: 'await' });
      choices.hidden = false;
      if (auto) setTimeout(() => answer(scene % 2 ? 'happy' : 'sad'), 900);
    } else if (ev.beat === 'reacted') push({ phase: 'exit' });
    else if (ev.beat === 'exited') {
      index = (index + 1) % LOCATION_IDS.length;
      begin();
    }
  });

  send({ type: 'setPet', pet: { species: 'ignisaur', stage: 'adult', palette: { primary: '#E25822', secondary: '#F3C544' }, pattern: null, visualSeed: 1337 } });
  const first = params.get('phase');
  begin(first === 'await' || first === 'react' || first === 'exit' ? first : 'enter');
}
