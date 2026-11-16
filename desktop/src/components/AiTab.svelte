<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { api } from '../lib/api';
  import {
    isLoopbackUrl,
    loadLocalConfig,
    saveLocalConfig,
    streamLocalCompletion,
    testLocalHermes,
    type LocalHermesConfig,
  } from '../lib/hermesLocal';
  import { CLIENT_TOOLS, openUrl, readClipboardText } from '../lib/clientTools';
  import { buildClientContext } from '../lib/deskContext';
  import { setSkillAuthorization } from '../lib/stores/desktopSkillsStore';
  import { startPomodoro, stopPomodoro } from '../lib/pomodoro';
  import { toSpeakable } from '../lib/speech-queue';
  import { getSocket } from '../lib/socket';

  export let pet: any = null;
  /** Mensaje a enviar en cuanto el chat esté listo (p. ej. al soltar un archivo sobre la mascota). */
  export let pendingPrompt: { text: string; n: number } | null = null;

  const dispatch = createEventDispatcher();

  // `thinking`: razonamiento del modelo, aparte de la respuesta; solo se muestra plegado al terminar
  type Msg = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    notice?: boolean;
    thinking?: string;
    thinkingOpen?: boolean;
  };

  function toggleThinking(m: Msg) {
    m.thinkingOpen = !m.thinkingOpen;
    messages = messages;
  }

  let loaded = false;
  let config: any = { configured: false, mode: 'managed' };
  let showSettings = false;

  // Modos: 'managed' (IA de Pockai), 'byok' (Mi propia clave), 'local' (Hermes local)
  let activeMode: 'managed' | 'byok' | 'local' = 'managed';

  // Suscripción y cuota
  let entitlement: Awaited<ReturnType<typeof api.getBillingEntitlement>> | null = null;
  let showPaywall = false;
  let paywallBusy = false;
  let paywallErr = '';

  // Formulario de ajustes BYOK
  let provider = 'openai';
  let baseUrl = '';
  let model = '';
  let apiKey = '';
  let settingsMsg = '';
  let settingsErr = '';
  let busy = false;

  // Modo Hermes local (la inferencia la hace un Hermes en este equipo; ver lib/hermesLocal.ts)
  let local: LocalHermesConfig = loadLocalConfig();
  let localMsg = '';
  let localErr = '';

  // Uso mensual y cuota diaria
  let usage: Awaited<ReturnType<typeof api.getAiUsage>> | null = null;

  $: isManaged = activeMode === 'managed';
  $: isPro = (usage?.plan === 'pro') || (entitlement?.plan === 'pro');
  $: dailyLimit = usage?.daily?.limit ?? (isPro ? 200 : 15);
  $: dailyUsed = usage?.daily?.used ?? 0;
  $: dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  $: maxChars = isManaged ? 240 : 1000;
  $: quotaExceeded = isManaged && dailyRemaining <= 0;
  $: chatReady = isManaged || (activeMode === 'byok' && config.configured) || (activeMode === 'local' && local.enabled);

  // Chat
  let messages: Msg[] = [];
  let input = '';
  let streaming = false;
  let chatErr = '';
  let scroller: HTMLElement;
  let abort: AbortController | null = null;

  const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

  async function loadUsage() {
    try {
      usage = await api.getAiUsage();
    } catch {
      usage = null;
    }
  }

  async function loadEntitlement() {
    try {
      entitlement = await api.getBillingEntitlement();
    } catch {
      entitlement = null;
    }
  }

  // Precio de Pro configurado en el panel de facturación (nunca fijo en el cliente)
  let proPriceLabel = '';
  async function loadProPrice() {
    try {
      const plans = await api.getBillingPlans();
      const usd = plans?.plans?.pro?.priceUsd;
      if (typeof usd === 'number' && usd > 0) {
        proPriceLabel = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(usd);
      }
    } catch {
      proPriceLabel = '';
    }
  }

  async function subscribePro() {
    paywallBusy = true;
    paywallErr = '';
    try {
      const res = await api.createStripeCheckout();
      if (res?.url) {
        await openUrl(res.url);
      }
    } catch (e: any) {
      paywallErr = e.message || 'Error iniciando suscripción';
    } finally {
      paywallBusy = false;
    }
  }

  async function openPortal() {
    paywallBusy = true;
    paywallErr = '';
    try {
      const res = await api.createStripePortal();
      if (res?.url) {
        await openUrl(res.url);
      }
    } catch (e: any) {
      paywallErr = e.message || 'Error abriendo portal de facturación';
    } finally {
      paywallBusy = false;
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
    let followUp = '';
    try {
      if (accept) {
        const res = await api.confirmAction(pet.id, card.id);
        if (res.clientSide) {
          if (res.tool === 'open_url') {
            await openUrl(res.args.url);
            card.note = 'Abierto en tu navegador';
          } else if (res.tool === 'toggle_desktop_skill') {
            setSkillAuthorization(res.args.skill_id, !!res.args.enabled, pet.id);
            card.note = res.args.enabled ? 'Habilidad activada' : 'Habilidad desactivada';
          } else if (res.tool === 'start_pomodoro') {
            startPomodoro(res.args.work_minutes, res.args.break_minutes);
            card.note = `Pomodoro de ${res.args.work_minutes} min en marcha`;
          } else if (res.tool === 'stop_pomodoro') {
            stopPomodoro();
            card.note = 'Pomodoro detenido';
          } else if (res.tool === 'read_clipboard') {
            const text = (await readClipboardText()).trim();
            if (!text) {
              card.note = 'El portapapeles está vacío';
            } else {
              card.note = 'Compartido con tu mascota';
              followUp = `Esto es lo que tengo en el portapapeles:\n"""\n${text.slice(0, 800)}\n"""`;
            }
          }
          card.state = 'done';
        } else {
          card.state = 'done';
          card.note = 'Hecho';
          if (remOpen) loadReminders();
          dispatch('refreshPet');
        }
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
    if (followUp) await send(followUp);
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

  let confirmForgetAll = false;
  let confirmForgetTimer: ReturnType<typeof setTimeout> | null = null;

  async function forgetAll() {
    if (!confirmForgetAll) {
      confirmForgetAll = true;
      confirmForgetTimer = setTimeout(() => (confirmForgetAll = false), 4000);
      return;
    }
    confirmForgetAll = false;
    if (confirmForgetTimer) clearTimeout(confirmForgetTimer);
    try {
      await api.forgetAllMemories(pet.id);
      await loadMemories();
    } catch (e: any) {
      memErr = e.message;
    }
  }

  let lastPromptN = 0;
  $: if (pendingPrompt && pendingPrompt.n !== lastPromptN && loaded && pet && !streaming) {
    lastPromptN = pendingPrompt.n;
    dispatch('promptConsumed', pendingPrompt.n);
    if (chatReady) send(pendingPrompt.text);
    else input = pendingPrompt.text;
  }

  $: needsUrl = provider !== 'openai';
  $: tier = (pet?.intelligence ?? 0) >= 500 ? 'Agente' : (pet?.intelligence ?? 0) >= 200 ? 'Memoria' : 'Charla';

  function handleEntitlementUpdated() {
    loadEntitlement();
    loadUsage();
    loadConfig();
  }

  function handleFocus() {
    loadEntitlement();
    loadUsage();
  }

  onMount(async () => {
    await loadConfig();
    await loadEntitlement();
    void loadProPrice();
    if (chatReady && pet) {
      await loadHistory();
      if (!local.enabled) {
        await loadPending();
        await loadUsage();
      }
    }
    loaded = true;

    const s = getSocket();
    s?.on('entitlement:updated', handleEntitlementUpdated);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }
  });

  onDestroy(() => {
    abort?.abort();
    const s = getSocket();
    s?.off('entitlement:updated', handleEntitlementUpdated);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
    }
  });

  async function loadConfig() {
    try {
      config = await api.getAiConfig();
      if (local.enabled) {
        activeMode = 'local';
      } else if (config.mode === 'byok' && config.configured) {
        activeMode = 'byok';
        provider = config.provider || 'openai';
        baseUrl = config.baseUrl || '';
        model = config.model || '';
      } else {
        activeMode = 'managed';
      }
    } catch (e: any) {
      settingsErr = e.message;
    }
  }

  async function setMode(mode: 'managed' | 'byok' | 'local') {
    activeMode = mode;
    if (mode === 'managed') {
      local.enabled = false;
      saveLocalConfig(local);
      try {
        await api.saveAiConfig({ mode: 'managed' });
        await loadConfig();
        await loadUsage();
      } catch (e: any) {
        settingsErr = e.message;
      }
    } else if (mode === 'local') {
      local.enabled = true;
      saveLocalConfig(local);
      showSettings = true;
    } else if (mode === 'byok') {
      local.enabled = false;
      saveLocalConfig(local);
      showSettings = true;
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
      const cleanUrl = baseUrl?.trim().replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
      config = await api.saveAiConfig({
        mode: 'byok',
        provider,
        baseUrl: needsUrl ? cleanUrl : undefined,
        model: model?.trim() || undefined,
        apiKey: apiKey?.trim() || undefined,
      });
      activeMode = 'byok';
      if (needsUrl) baseUrl = cleanUrl;
      apiKey = '';
      settingsMsg = 'Guardado. Pulsa "Probar conexión" para comprobarlo.';
      if (pet) await loadHistory();
      await loadUsage();
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
        settingsMsg = 'Conexión correcta';
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
      config = { configured: false, mode: 'managed' };
      activeMode = 'managed';
      apiKey = '';
      settingsMsg = 'Se volvió a la IA de Pockai';
      await loadUsage();
    } catch (e: any) {
      settingsErr = e.message;
    } finally {
      busy = false;
    }
  }

  function applyModeration(
    m: { message: string; hideUserMessage: boolean },
    reply: Msg,
    userMsg: Msg,
  ) {
    reply.content = m.message;
    reply.notice = true;
    if (m.hideUserMessage) {
      messages = messages.filter((x) => x.id !== userMsg.id);
      input = '';
    }
    messages = messages;
    scrollDown();
  }

  async function runLocal(text: string, reply: Msg, userMsg: Msg, signal: AbortSignal) {
    const ctx = await api.localChatContext(pet.id, text, buildClientContext());
    if ('moderated' in ctx) {
      applyModeration(ctx.moderated, reply, userMsg);
      return { moderated: true as const };
    }
    let acc = '';
    const result = await streamLocalCompletion(local, ctx.messages, ctx.maxTokens, (d) => {
      acc += d;
      reply.content = acc;
      messages = messages;
      scrollDown();
    }, signal);
    const synced = await api.localChatSync(pet.id, ctx.turnId, result.reply);
    if ('moderated' in synced) {
      applyModeration(synced.moderated, reply, userMsg);
      return { moderated: true as const };
    }
    return { ...synced, message: { ...synced.message, thinking: result.thinking || undefined } };
  }

  async function send(override?: string) {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || streaming || !pet) return;

    if (isManaged && quotaExceeded) {
      showPaywall = true;
      return;
    }

    chatErr = '';
    input = '';
    streaming = true;
    const reply: Msg = { id: `tmp-reply-${Date.now()}`, role: 'assistant', content: '' };
    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: 'user', content: text };
    messages = [...messages, userMsg, reply];
    await scrollDown();
    abort = new AbortController();
    toolHint = '';
    try {
      const done = local.enabled
        ? await runLocal(text, reply, userMsg, abort.signal)
        : await api.chatStream(
        pet.id,
        text,
        CLIENT_TOOLS,
        {
          onDelta: (delta) => {
            toolHint = '';
            reply.content += delta;
            messages = messages;
            scrollDown();
          },
          onModerated: (m) => {
            applyModeration(m, reply, userMsg);
          },
          onTool: () => {
            toolHint = 'Consultando…';
          },
          onAction: (a) => {
            actions = [...actions, { id: a.id, summary: a.summary, state: 'pending' }];
            scrollDown();
          },
        },
        abort.signal,
        buildClientContext(),
      );
      if ('moderated' in done) {
        return;
      }
      reply.content = done.message.content;
      reply.thinking = done.message.thinking || undefined;
      reply.thinkingOpen = false;
      messages = messages;
      const spoken = toSpeakable(done.message.content);
      if (spoken) dispatch('bubble', spoken);
      dispatch('refreshPet');
      if (!local.enabled) loadUsage();
      if (memOpen && !local.enabled) setTimeout(loadMemories, 3000);
    } catch (e: any) {
      if (e.name !== 'AbortError') chatErr = e.message;
      messages = messages.filter((m) => m !== reply && m !== userMsg);
      input = text;
      if (/cuota|quota|429/i.test(e.message)) {
        loadUsage();
        showPaywall = true;
      }
    } finally {
      streaming = false;
      toolHint = '';
      abort = null;
    }
  }

  function saveLocal() {
    localErr = '';
    localMsg = '';
    if (!isLoopbackUrl(local.baseUrl)) {
      localErr = 'La URL debe ser http(s) a 127.0.0.1 o localhost';
      return;
    }
    if (!local.model.trim()) {
      localErr = 'Indica el modelo';
      return;
    }
    saveLocalConfig(local);
    localMsg = local.enabled ? 'Guardado. El chat usará tu Hermes local.' : 'Guardado.';
    local = local;
    if (local.enabled && pet && messages.length === 0) loadHistory();
  }

  async function testLocal() {
    localErr = '';
    localMsg = '';
    busy = true;
    try {
      await testLocalHermes(local);
      localMsg = 'Hermes local responde';
    } catch (e: any) {
      localErr = e.message;
    } finally {
      busy = false;
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
  {#if chatReady}
    <div class="bar">
      <div class="bar-left">
        <span class="badge"><Ico n="brain" /> {tier} · {pet.intelligence ?? 0}/1000</span>
        <select
          class="mode-select"
          value={activeMode}
          on:change={(e) => setMode(e.currentTarget.value)}
        >
          <option value="managed">IA de Pockai</option>
          <option value="byok">Mi propia clave</option>
          <option value="local">Hermes local</option>
        </select>
      </div>

      <div class="bar-right">
        {#if isManaged}
          {#if isPro}
            <span class="badge pro-badge" title="Suscripción Pro activa"><Ico n="star" /> Pro · {dailyRemaining}/{dailyLimit}</span>
            <button class="link-btn" title="Gestionar suscripción" on:click={openPortal}>Gestionar</button>
          {:else}
            <span class="badge quota-badge" class:quota-empty={dailyRemaining <= 0} title="Mensajes restantes hoy (se renuevan a medianoche)">
              {dailyRemaining}/{dailyLimit} hoy
            </span>
            <button class="link-btn pro-btn" on:click={() => (showPaywall = true)}>⭐ Hazte Pro</button>
          {/if}
        {/if}

        <button class="link" on:click={() => (showSettings = !showSettings)}>
          {#if showSettings}Ocultar{:else}<Ico n="settings" /> Ajustes{/if}
        </button>
      </div>
    </div>
  {/if}

  {#if isManaged && !showSettings}
    <div class="managed-info-bar">
      <span>Te quedan <strong>{dailyRemaining} de {dailyLimit}</strong> mensajes hoy · se renuevan a medianoche.</span>
      {#if !isPro}
        <button class="upgrade-chip" on:click={() => (showPaywall = true)}>Subir a 200/día con Pro</button>
      {/if}
    </div>
  {/if}

  {#if showSettings}
    <div class="settings">
      {#if activeMode === 'managed'}
        <div class="managed-settings-box">
          <strong><Ico n="star" /> IA de Pockai (Gestionada)</strong>
          <p class="note">
            Conversa directamente con tu mascota sin necesidad de crear cuentas externas ni introducir claves.
            El servidor gestiona la IA con OpenRouter y optimización automática.
          </p>
          <div class="managed-plan-status">
            {#if isPro}
              <p class="ok"><strong>Plan Pro activo:</strong> 200 mensajes diarios y herramientas de agente habilitadas.</p>
              <button class="primary" on:click={openPortal}>Gestionar suscripción en Stripe</button>
            {:else}
              <p><strong>Plan Gratuito:</strong> 15 mensajes diarios con respuestas concisas.</p>
              <button class="primary" on:click={() => (showPaywall = true)}>⭐ Hazte Pro (200 mensajes/día)</button>
            {/if}
          </div>
        </div>
      {:else if activeMode === 'byok'}
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
        <p class="note">Tu key se cifra en el servidor (AES-256-GCM) y nunca se vuelve a mostrar completa. Sin límites diarios en Pockai.</p>
        <div class="row">
          <button class="primary" disabled={busy} on:click={save}>Guardar</button>
          {#if config.configured}
            <button disabled={busy} on:click={test}>Probar conexión</button>
            <button class="danger" disabled={busy} on:click={remove}>Volver a IA de Pockai</button>
          {/if}
        </div>
        {#if settingsMsg}<p class="ok">{settingsMsg}</p>{/if}
        {#if settingsErr}<p class="error">{settingsErr}</p>{/if}
      {:else}
        <div class="local-box">
          <strong><Ico n="monitor" /> Hermes local (este equipo)</strong>
          <p class="note">
            Conversa con un Hermes Agent que corre en tu ordenador, sin gastar tu key ni salir a internet. Los ajustes
            se guardan solo aquí. El servidor sigue creando la personalidad, moderando y guardando el historial.
            Limitaciones: sin herramientas de agente y sin nuevos recuerdos automáticos.
          </p>
          <label class="check">
            <input type="checkbox" bind:checked={local.enabled} />
            Usar mi Hermes local para conversar
          </label>
          <label>URL (127.0.0.1 o localhost)
            <input type="url" bind:value={local.baseUrl} placeholder="http://127.0.0.1:8642/v1" autocomplete="off" />
          </label>
          <label>Modelo
            <input type="text" bind:value={local.model} placeholder="hermes-agent" autocomplete="off" />
          </label>
          <label>API_SERVER_KEY <small>(si tu Hermes la exige)</small>
            <input type="password" bind:value={local.apiKey} autocomplete="off" placeholder="opcional" />
          </label>
          <div class="row">
            <button class="primary" on:click={saveLocal}>Guardar local</button>
            <button disabled={busy} on:click={testLocal}>Probar Hermes local</button>
          </div>
          {#if localMsg}<p class="ok">{localMsg}</p>{/if}
          {#if localErr}<p class="error">{localErr}</p>{/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if chatReady && !showSettings}
    {#if local.enabled}
      <p class="usage"><Ico n="monitor" /> Modo Hermes local: tu mascota responde con el modelo de este equipo (sin herramientas ni recordatorios nuevos).</p>
    {/if}
    <div class="chat" bind:this={scroller}>
      {#if messages.length === 0}
        <p class="muted">Saluda a {pet.nickname || pet.species?.name} </p>
      {/if}
      {#each messages as m (m.id)}
        {#if m.role === 'assistant' && m.thinking}
          <div class="thinking" data-testid="thinking">
            <button
              type="button"
              class="thinking-toggle"
              aria-expanded={!!m.thinkingOpen}
              on:click={() => toggleThinking(m)}
            >
              <Ico n={m.thinkingOpen ? 'down' : 'right'} size={12} />
              {m.thinkingOpen ? 'Ocultar razonamiento' : 'Ver razonamiento'}
            </button>
            {#if m.thinkingOpen}
              <div class="thinking-body">{m.thinking}</div>
            {/if}
          </div>
        {/if}
        <div class="msg {m.role}" class:notice={m.notice}>{m.content}{#if streaming && m.id.startsWith('tmp-reply') && !m.content}…{/if}</div>
      {/each}
      {#if toolHint}<div class="hint">{toolHint}</div>{/if}
      {#each actions as a (a.id)}
        <div class="card" class:done={a.state === 'done'} class:bad={a.state === 'error'}>
          <div class="card-title"><Ico n="tool" /> Tu mascota quiere hacer algo</div>
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
        <button class="link" on:click={toggleReminders}><Ico n="alarm" /> Recordatorios {remOpen ? '▾' : '▸'}</button>
        {#if remOpen}
          {#if remErr}<p class="error">{remErr}</p>{/if}
          {#if reminders.length === 0}
            <p class="muted">No hay recordatorios pendientes. Pídele a tu mascota que te recuerde algo.</p>
          {:else}
            <ul class="mem-list">
              {#each reminders as r (r.id)}
                <li>
                  <span><Ico n="alarm" /> {r.text} <em>— {fmt(r.dueAt)}</em></span>
                  <button class="x" title="Eliminar" on:click={() => removeReminder(r.id)}>✕</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    {:else}
      <p class="muted"><Ico n="lock" /> Con 500 de inteligencia tu mascota podrá usar herramientas y crear recordatorios.</p>
    {/if}
    <div class="memory">
      <button class="link" on:click={toggleMemories}>
        <Ico n="folder" /> Recuerdos {memOpen ? '▾' : '▸'}
      </button>
      {#if memOpen}
        {#if memErr}<p class="error">{memErr}</p>{/if}
        {#if mem && !mem.unlocked}
          <p class="muted">
            <Ico n="lock" /> La memoria se desbloquea con {mem.unlockAt} de inteligencia (ahora {mem.intelligence}). Sigue charlando.
          </p>
        {:else if mem && mem.memories.length === 0}
          <p class="muted">Todavía no recuerda nada. Tras unas cuantas charlas empezará a hacerlo.</p>
        {:else if mem}
          <ul class="mem-list">
            {#each mem.memories as m (m.id)}
              <li class:summary={m.kind === 'summary'}>
                <span><Ico n={m.kind === 'summary' ? 'note' : m.kind === 'habit' ? 'monitor' : 'chat'} /> {m.kind === 'habit' ? 'Hábito: ' : ''}{m.content}</span>
                <button class="x" title="Olvidar" on:click={() => forget(m.id)}>✕</button>
              </li>
            {/each}
          </ul>
          <button class="danger small" on:click={forgetAll}>{confirmForgetAll ? '¿Seguro? No se puede deshacer: pulsa otra vez' : 'Olvidar todo'}</button>
        {/if}
      {/if}
    </div>

    <!-- Compositor de mensajes y Paywall -->
    <div class="composer-container">
      {#if isManaged && quotaExceeded}
        <div class="paywall-banner">
          <p><strong>Límite diario alcanzado ({dailyLimit} mensajes).</strong> Se renueva a medianoche.</p>
          <div class="row">
            <button class="primary" on:click={() => (showPaywall = true)}>⭐ Hazte Pro (200 mensajes/día)</button>
            <button on:click={() => setMode('byok')}>Usar mi clave gratis</button>
          </div>
        </div>
      {:else}
        <div class="composer">
          <div class="textarea-wrapper">
            <textarea
              rows="2"
              maxlength={maxChars}
              bind:value={input}
              on:keydown={onKey}
              placeholder={isManaged ? "Escribe un mensaje… (máx. 240 caracteres)" : "Escribe un mensaje… (Enter para enviar)"}
              disabled={streaming}
            ></textarea>
            {#if isManaged}
              <span class="char-count" class:near-limit={input.length >= maxChars - 20}>
                {input.length}/{maxChars}
              </span>
            {/if}
          </div>
          <button class="primary send-btn" disabled={streaming || !input.trim() || (isManaged && quotaExceeded)} on:click={() => send()}>
            {streaming ? '…' : 'Enviar'}
          </button>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<!-- Modal de Paywall / Suscripción Pro -->
{#if showPaywall}
  <div
    class="paywall-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    on:click|self={() => (showPaywall = false)}
    on:keydown={(e) => e.key === 'Escape' && (showPaywall = false)}
  >
    <div class="paywall-modal">
      <div class="paywall-top">
        <h3>⭐ Pockai Pro</h3>
        <button class="x" on:click={() => (showPaywall = false)}>✕</button>
      </div>
      <p class="paywall-desc">
        Desbloquea el máximo potencial de tu mascota sin interrupciones con Pockai Pro:
      </p>
      <ul class="paywall-perks">
        <li>✨ <strong>200 mensajes diarios</strong> de IA de alta calidad (vs 15 en Free).</li>
        <li>🛠️ <strong>Herramientas de agente desbloqueadas:</strong> recordatorios, abrir enlaces y más.</li>
        <li>🧠 <strong>Respuestas y memoria ampliadas:</strong> contexto más profundo y mayor riqueza de personalidad.</li>
        <li>⚡ <strong>Prioridad de servicio:</strong> menor latencia y modelos de reserva automáticos.</li>
      </ul>

      {#if paywallErr}
        <p class="error">{paywallErr}</p>
      {/if}

      <div class="paywall-cta">
        {#if isPro}
          <button class="primary btn-large" disabled={paywallBusy} on:click={openPortal}>
            {paywallBusy ? 'Cargando portal…' : 'Gestionar suscripción en Stripe'}
          </button>
        {:else}
          <button class="primary btn-large" disabled={paywallBusy} on:click={subscribePro}>
            {paywallBusy ? 'Abriendo Stripe Checkout…' : (proPriceLabel ? `Hazte Pro por ${proPriceLabel}/mes` : 'Hazte Pro')}
          </button>
        {/if}
        <button class="btn-secondary" on:click={() => { showPaywall = false; setMode('byok'); }}>
          Prefiero usar mi propia API key gratis
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .muted { font-size: 12px; opacity: 0.7; margin: 0 0 8px; }
  .local-box, .managed-settings-box { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding: 10px; border-radius: var(--radius-2xl); border: 1px dashed var(--line-soft); }
  .managed-plan-status { margin-top: 8px; }
  .check { flex-direction: row; align-items: center; gap: 6px; }
  .note { font-size: 11px; opacity: 0.6; margin: 4px 0; }
  .ok { color: var(--success-ink); font-size: 12px; margin: 6px 0 0; }
  .error { color: var(--danger-ink); font-size: 12px; margin: 6px 0 0; }
  .bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 6px; }
  .bar-left, .bar-right { display: flex; align-items: center; gap: 6px; }
  .badge { font-size: 11px; background: color-mix(in srgb, var(--accent) 15%, var(--surface)); padding: 3px 8px; border-radius: var(--radius-2xl); white-space: nowrap; }
  .pro-badge { background: #1e1b4b; color: #a5b4fc; border: 1px solid #4338ca; font-weight: 600; }
  .quota-badge { background: var(--surface-2); border: 1px solid var(--line-soft); }
  .quota-empty { border-color: var(--danger-ink); color: var(--danger-ink); }
  .link { background: none; border: none; color: var(--accent-ink); cursor: pointer; font-size: 12px; }
  .link-btn { background: none; border: none; font-size: 11px; cursor: pointer; color: var(--accent-ink); text-decoration: underline; padding: 2px 4px; }
  .pro-btn { color: #f59e0b; font-weight: 600; }
  .mode-select { font-size: 11px; padding: 2px 6px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface-2); color: inherit; }
  .managed-info-bar { font-size: 11px; padding: 4px 8px; background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border-radius: var(--radius-2xl); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .upgrade-chip { font-size: 10px; font-weight: 600; background: #4f46e5; color: white; border: none; border-radius: 999px; padding: 2px 8px; cursor: pointer; }
  .settings { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  label small { opacity: 0.6; }
  input, select, textarea {
    background: var(--surface-2); color: inherit; border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl); padding: 7px 9px; font: inherit; font-size: 13px;
  }
  textarea { resize: none; width: 100%; box-sizing: border-box; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; }
  button {
    padding: 7px 11px; border-radius: var(--radius-2xl); cursor: pointer; font-size: 12px; font-weight: 600;
    background: var(--surface-2); color: inherit; border: 1px solid var(--line-soft);
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.primary { background: var(--accent); color: var(--on-color); border: none; }
  button.danger { color: var(--danger-ink); }
  .chat {
    height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
    padding: 8px; border-radius: var(--radius-2xl); background: var(--surface-2); margin-bottom: 8px;
  }
  .msg { max-width: 85%; padding: 6px 10px; border-radius: var(--radius-2xl); font-size: 13px; line-height: 1.35; white-space: pre-wrap; user-select: text; }
  .msg.user { align-self: flex-end; background: #0369a1; }
  .msg.assistant { align-self: flex-start; background: var(--surface-2); }
  .msg.notice { background: color-mix(in srgb, var(--color-sunburst) 14%, var(--surface)); border: 1px solid var(--color-sunburst); }
  .thinking { align-self: flex-start; max-width: 85%; display: flex; flex-direction: column; gap: 4px; margin-bottom: -2px; }
  .thinking-toggle {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 6px; font-size: 11px; font-weight: 500; opacity: 0.7;
    background: none; border: none; color: inherit;
  }
  .thinking-toggle:hover { opacity: 1; }
  .thinking-body {
    padding: 6px 10px; font-size: 12px; line-height: 1.35; white-space: pre-wrap; user-select: text;
    opacity: 0.75; font-style: italic; border-left: 2px solid var(--line-soft); max-height: 160px; overflow-y: auto;
  }
  .usage { font-size: 11px; opacity: 0.7; margin: 0 0 6px; }
  .composer-container { margin-top: 4px; }
  .composer { display: flex; gap: 6px; align-items: stretch; }
  .textarea-wrapper { flex: 1; position: relative; display: flex; }
  .char-count { position: absolute; right: 8px; bottom: 4px; font-size: 10px; opacity: 0.5; pointer-events: none; }
  .char-count.near-limit { color: var(--danger-ink); opacity: 1; font-weight: bold; }
  .send-btn { min-width: 60px; }
  .paywall-banner {
    padding: 10px; background: color-mix(in srgb, var(--color-sunburst) 12%, var(--surface));
    border: 1px solid var(--color-sunburst); border-radius: var(--radius-2xl); font-size: 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .paywall-banner p { margin: 0; }
  .memory { margin-bottom: 8px; }
  .hint { align-self: flex-start; font-size: 12px; opacity: 0.7; }
  .card {
    align-self: stretch; padding: 8px 10px; border-radius: var(--radius-2xl); font-size: 12px;
    background: color-mix(in srgb, var(--color-sunburst) 12%, var(--surface)); border: 1px solid var(--color-sunburst);
  }
  .card.done { background: color-mix(in srgb, var(--success) 12%, var(--surface)); border-color: var(--success); }
  .card.bad { background: color-mix(in srgb, var(--danger) 12%, var(--surface)); border-color: var(--danger); }
  .card-title { font-weight: 700; margin-bottom: 3px; }
  .card-body { margin-bottom: 6px; user-select: text; }
  .card-note { opacity: 0.85; }
  .mem-list { list-style: none; margin: 6px 0; padding: 0; max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .mem-list li { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; background: var(--surface-2); padding: 4px 8px; border-radius: var(--radius-2xl); user-select: text; }
  .mem-list li.summary { opacity: 0.75; font-style: italic; }
  .x { background: none; border: none; padding: 0 4px; opacity: 0.6; cursor: pointer; }
  .x:hover { opacity: 1; color: var(--danger-ink); }
  .small { padding: 4px 8px; font-size: 11px; }

  /* Modal Paywall */
  .paywall-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center;
    z-index: 999; padding: 16px;
  }
  .paywall-modal {
    background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--radius-2xl);
    max-width: 380px; width: 100%; padding: 18px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    display: flex; flex-direction: column; gap: 12px;
  }
  .paywall-top { display: flex; justify-content: space-between; align-items: center; }
  .paywall-top h3 { margin: 0; font-size: 16px; font-weight: 700; color: #f59e0b; }
  .paywall-desc { font-size: 12px; opacity: 0.8; margin: 0; }
  .paywall-perks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  .paywall-perks li { line-height: 1.4; }
  .paywall-cta { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
  .btn-large { padding: 10px 14px; font-size: 13px; font-weight: 700; }
  .btn-secondary { background: none; border: none; font-size: 11px; opacity: 0.7; cursor: pointer; text-decoration: underline; }
</style>
