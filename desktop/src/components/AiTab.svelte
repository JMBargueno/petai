<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { api } from '../lib/api';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  type Msg = { id: string; role: 'user' | 'assistant'; content: string };

  let loaded = false;
  let config: any = { configured: false };
  let showSettings = false;

  // Formulario de ajustes
  let provider = 'openai';
  let baseUrl = '';
  let model = '';
  let apiKey = '';
  let settingsMsg = '';
  let settingsErr = '';
  let busy = false;

  // Chat
  let messages: Msg[] = [];
  let input = '';
  let streaming = false;
  let chatErr = '';
  let scroller: HTMLElement;
  let abort: AbortController | null = null;

  $: needsUrl = provider !== 'openai';
  $: tier = (pet?.intelligence ?? 0) >= 500 ? 'Agente' : (pet?.intelligence ?? 0) >= 200 ? 'Memoria' : 'Charla';

  onMount(async () => {
    await loadConfig();
    if (config.configured && pet) await loadHistory();
    loaded = true;
  });
  onDestroy(() => abort?.abort());

  async function loadConfig() {
    try {
      config = await api.getAiConfig();
      if (config.configured) {
        provider = config.provider;
        baseUrl = config.baseUrl || '';
        model = config.model || '';
      } else {
        showSettings = true;
      }
    } catch (e: any) {
      settingsErr = e.message;
    }
  }

  async function loadHistory() {
    try {
      messages = await api.getChatHistory(pet.id);
      await scrollDown();
    } catch (e: any) {
      chatErr = e.message;
    }
  }

  async function scrollDown() {
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  async function save() {
    settingsErr = '';
    settingsMsg = '';
    busy = true;
    try {
      config = await api.saveAiConfig({
        provider,
        baseUrl: needsUrl ? baseUrl : undefined,
        model: model || undefined,
        apiKey: apiKey || undefined,
      });
      apiKey = ''; // la key ya no se conserva en el cliente
      settingsMsg = 'Guardado. Pulsa "Probar conexión" para comprobarlo.';
      if (pet) await loadHistory();
    } catch (e: any) {
      settingsErr = e.message;
    } finally {
      busy = false;
    }
  }

  async function test() {
    settingsErr = '';
    settingsMsg = '';
    busy = true;
    try {
      const r = await api.testAiConfig();
      if (r.ok) {
        settingsMsg = '✅ Conexión correcta';
        config = await api.getAiConfig();
      } else {
        settingsErr = r.error || 'No se pudo conectar';
      }
    } catch (e: any) {
      settingsErr = e.message;
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    try {
      await api.deleteAiConfig();
      config = { configured: false };
      messages = [];
      apiKey = '';
      settingsMsg = 'Configuración eliminada';
      showSettings = true;
    } catch (e: any) {
      settingsErr = e.message;
    } finally {
      busy = false;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !pet) return;
    chatErr = '';
    input = '';
    streaming = true;
    const reply: Msg = { id: 'tmp-reply', role: 'assistant', content: '' };
    messages = [...messages, { id: `tmp-${Date.now()}`, role: 'user', content: text }, reply];
    await scrollDown();
    abort = new AbortController();
    try {
      const done = await api.chatStream(
        pet.id,
        text,
        (delta) => {
          reply.content += delta;
          messages = messages;
          scrollDown();
        },
        abort.signal,
      );
      reply.content = done.message.content;
      messages = messages;
      dispatch('bubble', done.message.content);
      dispatch('refreshPet');
    } catch (e: any) {
      if (e.name !== 'AbortError') chatErr = e.message;
      // Se retira el intercambio incompleto: el servidor no lo guardó
      messages = messages.filter((m) => m !== reply && !(m.role === 'user' && m.content === text && m.id.startsWith('tmp-')));
      input = text;
    } finally {
      streaming = false;
      abort = null;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

{#if !pet}
  <p class="muted">Necesitas una mascota para conversar. Eclosiona un huevo primero.</p>
{:else if !loaded}
  <p class="muted">Cargando…</p>
{:else}
  {#if config.configured}
    <div class="bar">
      <span class="badge">🧠 {tier} · {pet.intelligence ?? 0}/1000</span>
      <button class="link" on:click={() => (showSettings = !showSettings)}>
        {showSettings ? 'Ocultar ajustes' : '⚙ Ajustes'}
      </button>
    </div>
  {/if}

  {#if showSettings}
    <div class="settings">
      <label>Proveedor
        <select bind:value={provider}>
          <option value="openai">OpenAI</option>
          <option value="hermes">Hermes Agent (remoto, HTTPS)</option>
          <option value="custom">Otro compatible con OpenAI</option>
        </select>
      </label>
      {#if needsUrl}
        <label>URL base (HTTPS)
          <input type="url" bind:value={baseUrl} placeholder="https://mi-servidor.com/v1" autocomplete="off" />
        </label>
      {/if}
      <label>Modelo {#if provider === 'openai'}<small>(vacío = gpt-4o-mini)</small>{/if}
        <input type="text" bind:value={model} placeholder="gpt-4o-mini" autocomplete="off" />
      </label>
      <label>API key
        <input
          type="password"
          bind:value={apiKey}
          autocomplete="off"
          placeholder={config.hasKey ? `Guardada (${config.keyMask ?? '••••'}) — déjalo vacío para conservarla` : 'sk-…'}
        />
      </label>
      <p class="note">Tu key se cifra en el servidor (AES-256-GCM) y nunca se vuelve a mostrar completa.</p>
      <div class="row">
        <button class="primary" disabled={busy} on:click={save}>Guardar</button>
        {#if config.configured}
          <button disabled={busy} on:click={test}>Probar conexión</button>
          <button class="danger" disabled={busy} on:click={remove}>Eliminar</button>
        {/if}
      </div>
      {#if settingsMsg}<p class="ok">{settingsMsg}</p>{/if}
      {#if settingsErr}<p class="error">{settingsErr}</p>{/if}
    </div>
  {/if}

  {#if config.configured && !showSettings}
    <div class="chat" bind:this={scroller}>
      {#if messages.length === 0}
        <p class="muted">Saluda a {pet.nickname || pet.species?.name} 👋</p>
      {/if}
      {#each messages as m (m.id)}
        <div class="msg {m.role}">{m.content}{#if streaming && m.id === 'tmp-reply' && !m.content}…{/if}</div>
      {/each}
    </div>
    {#if chatErr}<p class="error">{chatErr}</p>{/if}
    <div class="composer">
      <textarea
        rows="2"
        maxlength="1000"
        bind:value={input}
        on:keydown={onKey}
        placeholder="Escribe un mensaje… (Enter para enviar)"
        disabled={streaming}
      ></textarea>
      <button class="primary" disabled={streaming || !input.trim()} on:click={send}>
        {streaming ? '…' : 'Enviar'}
      </button>
    </div>
  {/if}
{/if}

<style>
  .muted { font-size: 12px; opacity: 0.7; margin: 0 0 8px; }
  .note { font-size: 11px; opacity: 0.6; margin: 4px 0; }
  .ok { color: #4ade80; font-size: 12px; margin: 6px 0 0; }
  .error { color: #f87171; font-size: 12px; margin: 6px 0 0; }
  .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .badge { font-size: 12px; background: rgba(56, 189, 248, 0.15); padding: 3px 8px; border-radius: 10px; }
  .link { background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 12px; }
  .settings { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  label small { opacity: 0.6; }
  input, select, textarea {
    background: rgba(15, 23, 42, 0.8); color: inherit; border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px;
  }
  textarea { resize: none; flex: 1; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  button {
    padding: 7px 11px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
    background: rgba(51, 65, 85, 0.9); color: inherit; border: 1px solid rgba(255, 255, 255, 0.12);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.primary { background: #38bdf8; color: #0f172a; border: none; }
  button.danger { color: #f87171; }
  .chat {
    height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
    padding: 8px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); margin-bottom: 8px;
  }
  .msg { max-width: 85%; padding: 6px 10px; border-radius: 12px; font-size: 13px; line-height: 1.35; white-space: pre-wrap; user-select: text; }
  .msg.user { align-self: flex-end; background: #0369a1; }
  .msg.assistant { align-self: flex-start; background: rgba(51, 65, 85, 0.9); }
  .composer { display: flex; gap: 6px; align-items: stretch; }
</style>
