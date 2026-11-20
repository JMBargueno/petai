<script lang="ts">
  /** Jugar › Minijuegos: lista, empezar y guardar por el núcleo; la pantalla es la de `@pockai/ui`. La mascota y el saldo los pone al día el núcleo. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { MinigamesView } from '@pockai/ui';
  import type { GameVariant, PackedEntry } from '@pockai/minigames';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let loadingGames = $state(true);
  let games = $state<any[]>([]);
  let listError = $state('');
  let session = $state<any>(null);
  let result = $state<any>(null);
  let error = $state('');
  let busy = $state(false);

  async function loadGames() {
    loadingGames = true;
    listError = '';
    try {
      games = ((await query({ type: 'listMinigames' })) as any[]) ?? [];
    } catch (e) {
      listError = failureText(e, 'No se pudieron cargar los minijuegos.');
    } finally {
      loadingGames = false;
    }
  }
  onMount(() => void loadGames());

  async function play(gameId: string, variant: GameVariant) {
    if (!pet || busy) return;
    error = '';
    busy = true;
    try {
      session = await act({ type: 'startMinigame', gameId, petId: String(pet.id), variant: variant === 'easy' ? 'easy' : 'standard' });
    } catch (e) {
      error = failureText(e, 'No se pudo empezar la partida.');
    } finally {
      busy = false;
    }
  }

  async function finish(d: { sessionId: string; score: number; ticks: number; log: PackedEntry[] }) {
    busy = true;
    try {
      result = await act({ type: 'finishMinigame', sessionId: d.sessionId, body: { score: d.score, ticks: d.ticks, log: d.log } });
      error = '';
    } catch (e) {
      result = null;
      error = failureText(e, 'No se pudo guardar el resultado.');
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
