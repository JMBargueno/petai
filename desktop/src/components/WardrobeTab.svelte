<script lang="ts">
  /** Mascota › Armario en el escritorio: carga, compra y equipa; la pantalla es `WardrobeView`, de `@pockai/ui`. */
  import { createEventDispatcher } from 'svelte';
  import { WardrobeView } from '@pockai/ui';
  import { api, type AccessoryEntry, type AccessorySlotId } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;
  export let user: any = null;

  let slots: AccessorySlotId[] = [];
  let accessories: AccessoryEntry[] = [];
  let equipped: Partial<Record<AccessorySlotId, string>> = {};
  let loading = true;
  let error = '';
  let busy = '';
  let loadedFor = '';

  $: if (pet?.id && pet.id !== loadedFor) void load();

  async function load() {
    loadedFor = pet?.id ?? '';
    loading = true;
    error = '';
    try {
      const [catalog, worn] = await Promise.all([api.getAccessories(), pet?.id ? api.getPetAccessories(pet.id) : null]);
      slots = catalog.slots;
      accessories = catalog.accessories;
      equipped = worn?.accessories ?? {};
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el armario.');
    } finally {
      loading = false;
    }
  }

  async function buy(a: AccessoryEntry) {
    if (busy) return;
    busy = a.id;
    error = '';
    try {
      await api.buyAccessory(a.id);
      accessories = accessories.map((x) => (x.id === a.id ? { ...x, state: 'owned' } : x));
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo comprar la prenda.');
    } finally {
      busy = '';
    }
  }

  /** Equipa la prenda en su ranura, o la quita si ya estaba puesta. */
  async function toggle(a: AccessoryEntry) {
    if (busy || !pet?.id) return;
    busy = a.id;
    error = '';
    try {
      const res = await api.equipAccessories(pet.id, { [a.slot]: equipped[a.slot] === a.id ? null : a.id });
      equipped = res.accessories;
      dispatch('petUpdated', { ...pet, accessories: res.accessories });
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cambiar la prenda.');
    } finally {
      busy = '';
    }
  }
</script>

<WardrobeView {pet} {user} {slots} {accessories} {equipped} {loading} {error} {busy} on:buy={(e) => buy(e.detail)} on:toggle={(e) => toggle(e.detail)} />
