<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type AdventureScene, type AdventureHistoryEntry } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const PREMIUM_COST_GEMS = 10;
  const OUTCOME: Record<string, string> = { win: '🏆 Victoria', partial: '⭐ Logro parcial', lose: '💫 Derrota valiente' };

  let adventureId: string | null = null;
  let theme = '';
  let sceneCount = 0;
  let scene: AdventureScene | null = null;
  let ending: { outcome: string; rewards: { xp: number; coins: number }; memory: string } | null = null;
  let history: AdventureHistoryEntry[] = [];
  let error = '';
  let loading = true;
  let busy = false;

  async function load() {
    loading = true;
    error = '';
    try {
      const [cur, hist] = await Promise.all([api.adventureCurrent(), api.adventureHistory(5)]);
      history = hist;
      if (cur.active) {
        adventureId = cur.adventureId;
        theme = cur.theme;
        sceneCount = cur.sceneCount;
        scene = cur.scene;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function start(premium: boolean) {
    if (!pet) return;
    busy = true;
    error = '';
    ending = null;
    try {
      const res = await api.adventureStart(pet.id, premium);
      adventureId = res.adventureId;
      theme = res.theme;
      sceneCount = res.sceneCount;
      scene = res.scene;
      if (premium) dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function choose(i: number) {
    if (!adventureId || busy) return;
    busy = true;
    error = '';
    try {
      const res = await api.adventureChoose(adventureId, i);
      if ('completed' in res) {
        ending = { outcome: res.outcome, rewards: res.rewards, memory: res.memory };
        adventureId = null;
        scene = null;
        history = await api.adventureHistory(5).catch(() => history);
        dispatch('refreshPet');
        dispatch('refreshUser');
      } else {
        scene = res.scene;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

{#if loading}
  <div class="empty-msg">Cargando aventura…</div>
{:else}
  <div class="card">
    <div class="head">
      <span class="big">🗺️</span>
      <div class="title">
        <div class="name">{adventureId ? theme : 'Aventura diaria'}</div>
        <small>
          {#if adventureId && scene}Escena {scene.order + 1} de {sceneCount}{:else}1 gratis al día · premium: 5 escenas por {PREMIUM_COST_GEMS} gemas{/if}
        </small>
      </div>
    </div>

    {#if adventureId && scene}
      <p class="scene-text">{scene.text}</p>
      <div class="choices">
        {#each scene.choices as c, i}
          <button class="choice" disabled={busy} on:click={() => choose(i)}>
            <span>{c.label}</span>
            {#if c.hint}<small>{c.hint}</small>{/if}
          </button>
        {/each}
      </div>
      {#if busy}<div class="empty-msg">La historia continúa…</div>{/if}
    {:else}
      {#if ending}
        <div class="ok-msg">
          <b>{OUTCOME[ending.outcome] ?? ending.outcome}</b> · +{ending.rewards.xp} XP, +{ending.rewards.coins} monedas
          <p class="memory">{ending.memory}</p>
        </div>
      {/if}
      <div class="row">
        <button class="primary" disabled={!pet || busy} on:click={() => start(false)}>
          {#if busy}Preparando…{:else if pet}Empezar aventura{:else}Sin mascota activa{/if}
        </button>
        <button class="ghost" disabled={!pet || busy} on:click={() => start(true)}>💎 Premium</button>
      </div>
    {/if}

    {#if error}<div class="error-msg">{error}</div>{/if}
  </div>

  <div class="sec-title">Aventuras anteriores</div>
  <div class="hist-list">
    {#each history as h (h.adventureId)}
      <div class="hist-row">
        <div class="hist-body">
          <span class="hist-name">{h.theme}{h.isPremium ? ' 💎' : ''}</span>
          <small>{new Date(h.startedAt).toLocaleDateString('es-ES')} · +{h.xpAwarded} XP · +{h.coinsAwarded} monedas</small>
        </div>
        <span class="hist-status">{h.outcome ? OUTCOME[h.outcome] ?? h.outcome : '—'}</span>
      </div>
    {:else}
      <div class="empty-msg">Aún no has vivido ninguna aventura.</div>
    {/each}
  </div>
{/if}

<style>
  .card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .head { display: flex; gap: 12px; align-items: center; }
  .big { font-size: 34px; }
  .title { display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 16px; font-weight: 700; }
  .title small { color: var(--ink-muted); font-size: 11px; }
  .scene-text { font-size: 13px; line-height: 1.5; margin: 0; white-space: pre-line; }
  .choices { display: flex; flex-direction: column; gap: 6px; }
  .choice { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px 10px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); color: var(--ink); cursor: pointer; text-align: left; font-size: 13px; font-weight: 600; }
  .choice small { font-size: 11px; font-weight: 400; color: var(--ink-muted); }
  .choice:hover:not(:disabled) { border-color: var(--accent); }
  .choice:disabled { opacity: 0.5; cursor: not-allowed; }
  .row { display: flex; gap: 6px; }
  .primary { flex: 2; padding: 10px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); }
  .ghost { flex: 1; padding: 10px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 12px; font-weight: 600; }
  .primary:disabled, .ghost:disabled { opacity: 0.5; cursor: not-allowed; }
  .memory { margin: 6px 0 0; font-size: 11px; color: var(--ink-muted); font-style: italic; }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 10px 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
  .hist-list { display: flex; flex-direction: column; gap: 6px; }
  .hist-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--radius-2xl); background: var(--surface-2); }
  .hist-body { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .hist-name { font-size: 12px; font-weight: 600; }
  .hist-body small { font-size: 10px; color: var(--ink-muted); }
  .hist-status { font-size: 11px; color: var(--success-ink); white-space: nowrap; }
</style>
