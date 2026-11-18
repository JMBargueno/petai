<script lang="ts">
  import Ico from './Ico.svelte';
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

    <div class="log" class:end={frame.kind === 'end'} aria-hidden="true">
      {#key index}<span>{frame.text}</span>{/key}
    </div>
    <!-- Región viva estable: la visual se recrea en cada jugada y no se anunciaría -->
    <div class="sr-only" role="status" aria-live="polite">{frame.text}</div>

    <div class="controls">
      <button on:click={restart} title="Volver al principio" aria-label="Volver al principio"><Ico n="refresh" size={14} /></button>
      <button class="main" on:click={toggle} title={playing ? 'Pausa' : 'Reproducir'} aria-label={playing ? 'Pausa' : 'Reproducir'}>{#if playing}<Ico n="pause" size={16} />{:else}<Ico n="play" size={16} />{/if}</button>
      <button on:click={toEnd} title="Ir al final" aria-label="Ir al final"><Ico n="next" /></button>
      <button on:click={setSpeed} title="Cambiar velocidad" aria-label="Velocidad ×{speed}. Pulsa para cambiarla">×{speed}</button>
      <span class="round">{frame.round > 0 ? `Ronda ${frame.round}` : 'Inicio'} · {index + 1}/{frames.length}</span>
    </div>
  </div>
{/if}

<style>
  .viewer { display: flex; flex-direction: column; gap: var(--space-2); }
  .arena {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); padding: var(--space-2) var(--space-2) var(--space-1);
    border-radius: var(--radius-2xl); background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface-2));
    border: 1px solid var(--line-soft);
  }
  .side { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
  .info { display: flex; flex-direction: column; align-items: center; font-size: var(--text-caption); max-width: 100%; }
  .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
  .info small { opacity: 0.65; font-size: var(--text-caption); }
  .bar { width: 100%; height: 8px; border-radius: var(--radius-2xl); background: var(--surface-2); overflow: hidden; }
  .fill { height: 100%; transition: width var(--dur-3) ease, background var(--dur-2); }
  .hptext { font-size: var(--text-caption); opacity: 0.7; }
  .sprite {
    position: relative; width: 96px; height: 96px; margin-top: 2px;
    transition: transform var(--dur-2) ease, filter var(--dur-1);
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
    font-weight: 800; font-size: var(--text-title); color: var(--danger-ink); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    animation: rise 1s ease-out forwards; pointer-events: none;
  }
  .float.crit { color: var(--warning-ink); font-size: var(--text-subheading); }
  .float.heal { color: var(--success-ink); }
  @keyframes rise { from { opacity: 1; top: 20px; } to { opacity: 0; top: -22px; } }
  .log {
    min-height: 38px; display: flex; align-items: center; justify-content: center; text-align: center;
    padding: var(--space-2) var(--space-2); border-radius: var(--radius-2xl); font-size: var(--text-label); background: var(--surface-2);
    border: 1px solid var(--line-soft); user-select: text;
  }
  .log.end { background: color-mix(in srgb, var(--color-sunburst) 15%, var(--surface)); border-color: var(--color-sunburst); font-weight: 700; }
  .controls { display: flex; align-items: center; gap: var(--space-2); }
  .controls button {
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-2xl); cursor: pointer; font-size: var(--text-label);
    background: var(--surface-2); color: inherit; border: 1px solid var(--line-soft);
  }
  .controls button.main { background: var(--accent); color: var(--on-color); border: none; font-weight: 700; min-width: 40px; }
  .round { margin-left: auto; font-size: var(--text-caption); opacity: 0.65; }
</style>
