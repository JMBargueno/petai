<script lang="ts">
  /**
   * «Mi propia clave»: proveedor, URL (si no es OpenAI), modelo y API key. Guarda, prueba la conexión
   * y vuelve a la IA de Pockai por el puerto `aiApi`. Avisa con `saved` (la configuración nueva),
   * `removed` (se borró la clave) y `cancel` (sin clave guardada, el jugador se echa atrás).
   */
  import { createEventDispatcher } from 'svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Notice from './Notice.svelte';
  import { cleanAiBaseUrl, type AiApi, type AiConfigView } from './aiApi';

  export let aiApi: AiApi;
  export let config: AiConfigView;

  const dispatch = createEventDispatcher<{ saved: AiConfigView; removed: void; cancel: void }>();

  let provider = config.mode === 'byok' ? config.provider || 'openai' : 'openai';
  let baseUrl = config.mode === 'byok' ? config.baseUrl || '' : '';
  let model = config.mode === 'byok' ? config.model || '' : '';
  let apiKey = '';
  let busy = false;
  let message = '';
  let error = '';

  $: needsUrl = provider !== 'openai';
  $: hasSavedKey = config.mode === 'byok' && config.configured;

  async function run(fallback: string, fn: () => Promise<void>) {
    message = error = '';
    busy = true;
    try {
      await fn();
    } catch (err) {
      error = aiApi.errorText(err, fallback);
    } finally {
      busy = false;
    }
  }

  const save = () =>
    run('No se pudo guardar', async () => {
      const url = cleanAiBaseUrl(baseUrl);
      config = await aiApi.saveConfig({
        mode: 'byok',
        provider,
        baseUrl: needsUrl ? url : undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      if (needsUrl) baseUrl = url;
      apiKey = '';
      message = 'Guardado. Pulsa «Probar conexión» para comprobarlo.';
      dispatch('saved', config);
    });

  const test = () =>
    run('No se pudo conectar', async () => {
      const result = await aiApi.testConfig();
      if (!result.ok) throw new Error(result.error || 'No se pudo conectar');
      message = 'Conexión correcta';
      config = await aiApi.getConfig();
    });

  const remove = () =>
    run('No se pudo borrar la clave', async () => {
      await aiApi.deleteConfig();
      config = { configured: false, mode: 'managed' };
      apiKey = '';
      dispatch('removed');
    });
</script>

<Card title="Mi propia clave" icon="lock">
  <div class="form-group">
    <label for="ai-provider">Proveedor</label>
    <select id="ai-provider" class="select" bind:value={provider}>
      <option value="openai">OpenAI</option>
      <option value="hermes">Hermes Agent (remoto, HTTPS)</option>
      <option value="custom">Otro compatible con OpenAI</option>
    </select>
  </div>
  {#if needsUrl}
    <div class="form-group">
      <label for="ai-url">URL base (HTTPS)</label>
      <input id="ai-url" class="input" type="url" bind:value={baseUrl} placeholder="https://mi-servidor.com/v1" autocomplete="off" />
    </div>
  {/if}
  <div class="form-group">
    <label for="ai-model">Modelo {#if provider === 'openai'}<small class="form-hint">(vacío = gpt-4o-mini)</small>{/if}</label>
    <input id="ai-model" class="input" type="text" bind:value={model} placeholder="gpt-4o-mini" autocomplete="off" />
  </div>
  <div class="form-group">
    <label for="ai-key">API key</label>
    <input
      id="ai-key"
      class="input"
      type="password"
      bind:value={apiKey}
      autocomplete="off"
      placeholder={config.hasKey ? 'Guardada (' + (config.keyMask ?? '••••') + ') — déjalo vacío para conservarla' : 'sk-…'}
    />
  </div>
  <p class="ui-card__hint">Tu key se cifra en el servidor (AES-256-GCM) y nunca se vuelve a mostrar completa. Sin límites diarios en Pockai.</p>
  <div class="row">
    <Button variant="primary" loading={busy} on:click={save}>Guardar</Button>
    {#if hasSavedKey}
      <Button disabled={busy} on:click={test}>Probar conexión</Button>
      <Button variant="ghost" disabled={busy} on:click={remove}>Volver a IA de Pockai</Button>
    {:else}
      <Button variant="ghost" disabled={busy} on:click={() => dispatch('cancel')}>Cancelar</Button>
    {/if}
  </div>
  {#if message}<Notice tone="ok">{message}</Notice>{/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
</Card>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
