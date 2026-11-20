<script lang="ts">
  /**
   * Ajustes de la IA en el móvil: la IA de Pockai o la clave propia del jugador. Los motores que solo
   * tienen sentido en un ordenador (Hermes local, los CLI) y el pago de Pro se quedan en el
   * escritorio. Avisa con `changed` cada vez que cambia el motor, para que el chat se rehaga.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import AiKeyForm from './AiKeyForm.svelte';
  import Card from './Card.svelte';
  import Notice from './Notice.svelte';
  import Segmented from './Segmented.svelte';
  import Skeleton from './Skeleton.svelte';
  import type { AiApi, AiConfigView } from './aiApi';

  export let aiApi: AiApi;
  /** Mensajes al día con la IA de Pockai, si se conocen (según el plan). */
  export let dailyLimit: number | null = null;

  const dispatch = createEventDispatcher<{ changed: AiConfigView }>();

  let config: AiConfigView | null = null;
  let mode: 'managed' | 'byok' = 'managed';
  let error = '';
  let switching = false;

  onMount(async () => {
    try {
      config = await aiApi.getConfig();
      mode = config.mode === 'byok' && config.configured ? 'byok' : 'managed';
    } catch (err) {
      error = aiApi.errorText(err, 'No se pudo cargar la configuración de la IA');
    }
  });

  /** Volver a la IA de Pockai con una clave guardada la deja guardada pero sin usar, como en el escritorio. */
  async function pick(next: string) {
    if (next === mode || !config) return;
    error = '';
    if (next === 'byok') {
      mode = 'byok';
      return;
    }
    switching = true;
    try {
      config = await aiApi.saveConfig({ mode: 'managed' });
      mode = 'managed';
      dispatch('changed', config);
    } catch (err) {
      error = aiApi.errorText(err, 'No se pudo cambiar a la IA de Pockai');
    } finally {
      switching = false;
    }
  }

  function changed(next: AiConfigView) {
    config = next;
    mode = next.mode === 'byok' && next.configured ? 'byok' : 'managed';
    dispatch('changed', next);
  }
</script>

{#if error}<Notice tone="error">{error}</Notice>{/if}
{#if !config}
  {#if !error}<Skeleton rows={1} height={180} />{/if}
{:else}
  <Segmented
    variant="pills"
    label="Motor de IA"
    value={mode}
    options={[
      { value: 'managed', label: 'IA de Pockai', icon: 'star' },
      { value: 'byok', label: 'Mi propia clave', icon: 'lock' },
    ]}
    on:change={(e) => pick(e.detail)}
  />
  {#if mode === 'managed'}
    <Card title="IA de Pockai" icon="star">
      <p class="ui-card__hint">
        Tu mascota conversa con la IA de Pockai sin cuentas externas ni claves.
        {#if dailyLimit}Tienes {dailyLimit} mensajes al día; se renuevan a medianoche.{/if}
      </p>
      {#if switching}<Skeleton rows={1} height={20} />{/if}
    </Card>
  {:else}
    <AiKeyForm {aiApi} {config} on:saved={(e) => changed(e.detail)} on:removed={() => changed({ configured: false, mode: 'managed' })} on:cancel={() => (mode = 'managed')} />
  {/if}
{/if}
