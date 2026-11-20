<script lang="ts">
  /** Progreso › Temporada en el escritorio: carga y compra el pase; la pantalla es `SeasonsView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { SeasonsView } from '@pockai/ui';
  import { api, type SeasonCurrent, type SeasonProgress } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  /** Saldo del jugador en la moneda del pase, para mostrarlo al confirmar la compra. */
  export let coins: number | null = null;
  export let gems: number | null = null;

  const dispatch = createEventDispatcher();

  let season: SeasonCurrent | null = null;
  let progress: SeasonProgress | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let justBought = false;

  /** `keepMsg`: recarga tras comprar el pase, sin borrar el aviso de la compra. */
  async function load(keepMsg = false) {
    loading = true;
    error = '';
    if (!keepMsg) justBought = false;
    try {
      [season, progress] = await Promise.all([api.getSeasonCurrent(), api.getSeasonProgress()]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar la temporada.');
    } finally {
      loading = false;
    }
  }

  async function buyPass() {
    if (!season) return;
    busy = true;
    error = '';
    try {
      await api.purchaseSeasonPass();
      justBought = true;
      await load(true);
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo comprar el pase.');
    } finally {
      busy = false;
    }
  }

  onMount(() => load());
</script>

<SeasonsView {season} {progress} {loading} {error} {busy} {justBought} {coins} {gems} on:refresh={() => load()} on:buyPass={buyPass} />
