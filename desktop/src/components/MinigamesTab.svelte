<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { Button, Card, EmptyState, ListRow, Notice, SectionHeader, Skeleton, StatTile } from './ui';
  import CatchFood from './games/CatchFood.svelte';
  import MemoryMatch from './games/MemoryMatch.svelte';
  import Reflex from './games/Reflex.svelte';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  const ICONS: Record<string, string> = { catch_food: 'apple', memory_match: 'cards', reflex: 'target' };
  let loadingGames = true;
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
      loadingGames = false;
    } catch (e: any) {
      error = e.message;
      loadingGames = false;
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

<div class="ui-stack">
  {#if !pet}
    <EmptyState icon="gamepad" title="Sin mascota" text="Necesitas una mascota para jugar. Eclosiona un huevo primero." />
  {:else if phase === 'list'}
    <SectionHeader title="Minijuegos" icon="gamepad" count={games.length || null} />
    <p class="ui-card__hint">Juega con {pet.nickname || pet.species?.name} para ganar monedas y XP. Cada partida cuesta energía.</p>
    {#if pet.sleeping}<Notice tone="info" icon="moon">Tu mascota está durmiendo.</Notice>{/if}
    {#if loadingGames}
      <Skeleton rows={3} />
    {:else}
      <div class="ui-list">
        {#each games as g (g.id)}
          <button class="ui-row game" disabled={busy || pet.sleeping} on:click={() => play(g.id)}>
            <span class="ui-feature__icon game-icon" aria-hidden="true"><Ico n={ICONS[g.id] || 'gamepad'} size={20} /></span>
            <span class="ui-row__body">
              <span class="ui-row__title">{g.name}</span>
              <span class="ui-row__sub">{g.durationSeconds}s · hasta {g.maxCoins} monedas y {g.maxXp} XP</span>
            </span>
            <Ico n="play" size={16} />
          </button>
        {:else}
          <EmptyState compact icon="gamepad" text="No hay minijuegos disponibles." />
        {/each}
      </div>
    {/if}
    {#if error}<Notice tone="error">{error}</Notice>{/if}
  {:else if phase === 'playing' && session}
    <svelte:component
      this={COMPONENTS[session.gameId]}
      seed={session.seed}
      durationSeconds={session.durationSeconds}
      on:finish={onFinish}
    />
  {:else}
    <Card variant="hero" class="result">
      {#if result}
        <h3 class="ui-feature__title">¡Partida terminada!</h3>
        <p class="score"><Ico n="star" size={22} /> {result.score} <small>puntos</small></p>
        <div class="ui-stats">
          <StatTile icon="coin" value="+{result.rewards.coins}" label="monedas" />
          <StatTile icon="xp" value="+{result.rewards.xp}" label="XP" />
          <StatTile icon="smile" value="+{result.rewards.happiness}" label="felicidad" />
          <StatTile icon="energy" value="−{result.rewards.energyCost}" label="energía" />
        </div>
      {:else}
        <h3 class="ui-feature__title">Partida no válida</h3>
        <Notice tone="error">{error}</Notice>
      {/if}
      <Button variant="primary" block icon="gamepad" on:click={back}>Volver a los juegos</Button>
    </Card>
  {/if}
</div>

<style>
  .game {
    width: 100%;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .game:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .game-icon {
    width: 38px;
    height: 38px;
  }
  :global(.ui-card.result) {
    align-items: stretch;
    text-align: center;
  }
  .score {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0;
    font-family: var(--font-display);
    font-size: 30px;
  }
  .score small {
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>
