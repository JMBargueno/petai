<script lang="ts">
  /**
   * Chat con la mascota en Android: la conversación es `ChatView`, de `@pockai/ui`, con la IA de
   * Pockai por el núcleo (`chatTurn`). Sin motores locales, sin herramientas del equipo y sin pasar
   * a Pro desde aquí (los pagos en la app irían por Google Play): al agotar la cuota solo se avisa.
   */
  import { onMount } from 'svelte';
  import { chatTurn, query } from '@pockai/client';
  import { ChatView, type ChatApi } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let usage = $state<any>(null);
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

  onMount(() => void loadUsage());
</script>

{#if pet}
  {#key pet.id}
    <ChatView {pet} {chatApi} managed {quotaExceeded} {dailyLimit} maxChars={240} on:done={() => loadUsage()} on:quota={() => loadUsage()} />
  {/key}
{:else}
  <p class="muted">Necesitas una mascota para conversar. Eclosiona un huevo primero.</p>
{/if}
