<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import CatchFood from './games/CatchFood.svelte';
  import MemoryMatch from './games/MemoryMatch.svelte';
  import Reflex from './games/Reflex.svelte';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  const ICONS: Record<string, string> = { catch_food: '🧺', memory_match: '🃏', reflex: '🎯' };
  const COMPONENTS: Record<string, any> = {
    catch_food: CatchFood,
    memory_match: MemoryMatch,
    reflex: Reflex,
  };

  let games: any[] = [];
  let phase: 'list' | 'playing' | 'result' = 'list';
  let session: Awaited<ReturnType<typeof api.startMinigame>> | null = null;
  let startedAt = 0;
  let result: any = null;
  let error = '';
  let busy = false;

  onMount(async () => {
    try {
      games = await api.listMinigames();
    } catch (e: any) {
      error = e.message;
    }
  });

  async function play(gameId: string) {
    if (!pet || busy) return;
    error = '';
    busy = true;
    try {
      session = await api.startMinigame(gameId, pet.id);
      startedAt = Date.now();
      phase = 'playing';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function onFinish(e: CustomEvent<{ score: number }>) {
    if (!session) return;
    // El servidor rechaza puntuaciones por encima de su techo: se acota igual en cliente
    const elapsed = (Date.now() - startedAt) / 1000;
    const score = Math.min(e.detail.score, Math.floor(session.maxScorePerSecond * elapsed));
    try {
      result = await api.finishMinigame(session.sessionId, Math.max(0, score));
      dispatch('petUpdated', result.pet);
      dispatch('refreshUser');
      error = '';
    } catch (err: any) {
      result = null;
      error = err.message;
    }
    phase = 'result';
  }

  function back() {
    phase = 'list';
    session = null;
    result = null;
    error = '';
  }
</script>

{#if !pet}
  <p class="muted">Necesitas una mascota para jugar. Eclosiona un huevo primero.</p>
{:else if phase === 'list'}
  <p class="muted">Juega con {pet.nickname || pet.species?.name} para ganar monedas y XP. Cada partida cuesta energía.</p>
  {#each games as g}
    <button class="game-card" disabled={busy || pet.sleeping} on:click={() => play(g.id)}>
      <span class="icon">{ICONS[g.id] || '🎮'}</span>
      <span class="info">
        <strong>{g.name}</strong>
        <small>{g.durationSeconds}s · hasta {g.maxCoins} <Ico n="coin" /> y {g.maxXp} XP</small>
      </span>
    </button>
  {/each}
  {#if pet.sleeping}<p class="muted">Tu mascota está durmiendo.</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
{:else if phase === 'playing' && session}
  <svelte:component
    this={COMPONENTS[session.gameId]}
    seed={session.seed}
    durationSeconds={session.durationSeconds}
    on:finish={onFinish}
  />
{:else}
  <div class="result">
    {#if result}
      <h3>¡Partida terminada!</h3>
      <p class="big"><Ico n="star" /> {result.score} puntos</p>
      <p>+{result.rewards.coins} <Ico n="coin" /> · +{result.rewards.xp} XP · +{result.rewards.happiness} <Ico n="smile" /> · −{result.rewards.energyCost} <Ico n="energy" /></p>
    {:else}
      <h3>Partida no válida</h3>
      <p class="error">{error}</p>
    {/if}
    <button class="primary-btn" on:click={back}>Volver a los juegos</button>
  </div>
{/if}

<style>
  .muted { font-size: 12px; opacity: 0.7; margin: 0 0 10px; }
  .error { color: var(--danger-ink); font-size: 12px; }
  .game-card {
    display: flex; align-items: center; gap: 12px; width: 100%; margin-bottom: 8px; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl); color: inherit; cursor: pointer; text-align: left;
  }
  .game-card:hover:not(:disabled) { background: var(--surface-2); }
  .game-card:disabled { opacity: 0.5; cursor: not-allowed; }
  .icon { font-size: 28px; }
  .info { display: flex; flex-direction: column; gap: 2px; }
  .info small { opacity: 0.65; }
  .result { text-align: center; }
  .big { font-size: 22px; font-weight: 800; margin: 4px 0; }
  .primary-btn {
    margin-top: 10px; padding: 9px 14px; border: none; border-radius: var(--radius-2xl); cursor: pointer;
    background: var(--accent); color: var(--on-color); font-weight: 700;
  }
</style>
