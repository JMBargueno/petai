<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { api } from '../lib/api';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  type Msg = { id: string; role: 'user' | 'assistant'; content: string; notice?: boolean };

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

  // Uso mensual de tokens y cuota
  let usage: Awaited<ReturnType<typeof api.getAiUsage>> | null = null;

  const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

  async function loadUsage() {
    try {
      usage = await api.getAiUsage();
    } catch {
      usage = null;
    }
  }

  // Agente: acciones propuestas por la mascota (requieren confirmación) y recordatorios
  type ActionCard = {
    id: string;
    summary: string;
    state: 'pending' | 'working' | 'done' | 'rejected' | 'error';
    note?: string;
  };
  let actions: ActionCard[] = [];
  let toolHint = '';
  let remOpen = false;
  let reminders: { id: string; text: string; dueAt: string }[] = [];
  let remErr = '';

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

  async function loadPending() {
    if (!pet) return;
    try {
      const rows = await api.getPendingActions(pet.id);
      const known = new Set(actions.map((a) => a.id));
      actions = [
        ...actions,
        ...rows.filter((r) => !known.has(r.id)).map((r) => ({ id: r.id, summary: r.summary, state: 'pending' as const })),
      ];
    } catch {
      /* sin acciones pendientes o sin conexión */
    }
  }

  async function decide(card: ActionCard, accept: boolean) {
    card.state = 'working';
    actions = actions;
    try {
      if (accept) {
        await api.confirmAction(pet.id, card.id);
        card.state = 'done';
        card.note = 'Hecho ✅';
        if (remOpen) loadReminders();
      } else {
        await api.rejectAction(pet.id, card.id);
        card.state = 'rejected';
        card.note = 'Rechazada';
      }
    } catch (e: any) {
      card.state = 'error';
      card.note = e.message;
    }
    actions = actions;
  }

  async function loadReminders() {
    try {
      reminders = await api.listReminders();
      remErr = '';
    } catch (e: any) {
      remErr = e.message;
    }
  }

  async function toggleReminders() {
    remOpen = !remOpen;
    if (remOpen) await loadReminders();
  }

  async function removeReminder(id: string) {
    try {
      await api.deleteReminder(id);
      await loadReminders();
    } catch (e: any) {
      remErr = e.message;
    }
  }

  // Memoria
  let memOpen = false;
  let mem: Awaited<ReturnType<typeof api.getMemories>> | null = null;
  let memErr = '';

  async function loadMemories() {
    if (!pet) return;
    try {
      mem = await api.getMemories(pet.id);
      memErr = '';
    } catch (e: any) {
      memErr = e.message;
    }
  }

  async function toggleMemories() {
    memOpen = !memOpen;
    if (memOpen) await loadMemories();
  }

  async function forget(id: string) {
    try {
      await api.forgetMemory(pet.id, id);
      await loadMemories();
    } catch (e: any) {
      memErr = e.message;
    }
  }

  async function forgetAll() {
    if (!confirm('¿Borrar todos los recuerdos de tu mascota? No se puede deshacer.')) return;
    try {
      await api.forgetAllMemories(pet.id);
      await loadMemories();
    } catch (e: any) {
      memErr = e.message;
    }
  }

  $: needsUrl = provider !== 'openai';
  $: tier = (pet?.intelligence ?? 0) >= 500 ? 'Agente' : (pet?.intelligence ?? 0) >= 200 ? 'Memoria' : 'Charla';

  onMount(async () => {
    await loadConfig();
    if (config.configured && pet) {
      await loadHistory();
      await loadPending();
      loadUsage();
    }
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
    // Id único por respuesta: los avisos de moderación se quedan en pantalla y no deben chocar entre sí
    const reply: Msg = { id: `tmp-reply-${Date.now()}`, role: 'assistant', content: '' };
    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: 'user', content: text };
    let moderated = false;
    messages = [...messages, userMsg, reply];
    await scrollDown();
    abort = new AbortController();
    toolHint = '';
    try {
      const done = await api.chatStream(
        pet.id,
        text,
        {
          onDelta: (delta) => {
            toolHint = '';
            reply.content += delta;
            messages = messages;
            scrollDown();
          },
          onModerated: (m) => {
            moderated = true;
            reply.content = m.message;
            reply.notice = true;
            if (m.hideUserMessage) {
              // El texto con datos sensibles no se conserva ni en pantalla
              messages = messages.filter((x) => x.id !== userMsg.id);
              input = '';
            }
            messages = messages;
            scrollDown();
          },
          onTool: () => {
            toolHint = '🔍 Consultando…';
          },
          onAction: (a) => {
            actions = [...actions, { id: a.id, summary: a.summary, state: 'pending' }];
            scrollDown();
          },
        },
        abort.signal,
      );
      if ('moderated' in done) {
        // Aviso de moderación: no es una respuesta de la mascota ni queda en el historial
        return;
      }
      reply.content = done.message.content;
      messages = messages;
      dispatch('bubble', done.message.content);
      dispatch('refreshPet');
      loadUsage();
      // La extracción de recuerdos se hace en segundo plano en el servidor
      if (memOpen) setTimeout(loadMemories, 3000);
    } catch (e: any) {
      if (e.name !== 'AbortError') chatErr = e.message;
      // Se retira el intercambio incompleto: el servidor no lo guardó
      messages = messages.filter((m) => m !== reply && m !== userMsg);
      input = text;
      if (/cuota/i.test(e.message)) loadUsage();
    } finally {
      streaming = false;
      toolHint = '';
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

  {#if config.configured && usage}
    <p class="usage" class:full={usage.quota !== null && (usage.remaining ?? 1) <= 0}>
      📊 Este mes: {fmtTokens(usage.tokens)} tokens{usage.quota !== null ? ` de ${fmtTokens(usage.quota)}` : ' (sin límite)'}
      {#if usage.quota !== null && (usage.remaining ?? 1) <= 0} — cuota agotada, se renueva el día 1{/if}
    </p>
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
        <div class="msg {m.role}" class:notice={m.notice}>{m.content}{#if streaming && m.id.startsWith('tmp-reply') && !m.content}…{/if}</div>
      {/each}
      {#if toolHint}<div class="hint">{toolHint}</div>{/if}
      {#each actions as a (a.id)}
        <div class="card" class:done={a.state === 'done'} class:bad={a.state === 'error'}>
          <div class="card-title">🛠 Tu mascota quiere hacer algo</div>
          <div class="card-body">{a.summary}</div>
          {#if a.state === 'pending' || a.state === 'working'}
            <div class="row">
              <button class="primary" disabled={a.state === 'working'} on:click={() => decide(a, true)}>Confirmar</button>
              <button disabled={a.state === 'working'} on:click={() => decide(a, false)}>Rechazar</button>
            </div>
          {:else}
            <div class="card-note">{a.note}</div>
          {/if}
        </div>
      {/each}
    </div>
    {#if chatErr}<p class="error">{chatErr}</p>{/if}
    {#if (pet.intelligence ?? 0) >= 500}
      <div class="memory">
        <button class="link" on:click={toggleReminders}>⏰ Recordatorios {remOpen ? '▾' : '▸'}</button>
        {#if remOpen}
          {#if remErr}<p class="error">{remErr}</p>{/if}
          {#if reminders.length === 0}
            <p class="muted">No hay recordatorios pendientes. Pídele a tu mascota que te recuerde algo.</p>
          {:else}
            <ul class="mem-list">
              {#each reminders as r (r.id)}
                <li>
                  <span>⏰ {r.text} <em>— {fmt(r.dueAt)}</em></span>
                  <button class="x" title="Eliminar" on:click={() => removeReminder(r.id)}>✕</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {:else}
      <p class="muted">🔒 Con 500 de inteligencia tu mascota podrá usar herramientas y crear recordatorios.</p>
    {/if}
    <div class="memory">
      <button class="link" on:click={toggleMemories}>
        🗂 Recuerdos {memOpen ? '▾' : '▸'}
      </button>
      {#if memOpen}
        {#if memErr}<p class="error">{memErr}</p>{/if}
        {#if mem && !mem.unlocked}
          <p class="muted">
            🔒 La memoria se desbloquea con {mem.unlockAt} de inteligencia (ahora {mem.intelligence}). Sigue charlando.
          </p>
        {:else if mem && mem.memories.length === 0}
          <p class="muted">Todavía no recuerda nada. Tras unas cuantas charlas empezará a hacerlo.</p>
        {:else if mem}
          <ul class="mem-list">
            {#each mem.memories as m (m.id)}
              <li class:summary={m.kind === 'summary'}>
                <span>{m.kind === 'summary' ? '📝 ' : '💭 '}{m.content}</span>
                <button class="x" title="Olvidar" on:click={() => forget(m.id)}>✕</button>
              </li>
            {/each}
          </ul>
          <button class="danger small" on:click={forgetAll}>Olvidar todo</button>
        {/if}
      {/if}
    </div>
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
  .msg.notice { background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.45); }
  .usage { font-size: 11px; opacity: 0.7; margin: 0 0 6px; }
  .usage.full { color: #f87171; opacity: 1; }
  .composer { display: flex; gap: 6px; align-items: stretch; }
  .memory { margin-bottom: 8px; }
  .hint { align-self: flex-start; font-size: 12px; opacity: 0.7; }
  .card {
    align-self: stretch; padding: 8px 10px; border-radius: 10px; font-size: 12px;
    background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.45);
  }
  .card.done { background: rgba(34, 197, 94, 0.12); border-color: rgba(34, 197, 94, 0.45); }
  .card.bad { background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.45); }
  .card-title { font-weight: 700; margin-bottom: 3px; }
  .card-body { margin-bottom: 6px; user-select: text; }
  .card-note { opacity: 0.85; }
  .mem-list { list-style: none; margin: 6px 0; padding: 0; max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .mem-list li { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; background: rgba(15, 23, 42, 0.6); padding: 4px 8px; border-radius: 8px; user-select: text; }
  .mem-list li.summary { opacity: 0.75; font-style: italic; }
  .x { background: none; border: none; padding: 0 4px; opacity: 0.6; }
  .x:hover { opacity: 1; color: #f87171; }
  .small { padding: 4px 8px; font-size: 11px; }
</style>
