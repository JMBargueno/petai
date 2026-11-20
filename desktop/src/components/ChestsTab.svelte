<script lang="ts">
  /** Tienda › Cofres en el escritorio: carga, abre y compra; la pantalla es `ChestsView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { ChestsView, chestBoughtText } from '@pockai/ui';
  import { api, type Chest, type ChestList, type OpenChestResponse, type ChestHistory } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  let chests: ChestList | null = null;
  let me: { coins: number; gems: number } | null = null;
  let history: ChestHistory | null = null;
  let lastOpen: OpenChestResponse | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let buying = '';
  let actionError = '';
  let bought = '';

  async function load() {
    loading = true;
    error = '';
    lastOpen = null;
    try {
      [chests, me, history] = await Promise.all([api.getChests(), api.getMe(), api.getChestHistory(15, 0)]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron cargar los cofres.');
    } finally {
      loading = false;
    }
  }

  async function open(chest: Chest) {
    busyId = chest.id;
    actionError = '';
    bought = '';
    try {
      const opened = await api.openChest(chest.id);
      await load();
      lastOpen = opened;
      dispatch('refreshUser');
    } catch (e: any) {
      actionError = friendlyError(e, 'No se pudo abrir el cofre.');
    } finally {
      busyId = '';
    }
  }

  /** Solo se venden algunos tipos de cofre: los que admite `api.purchaseChest`. */
  type BuyableChest = Parameters<typeof api.purchaseChest>[0];

  async function buy(type: BuyableChest, method: 'coins' | 'gems') {
    buying = `${type}:${method}`;
    actionError = '';
    bought = '';
    try {
      await api.purchaseChest(type, method);
      await load();
      bought = chestBoughtText(type);
      dispatch('refreshUser');
    } catch (e: any) {
      actionError = friendlyError(e, 'No se pudo comprar el cofre.');
    } finally {
      buying = '';
    }
  }

  onMount(load);
</script>

<ChestsView
  {chests}
  {history}
  {lastOpen}
  coins={me?.coins ?? null}
  gems={me?.gems ?? null}
  {loading}
  {error}
  {busyId}
  {buying}
  {actionError}
  {bought}
  on:refresh={load}
  on:open={(e) => open(e.detail)}
  on:buy={(e) => buy(e.detail.type as BuyableChest, e.detail.method)}
  on:dismissError={() => (actionError = '')}
/>
