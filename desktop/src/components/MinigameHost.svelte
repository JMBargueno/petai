<script lang="ts">
  /**
   * Monta un minijuego de @pockai/minigames (los mismos juegos que usarán Android e iOS) y avisa
   * con `finish` cuando termina. Las reglas y la vista viven en shared/minigames.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { mountMinigame, type MountedMinigame, type LoggedInput } from '@pockai/minigames';

  export let gameId: string;
  export let seed: number;
  export let durationSeconds: number;

  const dispatch = createEventDispatcher<{ finish: { score: number; inputLog: LoggedInput[] }; error: { message: string } }>();

  let host: HTMLDivElement;
  let game: MountedMinigame | null = null;
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    game = mountMinigame(host, {
      gameId,
      seed,
      durationSeconds,
      reducedMotion,
      onEvent: (e) => {
        if (e.type === 'finished') dispatch('finish', { score: e.score, inputLog: e.inputLog });
        else if (e.type === 'error') dispatch('error', { message: e.message });
      },
    });
  });
  onDestroy(() => game?.dispose());
</script>

<div bind:this={host} class="minigame-host"></div>

<style>
  .minigame-host {
    width: 340px;
    max-width: 100%;
  }
</style>
