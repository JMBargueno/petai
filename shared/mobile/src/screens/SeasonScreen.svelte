<script lang="ts">
  /** Progreso › Temporada: pide los datos al núcleo y compra el pase; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query, stateRefresh } from '@pockai/client';
  import { SeasonsView } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { coins = null, gems = null }: { coins?: number | null; gems?: number | null } = $props();

  let season = $state<any>(null);
  let progress = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let justBought = $state(false);

  /** `keepMsg`: recarga tras comprar el pase, sin borrar el aviso de la compra. */
  async function load(keepMsg = false) {
    loading = true;
    error = '';
    if (!keepMsg) justBought = false;
    try {
      [season, progress] = await Promise.all([query({ type: 'getSeasonCurrent' }), query({ type: 'getSeasonProgress' })]);
    } catch (e) {
      error = failureText(e, 'No se pudo cargar la temporada.');
    } finally {
      loading = false;
    }
  }

  async function buyPass() {
    if (!season || busy) return;
    busy = true;
    error = '';
    try {
      await act({ type: 'purchaseSeasonPass' });
      justBought = true;
      await load(true);
      // El saldo ha cambiado: que el núcleo lo ponga al día.
      void stateRefresh('user').catch(() => {});
    } catch (e) {
      error = failureText(e, 'No se pudo comprar el pase.');
    } finally {
      busy = false;
    }
  }

  onMount(() => void load());
</script>

<SeasonsView {season} {progress} {loading} {error} {busy} {justBought} {coins} {gems} on:refresh={() => load()} on:buyPass={buyPass} />
