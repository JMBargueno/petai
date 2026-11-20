<script lang="ts">
  /** Jugar › Minijuegos en el escritorio: lista, empezar y guardar; la pantalla es `MinigamesView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { MinigamesView } from '@pockai/ui';
  import type { GameVariant, PackedEntry } from '@pockai/minigames';
  import { friendlyError } from '../lib/ui/errors';
  import { api } from '../lib/api';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  let loadingGames = true;
  let games: any[] = [];
  let listError = '';
  let session: Awaited<ReturnType<typeof api.startMinigame>> | null = null;
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

  async function play(gameId: string, variant: GameVariant) {
    if (!pet || busy) return;
    error = '';
    busy = true;
    try {
      session = await api.startMinigame(gameId, pet.id, variant === 'easy' ? 'easy' : 'standard');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar la partida.');
    } finally {
      busy = false;
    }
  }

  async function finish(d: { sessionId: string; score: number; ticks: number; log: PackedEntry[] }) {
    busy = true;
    try {
      result = await api.finishMinigame(d.sessionId, d.score, { ticks: d.ticks, log: d.log });
      dispatch('petUpdated', result.pet);
      dispatch('refreshUser');
      error = '';
    } catch (err: any) {
      result = null;
      error = friendlyError(err, 'No se pudo guardar el resultado.');
    } finally {
      busy = false;
    }
  }

  function back() {
    session = null;
    result = null;
    error = '';
  }
</script>

<MinigamesView
  {pet}
  {games}
  {loadingGames}
  {listError}
  {error}
  {busy}
  {session}
  {result}
  on:play={(e) => play(e.detail.gameId, e.detail.variant)}
  on:finish={(e) => finish(e.detail)}
  on:back={back}
  on:hostError={(e) => (error = e.detail)}
  on:retry={loadGames}
/>
