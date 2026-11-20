<script lang="ts">
  /**
   * Chat con la mascota en Android: la conversación es `ChatView`, de `@pockai/ui`, por el núcleo
   * (`chatTurn`). El engranaje abre `AiSettingsView`: la IA de Pockai o la clave propia del jugador.
   * Sin motores locales, sin herramientas del equipo y sin pasar a Pro desde aquí (los pagos en la app
   * irían por Google Play): al agotar la cuota solo se avisa.
   */
  import { onMount } from 'svelte';
  import { chatTurn, query } from '@pockai/client';
  import { AiSettingsView, Button, ChatView, type AiApi, type AiConfigView, type ChatApi } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let usage = $state<any>(null);
  let showSettings = $state(false);
  /** Con clave propia no hay cuota de Pockai. Se sabe al cargar la configuración. */
  let managed = $state(true);
  /** Cambia al cambiar de motor: la conversación se rehace con el nuevo. */
  let chatKey = $state(0);
  const dailyLimit = $derived(usage?.daily?.limit ?? (usage?.plan === 'pro' ? 200 : 15));
  const quotaExceeded = $derived(!!usage && Math.max(0, dailyLimit - (usage?.daily?.used ?? 0)) <= 0);

  async function loadUsage() {
    try {
      usage = await query({ type: 'getAiUsage' });
    } catch {
      usage = null;
    }
  }

  const chatApi: ChatApi = {
    getChatHistory: (petId) => query({ type: 'getChatHistory', petId }),
    chatStream: (petId, text, handlers, signal) => chatTurn(petId, text, handlers, { signal }) as any,
    getPendingActions: (petId) => query({ type: 'getPendingActions', petId }),
    confirmAction: (petId, actionId) => act({ type: 'confirmAction', petId, actionId }) as any,
    rejectAction: (petId, actionId) => act({ type: 'rejectAction', petId, actionId }),
    listReminders: () => query({ type: 'listReminders' }),
    deleteReminder: (id) => act({ type: 'deleteReminder', id }),
    getMemories: (petId) => query({ type: 'getMemories', petId }),
    forgetMemory: (petId, memoryId) => act({ type: 'forgetMemory', petId, memoryId }),
    forgetAllMemories: (petId) => act({ type: 'forgetAllMemories', petId }),
    errorText: (e, fallback) => failureText(e, fallback ?? 'Algo ha fallado. Inténtalo de nuevo.'),
  };

  const aiApi: AiApi = {
    getConfig: () => query<AiConfigView>({ type: 'getAiConfig' }),
    saveConfig: (cfg) => act({ type: 'saveAiConfig', cfg }) as Promise<AiConfigView>,
    testConfig: () => act({ type: 'testAiConfig' }) as Promise<{ ok: boolean; error?: string }>,
    deleteConfig: () => act({ type: 'deleteAiConfig' }),
    errorText: failureText,
  };

  function engineChanged(config: AiConfigView) {
    managed = !(config.mode === 'byok' && config.configured);
    chatKey += 1;
    void loadUsage();
  }

  onMount(() => {
    void loadUsage();
    aiApi.getConfig().then((c) => (managed = !(c.mode === 'byok' && c.configured)), () => {});
  });
</script>

{#if pet}
  <div class="chat-bar">
    <span class="muted">{managed ? 'IA de Pockai' : 'Tu propia clave'}</span>
    <Button
      variant={showSettings ? 'ink' : 'ghost'}
      size="sm"
      iconOnly
      icon="settings"
      label={showSettings ? 'Ocultar ajustes' : 'Ajustes de la IA'}
      on:click={() => (showSettings = !showSettings)}
    />
  </div>
  {#if showSettings}
    <AiSettingsView {aiApi} dailyLimit={managed ? dailyLimit : null} on:changed={(e) => engineChanged(e.detail)} />
  {:else}
    {#key `${pet.id}:${chatKey}`}
      <ChatView {pet} {chatApi} {managed} quotaExceeded={managed && quotaExceeded} {dailyLimit} maxChars={240} on:done={() => loadUsage()} on:quota={() => loadUsage()} on:useOwnKey={() => (showSettings = true)} />
    {/key}
  {/if}
{:else}
  <p class="muted">Necesitas una mascota para conversar. Eclosiona un huevo primero.</p>
{/if}

<style>
  .chat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
</style>
