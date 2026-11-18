<script lang="ts">
  /**
   * Monta un minijuego de @pockai/minigames (los mismos juegos que usan Android e iOS) y avisa con
   * `finish` cuando termina, con el registro de la partida para que el servidor la valide. Las
   * reglas y la vista viven en shared/minigames; la pausa al perder el foco también.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { mountMinigame, type MountedMinigame, type PackedEntry, type GameVariant } from '@pockai/minigames';

  export let gameId: string;
  export let seed: number;
  export let durationSeconds: number;
  export let variant: GameVariant = 'standard';

  const dispatch = createEventDispatcher<{
    finish: { score: number; ticks: number; log: PackedEntry[] };
    error: { message: string };
  }>();

  let host: HTMLDivElement;
  let game: MountedMinigame | null = null;
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    game = mountMinigame(host, {
      gameId,
      seed,
      durationSeconds,
      variant,
      reducedMotion,
      onEvent: (e) => {
        if (e.type === 'finished') dispatch('finish', { score: e.score, ticks: e.ticks, log: e.log });
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
