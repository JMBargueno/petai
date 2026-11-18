<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { api } from '../lib/api';
  import { Badge, Button, Card, EmptyState, ListRow, Modal, Notice, Skeleton, Switch } from './ui';
  import {
    isLoopbackUrl,
    loadLocalConfig,
    saveLocalConfig,
    streamLocalCompletion,
    testLocalHermes,
    type LocalHermesConfig,
  } from '../lib/hermesLocal';
  import {
    CLI_COMMANDS,
    CLI_LABELS,
    loadCliConfig,
    saveCliConfig,
    streamCliCompletion,
    testCli,
    type CliConfig,
    type CliEngine,
  } from '../lib/aiCli';
  import { CLIENT_TOOLS, openUrl, readClipboardText } from '../lib/clientTools';
  import { buildClientContext } from '../lib/deskContext';
  import { setSkillAuthorization } from '../lib/stores/desktopSkillsStore';
  import { startPomodoro, stopPomodoro } from '../lib/pomodoro';
  import { toSpeakable } from '../lib/speech-queue';
  import { getSocket } from '../lib/socket';
  import { MEMORY_LAYERS, groupMemoriesByLayer, memoryIcon, valenceView } from '../lib/mind';

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

  // Modos: 'managed' (IA de Pockai), 'byok' (Mi propia clave), 'local' (Hermes local),
  // 'claude-cli' y 'antigravity-cli' (un CLI de IA instalado en este equipo; ver lib/aiCli.ts)
  type Mode = 'managed' | 'byok' | 'local' | 'claude-cli' | 'antigravity-cli';
  let activeMode: Mode = 'managed';

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
  // Modos CLI (Claude CLI / Antigravity CLI): excluyentes con Hermes local
  let cli: CliConfig = loadCliConfig();
  let cliMsg = '';
  let cliErr = '';

  // Uso mensual y cuota diaria
  let usage: Awaited<ReturnType<typeof api.getAiUsage>> | null = null;

  $: isManaged = activeMode === 'managed';
  $: isPro = (usage?.plan === 'pro') || (entitlement?.plan === 'pro');
  $: dailyLimit = usage?.daily?.limit ?? (isPro ? 200 : 15);
  $: dailyUsed = usage?.daily?.used ?? 0;
  $: dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  $: maxChars = isManaged ? 240 : 1000;
  $: quotaExceeded = isManaged && dailyRemaining <= 0;
  // Modos en los que la respuesta se genera en este equipo (flujo /chat/local/*)
  $: cliEngine = (activeMode === 'claude-cli' ? 'claude' : activeMode === 'antigravity-cli' ? 'antigravity' : null) as CliEngine | null;
  $: isLocalLike = (activeMode === 'local' && local.enabled) || (cliEngine !== null && cli.engine === cliEngine);
  $: chatReady = isManaged || (activeMode === 'byok' && config.configured) || isLocalLike;

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
  // Spec 36: episódica, semántica y emocional (los recuerdos antiguos se clasifican por tipo)
  $: memByLayer = groupMemoriesByLayer(mem?.memories ?? []);

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
      if (!isLocalLike) {
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
      if (cli.engine) {
        activeMode = cli.engine === 'claude' ? 'claude-cli' : 'antigravity-cli';
      } else if (local.enabled) {
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

  async function setMode(mode: Mode) {
    activeMode = mode;
    cliMsg = '';
    cliErr = '';
    // Solo un modo «en este equipo» a la vez: elegir cualquier otro desactiva el CLI
    const engine: CliEngine | null = mode === 'claude-cli' ? 'claude' : mode === 'antigravity-cli' ? 'antigravity' : null;
    cli.engine = engine;
    saveCliConfig(cli);
    cli = cli;
    if (engine) {
      local.enabled = false;
      saveLocalConfig(local);
      showSettings = true;
      if (pet && messages.length === 0) loadHistory();
      return;
    }
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
    const onDelta = (d: string) => {
      acc += d;
      reply.content = acc;
      messages = messages;
      scrollDown();
    };
    const result = cliEngine
      ? await streamCliCompletion(cli, ctx.messages, ctx.maxTokens, onDelta, signal)
      : await streamLocalCompletion(local, ctx.messages, ctx.maxTokens, onDelta, signal);
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
      const done = isLocalLike
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
      // Reacción del Pockai (spec 36): opcional; servidores anteriores no la envían
      if (done.behavior) dispatch('behavior', done.behavior);
      dispatch('refreshPet');
      if (!isLocalLike) loadUsage();
      if (memOpen && !isLocalLike) setTimeout(loadMemories, 3000);
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

  function saveCli() {
    cliErr = '';
    cliMsg = '';
    cli.engine = cliEngine;
    saveCliConfig(cli);
    cli = cli;
    cliMsg = cliEngine ? `Guardado. El chat usará ${CLI_LABELS[cliEngine]}.` : 'Guardado.';
  }

  async function testCliConnection() {
    cliErr = '';
    cliMsg = '';
    busy = true;
    try {
      cliMsg = `Encontrado: ${await testCli({ ...cli, engine: cliEngine })}`;
    } catch (e: any) {
      cliErr = e.message;
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

<div class="ui-stack ai">
  {#if !pet}
    <EmptyState icon="chat" title="Sin mascota" text="Necesitas una mascota para conversar. Eclosiona un huevo primero." />
  {:else if !loaded}
    <Skeleton rows={1} height={36} />
    <Skeleton rows={1} height={230} />
  {:else}
    {#if chatReady}
      <div class="bar">
        <Badge tone="tint" icon="brain" title="Inteligencia">{tier} · {pet.intelligence ?? 0}/1000</Badge>
        <select class="select mode-select" value={activeMode} aria-label="Motor de IA" on:change={(e) => setMode(e.currentTarget.value as Mode)}>
          <option value="managed">IA de Pockai</option>
          <option value="byok">Mi propia clave</option>
          <option value="local">Hermes local</option>
          <option value="claude-cli">Claude CLI</option>
          <option value="antigravity-cli">Antigravity CLI</option>
        </select>
        <span class="bar-end">
          {#if isManaged && isPro}
            <Badge tone="accent" icon="star" title="Suscripción Pro activa">Pro</Badge>
          {/if}
          <Button
            variant={showSettings ? 'ink' : 'ghost'}
            size="sm"
            iconOnly
            icon="settings"
            label={showSettings ? 'Ocultar ajustes' : 'Ajustes del chat'}
            on:click={() => (showSettings = !showSettings)}
          />
        </span>
      </div>
    {/if}

    {#if isManaged && !showSettings}
      <Notice tone={dailyRemaining <= 0 ? 'warning' : 'info'} icon="chat">
        Te quedan <strong>{dailyRemaining} de {dailyLimit}</strong> mensajes hoy · se renuevan a medianoche.
        <svelte:fragment slot="end">
          {#if isPro}
            <Button variant="ghost" size="sm" on:click={openPortal}>Gestionar</Button>
          {:else}
            <Button variant="ghost" size="sm" icon="star" on:click={() => (showPaywall = true)}>Pro</Button>
          {/if}
        </svelte:fragment>
      </Notice>
    {/if}

    {#if showSettings}
      {#if activeMode === 'managed'}
        <Card title="IA de Pockai (gestionada)" icon="star">
          <p class="ui-card__hint">
            Conversa directamente con tu mascota sin necesidad de crear cuentas externas ni introducir claves.
            El servidor gestiona la IA con OpenRouter y optimización automática.
          </p>
          {#if isPro}
            <Notice tone="ok"><strong>Plan Pro activo:</strong> 200 mensajes diarios y herramientas de agente habilitadas.</Notice>
            <Button variant="primary" block on:click={openPortal}>Gestionar suscripción en Stripe</Button>
          {:else}
            <Notice tone="info"><strong>Plan gratuito:</strong> 15 mensajes diarios con respuestas concisas.</Notice>
            <Button variant="primary" block icon="star" on:click={() => (showPaywall = true)}>Hazte Pro (200 mensajes/día)</Button>
          {/if}
        </Card>
      {:else if activeMode === 'byok'}
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
            {#if config.configured}
              <Button disabled={busy} on:click={test}>Probar conexión</Button>
              <Button variant="ghost" disabled={busy} on:click={remove}>Volver a IA de Pockai</Button>
            {/if}
          </div>
          {#if settingsMsg}<Notice tone="ok">{settingsMsg}</Notice>{/if}
          {#if settingsErr}<Notice tone="error">{settingsErr}</Notice>{/if}
        </Card>
      {:else if cliEngine}
        <Card title="{CLI_LABELS[cliEngine]} (este equipo)" icon="monitor">
          <p class="ui-card__hint">
            Tu mascota responde con el {CLI_LABELS[cliEngine]} instalado en este ordenador, usando la sesión que ya
            tienes iniciada (tu suscripción, sin claves en Pockai). Antes, abre una terminal y ejecuta
            <code>{CLI_COMMANDS[cliEngine]}</code> una vez para iniciar sesión.
            {#if cliEngine === 'claude'}
              Se lanza en una carpeta temporal vacía, sin herramientas, sin tus servidores MCP y sin guardar la sesión.
            {:else}
              Se lanza en una carpeta temporal vacía, en modo headless con <code>--sandbox</code>: las herramientas que
              no hayas permitido en tu configuración de Antigravity quedan denegadas.
            {/if}
            El servidor sigue creando la personalidad, moderando y guardando el historial.
            Limitaciones: sin herramientas de agente y sin nuevos recuerdos automáticos.
          </p>
          <div class="form-group">
            <label for="ai-cli-model">Modelo <small class="form-hint">(vacío = el predeterminado del CLI)</small></label>
            <input
              id="ai-cli-model"
              class="input"
              type="text"
              bind:value={cli.model}
              placeholder={cliEngine === 'claude' ? 'sonnet, haiku…' : 'opcional'}
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="ai-cli-path">Ruta del ejecutable <small class="form-hint">(solo si no está en el PATH)</small></label>
            <input
              id="ai-cli-path"
              class="input"
              type="text"
              bind:value={cli.binPath}
              placeholder={cliEngine === 'claude' ? 'C:\\Users\\tú\\.local\\bin\\claude.exe' : 'C:\\ruta\\a\\agy.exe'}
              autocomplete="off"
            />
          </div>
          <div class="row">
            <Button variant="primary" on:click={saveCli}>Guardar</Button>
            <Button disabled={busy} loading={busy} on:click={testCliConnection}>Probar conexión</Button>
          </div>
          {#if cliMsg}<Notice tone="ok">{cliMsg}</Notice>{/if}
          {#if cliErr}<Notice tone="error">{cliErr}</Notice>{/if}
        </Card>
      {:else}
        <Card title="Hermes local (este equipo)" icon="monitor">
          <p class="ui-card__hint">
            Conversa con un Hermes Agent que corre en tu ordenador, sin gastar tu key ni salir a internet. Los ajustes
            se guardan solo aquí. El servidor sigue creando la personalidad, moderando y guardando el historial.
            Limitaciones: sin herramientas de agente y sin nuevos recuerdos automáticos.
          </p>
          <Switch label="Usar mi Hermes local para conversar" bind:checked={local.enabled} />
          <div class="form-group">
            <label for="ai-local-url">URL (127.0.0.1 o localhost)</label>
            <input id="ai-local-url" class="input" type="url" bind:value={local.baseUrl} placeholder="http://127.0.0.1:8642/v1" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="ai-local-model">Modelo</label>
            <input id="ai-local-model" class="input" type="text" bind:value={local.model} placeholder="hermes-agent" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="ai-local-key">API_SERVER_KEY <small class="form-hint">(si tu Hermes la exige)</small></label>
            <input id="ai-local-key" class="input" type="password" bind:value={local.apiKey} autocomplete="off" placeholder="opcional" />
          </div>
          <div class="row">
            <Button variant="primary" on:click={saveLocal}>Guardar local</Button>
            <Button disabled={busy} on:click={testLocal}>Probar Hermes local</Button>
          </div>
          {#if localMsg}<Notice tone="ok">{localMsg}</Notice>{/if}
          {#if localErr}<Notice tone="error">{localErr}</Notice>{/if}
        </Card>
      {/if}
    {/if}

    {#if chatReady && !showSettings}
      {#if cliEngine}
        <Notice tone="info" icon="monitor">Modo {CLI_LABELS[cliEngine]}: tu mascota responde con el CLI de este equipo (sin herramientas ni recordatorios nuevos).</Notice>
      {:else if isLocalLike}
        <Notice tone="info" icon="monitor">Modo Hermes local: tu mascota responde con el modelo de este equipo (sin herramientas ni recordatorios nuevos).</Notice>
      {/if}
      <div class="chat" bind:this={scroller}>
        {#if messages.length === 0}
          <p class="chat-empty">Saluda a {pet.nickname || pet.species?.name}</p>
        {/if}
        {#each messages as m (m.id)}
          {#if m.role === 'assistant' && m.thinking}
            <div class="thinking" data-testid="thinking">
              <button type="button" class="thinking-toggle" aria-expanded={!!m.thinkingOpen} on:click={() => toggleThinking(m)}>
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
          <div class="action" class:done={a.state === 'done'} class:bad={a.state === 'error'}>
            <div class="action-title"><Ico n="tool" /> Tu mascota quiere hacer algo</div>
            <div class="action-body">{a.summary}</div>
            {#if a.state === 'pending' || a.state === 'working'}
              <div class="row">
                <Button variant="primary" size="sm" loading={a.state === 'working'} on:click={() => decide(a, true)}>Confirmar</Button>
                <Button size="sm" disabled={a.state === 'working'} on:click={() => decide(a, false)}>Rechazar</Button>
              </div>
            {:else}
              <div class="action-note">{a.note}</div>
            {/if}
          </div>
        {/each}
      </div>
      {#if chatErr}<Notice tone="error">{chatErr}</Notice>{/if}

      <!-- Compositor de mensajes -->
      {#if isManaged && quotaExceeded}
        <Notice tone="warning" icon="lock">
          <strong>Límite diario alcanzado ({dailyLimit} mensajes).</strong> Se renueva a medianoche.
          <div class="row quota-actions">
            <Button variant="primary" size="sm" icon="star" on:click={() => (showPaywall = true)}>Hazte Pro</Button>
            <Button size="sm" on:click={() => setMode('byok')}>Usar mi clave gratis</Button>
          </div>
        </Notice>
      {:else}
        <div class="composer">
          <div class="textarea-wrapper">
            <textarea
              class="textarea"
              rows="2"
              maxlength={maxChars}
              bind:value={input}
              on:keydown={onKey}
              placeholder={isManaged ? 'Escribe un mensaje… (máx. 240 caracteres)' : 'Escribe un mensaje… (Enter para enviar)'}
              disabled={streaming}
            ></textarea>
            {#if isManaged}
              <span class="char-count" class:near-limit={input.length >= maxChars - 20}>{input.length}/{maxChars}</span>
            {/if}
          </div>
          <Button
            variant="primary"
            iconOnly
            icon="send"
            label="Enviar"
            class="send-btn"
            loading={streaming}
            disabled={!input.trim() || (isManaged && quotaExceeded)}
            on:click={() => send()}
          />
        </div>
      {/if}

      <!-- Recordatorios y recuerdos -->
      {#if (pet.intelligence ?? 0) >= 500}
        <div class="fold">
          <button class="fold-head" aria-expanded={remOpen} on:click={toggleReminders}>
            <Ico n="alarm" /> <span class="label-caps">Recordatorios</span>
            <Ico n={remOpen ? 'down' : 'right'} size={13} />
          </button>
          {#if remOpen}
            {#if remErr}<Notice tone="error">{remErr}</Notice>{/if}
            <div class="ui-list ui-list--scroll">
              {#each reminders as r (r.id)}
                <ListRow icon="alarm" title={r.text} sub={fmt(r.dueAt)}>
                  <svelte:fragment slot="end">
                    <Button variant="ghost" size="sm" iconOnly icon="x" label="Eliminar recordatorio" class="ui-ibtn ui-ibtn--no" on:click={() => removeReminder(r.id)} />
                  </svelte:fragment>
                </ListRow>
              {:else}
                <EmptyState compact icon="alarm" text="No hay recordatorios pendientes. Pídele a tu mascota que te recuerde algo." />
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <Notice tone="info" icon="lock">Con 500 de inteligencia tu mascota podrá usar herramientas y crear recordatorios.</Notice>
      {/if}

      <div class="fold">
        <button class="fold-head" aria-expanded={memOpen} on:click={toggleMemories}>
          <Ico n="folder" /> <span class="label-caps">Recuerdos</span>
          <Ico n={memOpen ? 'down' : 'right'} size={13} />
        </button>
        {#if memOpen}
          {#if memErr}<Notice tone="error">{memErr}</Notice>{/if}
          {#if mem && !mem.unlocked}
            <Notice tone="info" icon="lock">
              La memoria se desbloquea con {mem.unlockAt} de inteligencia (ahora {mem.intelligence}). Sigue charlando.
            </Notice>
          {:else if mem && mem.memories.length === 0}
            <EmptyState compact icon="folder" text="Todavía no recuerda nada. Tras unas cuantas charlas empezará a hacerlo." />
          {:else if mem}
            <div class="mem-layers ui-list--scroll">
              {#each MEMORY_LAYERS as l (l.id)}
                {#if memByLayer[l.id].length}
                  <section class="mem-layer" aria-label="Memoria {l.label.toLowerCase()}">
                    <h4 class="mem-layer__head" title={l.hint}>
                      <Ico n={l.icon} size={12} /> <span class="label-caps">{l.label}</span>
                      <small>{memByLayer[l.id].length}</small>
                    </h4>
                    <div class="ui-list">
                      {#each memByLayer[l.id] as m (m.id)}
                        {@const v = l.id === 'emotional' ? valenceView(m.valence) : null}
                        <ListRow
                          icon={memoryIcon(m.kind)}
                          sub={(m.kind === 'habit' ? 'Hábito: ' : '') + (m.subject && l.id === 'emotional' ? `${m.subject}: ` : '') + m.content}
                          wrap
                          muted={m.kind === 'summary'}
                        >
                          <svelte:fragment slot="end">
                            {#if v}
                              <span class="valence valence--{v.tone}" title="Valencia {v.text}">{v.label} <small>{v.text}</small></span>
                            {/if}
                            <Button variant="ghost" size="sm" iconOnly icon="x" label="Olvidar" class="ui-ibtn ui-ibtn--no" on:click={() => forget(m.id)} />
                          </svelte:fragment>
                        </ListRow>
                      {/each}
                    </div>
                  </section>
                {/if}
              {/each}
            </div>
            <Button variant={confirmForgetAll ? 'danger' : 'ghost'} size="sm" icon="trash" on:click={forgetAll}>
              {confirmForgetAll ? '¿Seguro? No se puede deshacer: pulsa otra vez' : 'Olvidar todo'}
            </Button>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Modal de suscripción Pro -->
<Modal open={showPaywall} title="Pockai Pro" icon="star" on:close={() => (showPaywall = false)}>
  <p class="ui-card__hint">Desbloquea el máximo potencial de tu mascota sin interrupciones con Pockai Pro:</p>
  <div class="ui-list">
    <ListRow icon="chat" iconTint="var(--color-lavender)" title="200 mensajes diarios" sub="IA de alta calidad (vs 15 en Free)" wrap />
    <ListRow icon="tool" iconTint="var(--color-mint-pop)" title="Herramientas de agente" sub="Recordatorios, abrir enlaces y más" wrap />
    <ListRow icon="brain" iconTint="var(--color-electric-blue)" title="Respuestas y memoria ampliadas" sub="Contexto más profundo y más personalidad" wrap />
    <ListRow icon="energy" iconTint="var(--color-sunburst)" title="Prioridad de servicio" sub="Menor latencia y modelos de reserva automáticos" wrap />
  </div>

  {#if paywallErr}<Notice tone="error">{paywallErr}</Notice>{/if}

  {#if isPro}
    <Button variant="primary" size="lg" block loading={paywallBusy} on:click={openPortal}>Gestionar suscripción en Stripe</Button>
  {:else}
    <Button variant="primary" size="lg" block icon="star" loading={paywallBusy} on:click={subscribePro}>
      {proPriceLabel ? 'Hazte Pro por ' + proPriceLabel + '/mes' : 'Hazte Pro'}
    </Button>
  {/if}
  <Button variant="ghost" size="sm" block on:click={() => { showPaywall = false; setMode('byok'); }}>
    Prefiero usar mi propia API key gratis
  </Button>
</Modal>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .bar-end {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }
  .mode-select {
    width: auto;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-pills);
    font-size: var(--text-caption);
    font-weight: 700;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .quota-actions {
    margin-top: var(--space-2);
  }
  .chat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 240px;
    padding: var(--space-2);
    overflow-y: auto;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-cards);
    background: var(--surface-2);
  }
  .chat-empty {
    margin: auto;
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .msg {
    max-width: 85%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2xl);
    font-size: var(--text-label);
    line-height: 1.4;
    white-space: pre-wrap;
    user-select: text;
  }
  .msg.user {
    align-self: flex-end;
    border-bottom-right-radius: 4px;
    background: var(--accent);
    color: var(--on-dark);
  }
  .msg.assistant {
    align-self: flex-start;
    border: 1px solid var(--line-soft);
    border-bottom-left-radius: 4px;
    background: var(--surface);
  }
  .msg.notice {
    border: 1px solid var(--warning);
    background: color-mix(in srgb, var(--warning) 16%, var(--surface));
    color: var(--ink);
  }
  .thinking {
    align-self: flex-start;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-width: 85%;
    margin-bottom: -2px;
  }
  .thinking-toggle {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border: none;
    background: none;
    color: var(--ink-muted);
    font-size: var(--text-caption);
    cursor: pointer;
  }
  .thinking-toggle:hover {
    color: var(--ink);
  }
  .thinking-body {
    max-height: 160px;
    overflow-y: auto;
    padding: var(--space-2) var(--space-2);
    border-left: 2px solid var(--line-soft);
    color: var(--ink-muted);
    font-size: var(--text-caption);
    font-style: italic;
    line-height: 1.35;
    white-space: pre-wrap;
    user-select: text;
  }
  .hint {
    align-self: flex-start;
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .action {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2);
    border: 1px solid var(--warning);
    border-radius: var(--radius-2xl);
    background: color-mix(in srgb, var(--warning) 14%, var(--surface));
    font-size: var(--text-caption);
  }
  .action.done {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 14%, var(--surface));
  }
  .action.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 14%, var(--surface));
  }
  .action-title {
    font-weight: 700;
  }
  .action-body {
    user-select: text;
  }
  .action-note {
    color: var(--ink-muted);
  }
  .composer {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
  }
  .textarea-wrapper {
    position: relative;
    display: flex;
    flex: 1;
  }
  .textarea {
    resize: none;
    font-size: var(--text-label);
    border-radius: var(--radius-cards);
  }
  .composer :global(.send-btn) {
    align-self: stretch;
    min-width: 46px;
    border-radius: var(--radius-cards);
  }
  .char-count {
    position: absolute;
    right: 10px;
    bottom: 6px;
    font-size: var(--text-caption);
    color: var(--ink-muted);
    pointer-events: none;
  }
  .char-count.near-limit {
    color: var(--danger-ink);
    font-weight: 700;
  }
  .fold {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .fold-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border: none;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .fold-head:hover {
    color: var(--ink);
  }
  .mem-layers {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .mem-layer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .mem-layer__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    color: var(--ink-muted);
    font-size: inherit;
  }
  .mem-layer__head small {
    margin-left: auto;
    font-size: var(--text-caption);
    font-variant-numeric: tabular-nums;
  }
  .valence {
    font-size: var(--text-caption);
    font-weight: 700;
    white-space: nowrap;
  }
  .valence small {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }
  .valence--pos {
    color: var(--success-ink);
  }
  .valence--neg {
    color: var(--danger-ink);
  }
  .valence--neutral {
    color: var(--ink-muted);
  }
</style>
