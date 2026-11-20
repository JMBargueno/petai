<script lang="ts">
  /** Mascota › Vínculo en el escritorio: pide los datos; la pantalla es `BondingView`, de `@pockai/ui`. */
  import { BondingView } from '@pockai/ui';
  import { api, type BondingDetail } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  export let pet: any = null;

  let data: BondingDetail | null = null;
  let error = '';
  let loading = true;

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getBonding(pet.id);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el vínculo.');
    } finally {
      loading = false;
    }
  }

  // Recarga solo al cambiar de mascota. (Antes dependía de `loading` y cada respuesta volvía a
  // lanzar la petición: un bucle infinito.)
  let loadedFor = '';
  $: if (pet?.id && pet.id !== loadedFor) {
    loadedFor = pet.id;
    data = null;
    load();
  }
</script>

<BondingView hasPet={!!pet?.id} {data} {loading} {error} on:refresh={load} />
