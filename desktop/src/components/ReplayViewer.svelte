<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getPetSvg } from '../lib/sprites';
  import { buildFrames, type Frame, type ReplayLog } from '../lib/replay';

  export let log: ReplayLog;
  /** id de habilidad → nombre */
  export let skillNames: Record<string, string> = {};
  export let autoplay = true;

  const ELEMENT_ICON: Record<string, string> = { fire: '🔥', water: '💧', plant: '🌿', electric: '⚡', shadow: '🌑', light: '✨' };
  const STEP_MS = 1100;

  let frames: Frame[] = [];
  let index = 0;
  let playing = false;
  let speed: 1 | 2 | 4 = 1;
  let timer: any = null;
  let lastLog: ReplayLog | null = null;

  // Recalcula los fotogramas cuando cambia la repetición
  $: if (log && log !== lastLog) {
    lastLog = log;
    frames = buildFrames(log, (id) => skillNames[id] ?? id);
    index = 0;
    stop();
    if (autoplay) play();
  }

  $: frame = frames[index];
  $: [p0, p1] = log.participants;
  $: hp = frame?.hp ?? [p0.maxHp, p1.maxHp];
  $: atFlash = frame?.kind === 'hit' ? frame.target : frame?.kind === 'dot' ? frame.target : null;
  $: lunge = frame && (frame.kind === 'hit' || frame.kind === 'miss') ? frame.actor : null;
  $: fainted = frame?.kind === 'faint' || frame?.kind === 'end'
    ? [hp[0] <= 0, hp[1] <= 0]
    : [hp[0] <= 0 && index > 0, hp[1] <= 0 && index > 0];

  function tick() {
    if (index >= frames.length - 1) return stop();
    index += 1;
  }

  function play() {
    if (frames.length === 0) return;
    if (index >= frames.length - 1) index = 0;
    stop();
    playing = true;
    timer = setInterval(tick, STEP_MS / speed);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playing = false;
  }

  function toggle() {
    playing ? stop() : play();
  }

  function setSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    if (playing) play();
  }

  function toEnd() {
    stop();
    index = frames.length - 1;
  }

  function restart() {
    stop();
    index = 0;
    play();
  }

  const pct = (cur: number, max: number) => Math.max(0, Math.min(100, (cur / max) * 100));
  const barColor = (p: number) => (p > 50 ? '#22c55e' : p > 25 ? '#f59e0b' : '#ef4444');

  onDestroy(stop);
</script>

{#if frame}
  <div class="viewer">
    <div class="arena">
      {#each [p0, p1] as p, i}
        <div class="side side{i}" class:fainted={fainted[i]}>
          <div class="info">
            <span class="name">{ELEMENT_ICON[p.element] ?? ''} {p.name}</span>
            <small>Nv. {p.level}{p.isBot ? ' · bot' : ''}</small>
          </div>
          <div class="bar" title="{hp[i]} / {p.maxHp}">
            <div class="fill" style="width:{pct(hp[i], p.maxHp)}%; background:{barColor(pct(hp[i], p.maxHp))}"></div>
          </div>
          <div class="hptext">{hp[i]} / {p.maxHp}</div>
          <div
            class="sprite"
            class:flash={atFlash === i}
            class:lunge={lunge === i}
            style="--dir: {i === 0 ? 1 : -1}; transform: scaleX({i === 0 ? 1 : -1});"
          >
            {@html getPetSvg(p.speciesId, fainted[i] ? 'sleep' : 'idle')}
            {#if atFlash === i && frame.damage}
              {#key index}<span class="float" class:crit={frame.crit}>−{frame.damage}</span>{/key}
            {/if}
            {#if frame.kind === 'heal' && frame.actor === i}
              {#key index}<span class="float heal">+{frame.damage}</span>{/key}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="log" class:end={frame.kind === 'end'}>
      {#key index}<span>{frame.text}</span>{/key}
    </div>

    <div class="controls">
      <button on:click={restart} title="Reiniciar">↺</button>
      <button class="main" on:click={toggle} title={playing ? 'Pausa' : 'Reproducir'}>{playing ? '⏸' : '▶'}</button>
      <button on:click={toEnd} title="Ir al final">⏭</button>
      <button on:click={setSpeed} title="Velocidad">×{speed}</button>
      <span class="round">{frame.round > 0 ? `Ronda ${frame.round}` : 'Inicio'} · {index + 1}/{frames.length}</span>
    </div>
  </div>
{/if}

<style>
  .viewer { display: flex; flex-direction: column; gap: 8px; }
  .arena {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px 8px 4px;
    border-radius: 12px; background: linear-gradient(180deg, rgba(56, 189, 248, 0.08), rgba(15, 23, 42, 0.6));
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .side { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
  .info { display: flex; flex-direction: column; align-items: center; font-size: 12px; max-width: 100%; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
  .info small { opacity: 0.65; font-size: 10px; }
  .bar { width: 100%; height: 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
  .fill { height: 100%; transition: width 0.5s ease, background 0.3s; }
  .hptext { font-size: 10px; opacity: 0.7; }
  .sprite {
    position: relative; width: 96px; height: 96px; margin-top: 2px;
    transition: transform 0.25s ease, filter 0.2s;
  }
  .sprite :global(svg) { width: 100%; height: 100%; }
  .sprite.lunge { animation: lunge 0.5s ease; }
  .sprite.flash { animation: shake 0.4s ease; filter: brightness(1.8) saturate(1.4); }
  .fainted .sprite { opacity: 0.45; filter: grayscale(1); }
  @keyframes lunge {
    0% { translate: 0 0; } 40% { translate: calc(var(--dir) * 22px) 0; } 100% { translate: 0 0; }
  }
  @keyframes shake {
    0%, 100% { translate: 0 0; } 20% { translate: -6px 0; } 40% { translate: 6px 0; } 60% { translate: -4px 0; } 80% { translate: 4px 0; }
  }
  .float {
    position: absolute; top: -4px; left: 50%; transform: translateX(-50%) scaleX(var(--dir, 1));
    font-weight: 800; font-size: 18px; color: #f87171; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    animation: rise 1s ease-out forwards; pointer-events: none;
  }
  .float.crit { color: #fbbf24; font-size: 22px; }
  .float.heal { color: #4ade80; }
  @keyframes rise { from { opacity: 1; top: 20px; } to { opacity: 0; top: -22px; } }
  .log {
    min-height: 38px; display: flex; align-items: center; justify-content: center; text-align: center;
    padding: 6px 10px; border-radius: 10px; font-size: 13px; background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1); user-select: text;
  }
  .log.end { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.5); font-weight: 700; }
  .controls { display: flex; align-items: center; gap: 6px; }
  .controls button {
    padding: 5px 10px; border-radius: 8px; cursor: pointer; font-size: 13px;
    background: rgba(51, 65, 85, 0.9); color: inherit; border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .controls button.main { background: #38bdf8; color: #0f172a; border: none; font-weight: 700; min-width: 40px; }
  .round { margin-left: auto; font-size: 11px; opacity: 0.65; }
</style>
