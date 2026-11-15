<script lang="ts">
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
        <h4>💞 Vínculo</h4>
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
        <span>{data.unlocks[u.key] ? '✅' : '🔒'}</span>
        <small>{u.label}</small>
      </div>
    {/each}
  </div>

  <div class="sec-title">Decaimiento</div>
  <div class="decay">
    <div class="decay-row">
      <span>{data.decayInfo.isDecaying ? '🥶 Enfríando ahora' : '🙂 Estable'}</span>
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
  .empty-msg { font-size: 12px; color: #64748b; text-align: center; padding: 12px 0; }
  .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; }
  .bond-card { padding: 10px; border-radius: 12px; background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; gap: 6px; }
  .bond-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .bond-head h4 { margin: 0; font-size: 15px; }
  .bond-head small { color: #94a3b8; font-size: 11px; }
  .bond-value { font-size: 20px; font-weight: 700; color: #f472b6; }
  .bar { height: 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .bar .fill { height: 100%; background: linear-gradient(90deg, #f472b6, #38bdf8); }
  .last { font-size: 11px; color: #94a3b8; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 10px 0 4px; }
  .unlocks { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .unlock { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); }
  .unlock.on { border-color: rgba(34, 197, 94, 0.5); }
  .unlock small { font-size: 10px; color: #94a3b8; text-align: center; }
  .decay { padding: 10px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 4px; }
  .decay-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
  .decay-detail { font-size: 11px; color: #94a3b8; }
  .hist { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.4); font-size: 12px; }
  .h-reason { font-size: 16px; }
  .h-reason-txt { font-weight: 600; width: 74px; text-transform: capitalize; }
  .h-delta { font-weight: 700; }
  .h-delta.pos { color: #4ade80; }
  .h-delta.dec { color: #f87171; }
  .h-val { color: #cbd5e1; }
  .h-when { color: #94a3b8; margin-left: auto; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; background: #38bdf8; color: #0f172a; width: 100%; }
</style>
