<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { friendlyError } from '../lib/ui/errors';
  import { api } from '../lib/api';
  import { AsyncState, Button, Card, EmptyState, Notice, SectionHeader, StatTile } from './ui';
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
  /** Instrucciones de una línea que se ven durante la cuenta atrás. */
  const HOW: Record<string, string> = {
    catch_food: 'Mueve la cesta con el ratón o con las flechas ← → y atrapa la comida.',
    memory_match: 'Destapa dos cartas iguales. Puedes usar Tab y Enter.',
    reflex: 'Pulsa el objetivo en cuanto aparezca, con el ratón o con Espacio.',
  };
  let phase: 'list' | 'countdown' | 'playing' | 'saving' | 'result' = 'list';
  /** Cuenta atrás antes de empezar (3, 2, 1) y aviso si el servidor recortó la puntuación. */
  let countdown = 3;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let lastGameId = '';
  let clipped = false;
  let listError = '';
  let session: Awaited<ReturnType<typeof api.startMinigame>> | null = null;
  let startedAt = 0;
  let result: any = null;
  let error = '';
  let busy = false;

  async function loadGames() {
    loadingGames = true;
    listError = '';
    try {
      games = await api.listMinigames();
    } catch (e: any) {
      listError = friendlyError(e, 'No se pudieron cargar los minijuegos.');
    } finally {
      loadingGames = false;
    }
  }
  onMount(loadGames);
  onDestroy(stopCountdown);

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  async function play(gameId: string) {
    if (!pet || busy) return;
    error = '';
    busy = true;
    try {
      lastGameId = gameId;
      session = await api.startMinigame(gameId, pet.id);
      // 3, 2, 1: da tiempo a poner las manos en el teclado o el ratón antes de que corra el reloj.
      countdown = 3;
      phase = 'countdown';
      stopCountdown();
      countdownTimer = setInterval(() => {
        countdown -= 1;
        if (countdown > 0) return;
        stopCountdown();
        startedAt = Date.now();
        phase = 'playing';
      }, 800);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar la partida.');
    } finally {
      busy = false;
    }
  }

  async function onFinish(e: CustomEvent<{ score: number }>) {
    if (!session) return;
    // El servidor rechaza puntuaciones por encima de su techo: se acota igual en cliente
    const elapsed = (Date.now() - startedAt) / 1000;
    const score = Math.min(e.detail.score, Math.floor(session.maxScorePerSecond * elapsed));
    clipped = score < e.detail.score;
    phase = 'saving';
    try {
      result = await api.finishMinigame(session.sessionId, Math.max(0, score));
      dispatch('petUpdated', result.pet);
      dispatch('refreshUser');
      error = '';
    } catch (err: any) {
      result = null;
      error = friendlyError(err, 'No se pudo guardar el resultado.');
    }
    phase = 'result';
  }

  function back() {
    stopCountdown();
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
    <p class="ui-card__hint">Juega con {pet.nickname || pet.species?.name} para ganar monedas y XP. Cada partida gasta energía (ahora tiene {Math.round(pet.energy ?? 0)}%).</p>
    {#if pet.sleeping}<Notice tone="info" icon="moon">Tu mascota está durmiendo. Despiértala en Mascota › Inicio para jugar.</Notice>{/if}
    <AsyncState loading={loadingGames} error={listError} onRetry={loadGames}>
      <div class="ui-list">
        {#each games as g (g.id)}
          {@const noEnergy = g.energyCost != null && (pet.energy ?? 0) < g.energyCost}
          <button class="ui-row game" disabled={busy || pet.sleeping || noEnergy} on:click={() => play(g.id)}>
            <span class="ui-feature__icon game-icon" aria-hidden="true"><Ico n={ICONS[g.id] || 'gamepad'} size={20} /></span>
            <span class="ui-row__body">
              <span class="ui-row__title">{g.name}</span>
              <span class="ui-row__sub ui-row__sub--wrap">
                {g.durationSeconds} s · hasta {g.maxCoins} monedas y {g.maxXp} XP{#if g.energyCost != null} · −{g.energyCost} de energía{/if}
                {#if noEnergy}<strong class="game-block"> · Sin energía suficiente</strong>{/if}
              </span>
            </span>
            <Ico n="play" size={16} />
          </button>
        {:else}
          <EmptyState compact icon="gamepad" text="No hay minijuegos disponibles." />
        {/each}
      </div>
    </AsyncState>
    {#if error}<Notice tone="error">{error}</Notice>{/if}
  {:else if phase === 'countdown'}
    <Card variant="hero" class="result">
      <h3 class="ui-feature__title">{games.find((g) => g.id === lastGameId)?.name ?? 'Minijuego'}</h3>
      <p class="score countdown" role="status" aria-live="assertive">{countdown}</p>
      <p class="ui-card__hint">{HOW[lastGameId] ?? '¡Prepárate!'}</p>
      <Button variant="ghost" size="sm" on:click={back}>Cancelar</Button>
    </Card>
  {:else if phase === 'playing' && session}
    <div class="game-bar">
      <span class="label-caps">{games.find((g) => g.id === lastGameId)?.name ?? 'Minijuego'}</span>
      <Button variant="ghost" size="sm" icon="x" title="Abandonar la partida (no da recompensa)" on:click={back}>Salir</Button>
    </div>
    <svelte:component
      this={COMPONENTS[session.gameId]}
      seed={session.seed}
      durationSeconds={session.durationSeconds}
      on:finish={onFinish}
    />
  {:else if phase === 'saving'}
    <Card variant="hero" class="result">
      <h3 class="ui-feature__title">Guardando resultado…</h3>
      <span class="ui-spinner" aria-hidden="true"></span>
    </Card>
  {:else}
    <Card variant="hero" class="result">
      {#if result}
        <h3 class="ui-feature__title">¡Partida terminada!</h3>
        <p class="score"><Ico n="star" size={22} /> {result.score} <small>puntos</small></p>
        <div class="ui-stats">
          <StatTile icon="coin" value="+{result.rewards.coins}" label="monedas" />
          <StatTile icon="xp" value="+{result.rewards.xp}" label="XP" />
          <StatTile icon="smile" value="+{result.rewards.happiness}" label="felicidad" />
          {#if result.rewards.energyCost != null}<StatTile icon="energy" value="−{result.rewards.energyCost}" label="energía" />{/if}
        </div>
        {#if clipped}
          <p class="ui-card__hint">La puntuación se ajustó al máximo que admite la duración de la partida.</p>
        {/if}
      {:else}
        <h3 class="ui-feature__title">Partida no válida</h3>
        <Notice tone="error">{error}</Notice>
      {/if}
      <Button variant="primary" block icon="play" loading={busy} disabled={pet.sleeping} on:click={() => play(lastGameId)}>Jugar otra vez</Button>
      <Button block icon="gamepad" on:click={back}>Volver a los juegos</Button>
    </Card>
  {/if}
</div>

<style>
  .game-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-muted);
  }
  .game-block {
    color: var(--danger-ink);
  }
  .countdown {
    font-family: var(--font-display);
    font-size: 64px;
    line-height: 1;
  }
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
    gap: var(--space-2);
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-heading-sm);
  }
  .score small {
    font-family: var(--font-ui);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
</style>
