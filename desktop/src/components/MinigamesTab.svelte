<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { friendlyError } from '../lib/ui/errors';
  import { api } from '../lib/api';
  import { AsyncState, Badge, Button, Card, EmptyState, Notice, SectionHeader, StatTile, Switch } from './ui';
  import { MINIGAMES, iconUrl, type PackedEntry } from '@pockai/minigames';
  import foods from '@shared/game-data/foods.json';
  import { elementMeta } from '../lib/ui/maps';
  import MinigameHost from './MinigameHost.svelte';
  import { sfx } from '../lib/audio';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  const ACCESSIBLE_KEY = 'pockai.minigames.accessible';
  const FOOD_NAMES: Record<string, string> = Object.fromEntries((foods as { id: string; name: string }[]).map((f) => [f.id, f.name]));

  let loadingGames = true;
  let games: any[] = [];
  let phase: 'list' | 'countdown' | 'playing' | 'saving' | 'result' = 'list';
  /** Cuenta atrás antes de empezar (3, 2, 1). */
  let countdown = 3;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let lastGameId = '';
  let listError = '';
  let session: Awaited<ReturnType<typeof api.startMinigame>> | null = null;
  let result: any = null;
  /** Variante accesible (accessibility.json): preferencia de este equipo, no de la cuenta. */
  let accessible = readAccessible();

  function readAccessible() {
    try {
      return localStorage.getItem(ACCESSIBLE_KEY) === '1';
    } catch {
      return false;
    }
  }
  function setAccessible(v: boolean) {
    accessible = v;
    try {
      localStorage.setItem(ACCESSIBLE_KEY, v ? '1' : '0');
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
  }
  $: petElement = (pet?.species?.element ?? '').toLowerCase();
  let error = '';
  let busy = false;

  async function loadGames() {
    loadingGames = true;
    listError = '';
    try {
      // Solo los juegos que este cliente sabe jugar (el servidor puede ir por delante).
      games = (await api.listMinigames()).filter((g: any) => g.id in MINIGAMES);
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
      session = await api.startMinigame(gameId, pet.id, accessible ? 'easy' : 'standard');
      // 3, 2, 1: da tiempo a poner las manos en el teclado o el ratón antes de que corra el reloj.
      countdown = 3;
      phase = 'countdown';
      stopCountdown();
      sfx('mg.countdown.tick');
      countdownTimer = setInterval(() => {
        countdown -= 1;
        if (countdown > 0) return sfx('mg.countdown.tick');
        stopCountdown();
        sfx('mg.countdown.go');
        phase = 'playing';
      }, 800);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar la partida.');
    } finally {
      busy = false;
    }
  }

  async function onFinish(e: CustomEvent<{ score: number; ticks: number; log: PackedEntry[] }>) {
    if (!session) return;
    // Se envía la puntuación tal cual con su registro: el servidor repite la partida y la valida.
    // (Recortarla aquí haría que no coincidiera con la repetición.)
    const { score, ticks, log } = e.detail;
    phase = 'saving';
    try {
      result = await api.finishMinigame(session.sessionId, score, { ticks, log });
      resultSounds(result);
      dispatch('petUpdated', result.pet);
      dispatch('refreshUser');
      error = '';
    } catch (err: any) {
      result = null;
      error = friendlyError(err, 'No se pudo guardar el resultado.');
    }
    phase = 'result';
  }

  /** El resultado suena según lo cerca que quedó del máximo; el objeto y la afinidad, un poco después. */
  function resultSounds(r: any) {
    const max = games.find((g) => g.id === lastGameId)?.maxCoins ?? 0;
    sfx(max > 0 && (r?.rewards?.coins ?? 0) >= max * 0.8 ? 'mg.result.great' : 'mg.result.good');
    if (r?.item) sfx('mg.item_drop', { delayMs: 900 });
    if (r?.affinity && petElement) sfx(`elem.${petElement}.accent`, { delayMs: 500 });
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
    <Switch
      checked={accessible}
      icon="smile"
      label="Modo accesible"
      sub="Más tiempo para reaccionar, zonas más grandes y pistas."
      on:change={(e) => setAccessible(e.detail)}
    />
    <AsyncState loading={loadingGames} error={listError} onRetry={loadGames}>
      <div class="ui-list">
        {#each games as g (g.id)}
          {@const noEnergy = g.energyCost != null && (pet.energy ?? 0) < g.energyCost}
          <button class="ui-row game" disabled={busy || pet.sleeping || noEnergy} on:click={() => play(g.id)}>
            <span class="ui-feature__icon game-icon" aria-hidden="true">
              <!-- Icono de pixel art del juego; mientras no tenga, el de interfaz del registro. -->
              {#if iconUrl(g.id)}<img class="game-icon__art" src={iconUrl(g.id)} alt="" width="32" height="32" draggable="false" />{:else}<Ico n={MINIGAMES[g.id]?.icon || 'gamepad'} size={20} />{/if}
            </span>
            <span class="ui-row__body">
              <span class="ui-row__title">
                {g.name}
                {#if g.element}
                  {@const el = elementMeta(g.element)}
                  <Badge size="sm" color={el.color} icon={el.icon} title={g.element === petElement ? 'Afinidad: más felicidad al jugar' : `Prueba de ${el.label}`}>
                    {el.label}{#if g.element === petElement} · afín{/if}
                  </Badge>
                {/if}
              </span>
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
      <p class="ui-card__hint">{MINIGAMES[lastGameId]?.howTo ?? '¡Prepárate!'}</p>
      <Button variant="ghost" size="sm" on:click={back}>Cancelar</Button>
    </Card>
  {:else if phase === 'playing' && session}
    <div class="game-bar">
      <span class="label-caps">{games.find((g) => g.id === lastGameId)?.name ?? 'Minijuego'}</span>
      <Button variant="ghost" size="sm" icon="x" title="Abandonar la partida (no da recompensa)" on:click={back}>Salir</Button>
    </div>
    <MinigameHost
      gameId={session.gameId}
      seed={session.seed}
      durationSeconds={session.durationSeconds}
      variant={session.variant ?? (accessible ? 'easy' : 'standard')}
      {pet}
      on:finish={onFinish}
      on:error={(e) => {
        back();
        error = e.detail.message;
      }}
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
        {#if result.item}
          <Notice tone="success" icon="gift">¡La partida ha dejado {result.item.qty} × {FOOD_NAMES[result.item.itemId] ?? result.item.itemId} en tu inventario!</Notice>
        {/if}
        {#if result.affinity}
          <p class="ui-card__hint">Prueba de su elemento: {pet.nickname || pet.species?.name} lo ha disfrutado más.</p>
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
  .game-icon__art {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
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
