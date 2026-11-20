<script lang="ts">
  /** Mascota › Armario: pide el catálogo al núcleo, compra y equipa; la pantalla es la de `@pockai/ui`. */
  import { query } from '@pockai/client';
  import { WardrobeView } from '@pockai/ui';
  import { act, failureText } from '../core';

  /** El saldo y la mascota los pone al día el núcleo tras comprar o equipar. */
  let { pet = null, user = null }: { pet?: any; user?: any } = $props();

  let slots = $state<string[]>([]);
  let accessories = $state<any[]>([]);
  let equipped = $state<Record<string, string | undefined>>({});
  let loading = $state(true);
  let error = $state('');
  let busy = $state('');
  let loadedFor = '';

  $effect(() => {
    if (pet?.id && pet.id !== loadedFor) void load();
  });

  async function load() {
    loadedFor = pet?.id ?? '';
    loading = true;
    error = '';
    try {
      const [catalog, worn] = (await Promise.all([
        query({ type: 'getAccessories' }),
        pet?.id ? query({ type: 'getPetAccessories', petId: String(pet.id) }) : null,
      ])) as [any, any];
      slots = catalog?.slots ?? [];
      accessories = catalog?.accessories ?? [];
      equipped = worn?.accessories ?? {};
    } catch (e) {
      error = failureText(e, 'No se pudo cargar el armario.');
    } finally {
      loading = false;
    }
  }

  async function buy(a: any) {
    if (busy) return;
    busy = a.id;
    error = '';
    try {
      await act({ type: 'buyAccessory', id: String(a.id) });
      accessories = accessories.map((x) => (x.id === a.id ? { ...x, state: 'owned' } : x));
    } catch (e) {
      error = failureText(e, 'No se pudo comprar la prenda.');
    } finally {
      busy = '';
    }
  }

  /** Equipa la prenda en su ranura, o la quita si ya estaba puesta. */
  async function toggle(a: any) {
    if (busy || !pet?.id) return;
    busy = a.id;
    error = '';
    try {
      const res = (await act({ type: 'equipAccessories', petId: String(pet.id), change: { [a.slot]: equipped[a.slot] === a.id ? null : a.id } })) as any;
      equipped = res?.accessories ?? equipped;
    } catch (e) {
      error = failureText(e, 'No se pudo cambiar la prenda.');
    } finally {
      busy = '';
    }
  }
</script>

<WardrobeView {pet} {user} {slots} {accessories} {equipped} {loading} {error} {busy} on:buy={(e) => buy(e.detail)} on:toggle={(e) => toggle(e.detail)} />
