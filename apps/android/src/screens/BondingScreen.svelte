<script lang="ts">
  /** Mascota › Vínculo: pide los datos al núcleo cuando cambia la mascota; la pantalla es la de `@pockai/ui`. */
  import { query } from '@pockai/client';
  import { BondingView } from '@pockai/ui';
  import { failureText } from '../core';

  let { petId = null }: { petId?: string | null } = $props();

  let data = $state<any>(null);
  let loading = $state(true);
  let error = $state('');

  async function load(id: string) {
    loading = true;
    error = '';
    try {
      const detail = await query({ type: 'getBonding', petId: id });
      // Si mientras tanto se cambió de mascota, esta respuesta ya no vale.
      if (id === petId) data = detail;
    } catch (e) {
      error = failureText(e, 'No se pudo cargar el vínculo.');
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const id = petId;
    data = null;
    if (id) void load(id);
  });
</script>

<BondingView hasPet={!!petId} {data} {loading} {error} on:refresh={() => petId && load(petId)} />
