<script lang="ts">
  /** Tienda › Cofres: pide los datos al núcleo, abre y compra; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { ChestsView, chestBoughtText, type ChestPayment } from '@pockai/ui';
  import { act, failureText } from '../core';

  /** El saldo sale del estado del núcleo, que lo pone al día tras abrir o comprar. */
  let { coins = null, gems = null }: { coins?: number | null; gems?: number | null } = $props();

  let chests = $state<any>(null);
  let history = $state<any>(null);
  let lastOpen = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let busyId = $state('');
  let buying = $state('');
  let actionError = $state('');
  let bought = $state('');

  async function load() {
    loading = true;
    error = '';
    lastOpen = null;
    try {
      [chests, history] = (await Promise.all([query({ type: 'getChests' }), query({ type: 'getChestHistory', limit: 15, offset: 0 })])) as [any, any];
    } catch (e) {
      error = failureText(e, 'No se pudieron cargar los cofres.');
    } finally {
      loading = false;
    }
  }

  async function open(chest: any) {
    if (busyId || buying) return;
    busyId = String(chest.id);
    actionError = '';
    bought = '';
    try {
      const opened = await act({ type: 'openChest', chestId: String(chest.id) });
      await load();
      lastOpen = opened;
    } catch (e) {
      actionError = failureText(e, 'No se pudo abrir el cofre.');
    } finally {
      busyId = '';
    }
  }

  async function buy(type: string, method: ChestPayment) {
    if (busyId || buying) return;
    buying = `${type}:${method}`;
    actionError = '';
    bought = '';
    try {
      await act({ type: 'purchaseChest', kind: type, paymentMethod: method });
      await load();
      bought = chestBoughtText(type);
    } catch (e) {
      actionError = failureText(e, 'No se pudo comprar el cofre.');
    } finally {
      buying = '';
    }
  }

  onMount(() => void load());
</script>

<ChestsView
  {chests}
  {history}
  {lastOpen}
  {coins}
  {gems}
  {loading}
  {error}
  {busyId}
  {buying}
  {actionError}
  {bought}
  on:refresh={() => load()}
  on:open={(e) => open(e.detail)}
  on:buy={(e) => buy(e.detail.type, e.detail.method)}
  on:dismissError={() => (actionError = '')}
/>
