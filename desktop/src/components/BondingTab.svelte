<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount } from 'svelte';
  import { api, type BondingDetail } from '../lib/api';

  export let pet: any = null;

  let data: BondingDetail | null = null;
  let error = '';
  let loading = true;

  const UNLOCKS: { key: keyof BondingDetail['unlocks']; label: string }[] = [
    { key: 'greeting', label: 'Saludo' },
    { key: 'memoryRecall', label: 'Memoria' },
    { key: 'emotionalReactions', label: 'Emociones' },
    { key: 'patternUnlocked', label: 'Patrón exclusivo' },
    { key: 'sleepNearCursor', label: 'Duerme cerca' },
  ];

  const REASON_ICON: Record<string, string> = {
    feed: '🍎', battle: '⚔️', minigame: '🎮', chat: '💬',
    clean: '🧼', sleep: '😴', evolve: '✨', decay: '❄️',
  };

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getBonding(pet.id);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: petId = pet?.id;
  $: if (petId && !loading) load();

  onMount(load);

  function pct(v: number): number {
    return Math.min(100, Math.max(0, Math.round(v)));
  }
</script>

{#if !pet?.id}
  <div class="empty-msg">Necesitas una mascota para ver el vínculo.</div>
{:else if loading && !data}
  <div class="empty-msg">Cargando vínculo…</div>
{:else if error}
  <div class="error-msg">{error}</div>
{:else if data}
  <div class="bond-card">
    <div class="bond-head">
      <div>
        <h4><Ico n="bond" /> Vínculo</h4>
        <small>Rango: {data.tierName}</small>
      </div>
      <span class="bond-value">{data.value.toFixed(0)}/100</span>
    </div>
    <div class="bar"><div class="fill" style="width: {pct(data.value)}%"></div></div>
    <small class="last">Última interacción: {new Date(data.lastInteractionAt).toLocaleString()}</small>
  </div>

  <div class="sec-title">Desbloqueos</div>
  <div class="unlocks">
    {#each UNLOCKS as u (u.key)}
      <div class="unlock" class:on={data.unlocks[u.key]}>
        <span><Ico n={data.unlocks[u.key] ? 'check' : 'lock'} /></span>
        <small>{u.label}</small>
      </div>
    {/each}
  </div>

  <div class="sec-title">Decaimiento</div>
  <div class="decay">
    <div class="decay-row">
      <span>{#if data.decayInfo.isDecaying}<Ico n="cold" /> Enfriándose ahora{:else}Estable{/if}</span>
      <small>{data.decayInfo.hoursSinceInteraction.toFixed(0)}h sin interacción</small>
    </div>
    <small class="decay-detail">
      Gracia: {data.decayInfo.graceWindowHours}h · decae desde {data.decayInfo.decayStartHours}h
      · {data.decayInfo.decayRatePerDay}/día · acumulado -{data.decayInfo.acumulatedDecay.toFixed(2)}
    </small>
  </div>

  <div class="sec-title">Historial</div>
  <div class="hist">
    {#each data.history.items as ev (ev.id)}
      <div class="hist-row">
        <span class="h-reason">{REASON_ICON[ev.reason] ?? '•'}</span>
        <span class="h-reason-txt">{ev.reason}</span>
        <span class="h-delta" class:pos={ev.delta > 0} class:dec={ev.delta < 0}>
          {ev.delta > 0 ? '+' : ''}{ev.delta.toFixed(2)}
        </span>
        <span class="h-val">→ {ev.value.toFixed(0)}</span>
        <small class="h-when">{new Date(ev.createdAt).toLocaleDateString()}</small>
      </div>
    {:else}
      <div class="empty-msg">Sin cambios registrados.</div>
    {/each}
  </div>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}

<style>
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 12px 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .bond-card { padding: 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 6px; }
  .bond-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .bond-head h4 { margin: 0; font-size: 15px; }
  .bond-head small { color: var(--ink-muted); font-size: 11px; }
  .bond-value { font-size: 20px; font-weight: 700; color: var(--color-lavender); }
  .bar { height: 8px; border-radius: var(--radius-2xl); background: color-mix(in srgb, var(--ink) 6%, transparent); overflow: hidden; }
  .bar .fill { height: 100%; background: linear-gradient(90deg, var(--color-lavender), var(--accent)); }
  .last { font-size: 11px; color: var(--ink-muted); }
  .sec-title { font-weight: 700; font-size: 13px; margin: 10px 0 4px; }
  .unlocks { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .unlock { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .unlock.on { border-color: var(--success); }
  .unlock small { font-size: 10px; color: var(--ink-muted); text-align: center; }
  .decay { padding: 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 4px; }
  .decay-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
  .decay-detail { font-size: 11px; color: var(--ink-muted); }
  .hist { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-2xl); background: var(--surface-2); font-size: 12px; }
  .h-reason { font-size: 16px; }
  .h-reason-txt { font-weight: 600; width: 74px; text-transform: capitalize; }
  .h-delta { font-weight: 700; }
  .h-delta.pos { color: var(--success-ink); }
  .h-delta.dec { color: var(--danger-ink); }
  .h-val { color: var(--ink-muted); }
  .h-when { color: var(--ink-muted); margin-left: auto; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
</style>
