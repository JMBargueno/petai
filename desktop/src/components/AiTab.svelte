<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api';
  import { Badge, Button, Card, EmptyState, ListRow, Modal, Notice, Skeleton, Switch } from './ui';
  import { ChatView, type ChatApi, type ChatDone, type ChatStreamHandlers, type ConfirmedAction } from '@pockai/ui';
  import { friendlyError } from '../lib/ui/errors';
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
  import { mixerPlay, mixerStop } from '../lib/mixer';
  import type { MixerLayer, MixerTrack } from '@pockai/audio';
  import { toSpeakable } from '../lib/speech-queue';
  import { getSocket } from '../lib/socket';

  export let pet: any = null;
  /** Mensaje a enviar en cuanto el chat esté listo (p. ej. al soltar un archivo sobre la mascota). */
  export let pendingPrompt: { text: string; n: number } | null = null;

  const dispatch = createEventDispatcher();

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
  // Pro regalado (voucher o regalo del equipo): no hay suscripción que gestionar en Stripe.
  $: giftedPro = entitlement?.source === 'voucher';
  $: giftedUntil = giftedPro && entitlement?.currentPeriodEnd ? new Date(entitlement.currentPeriodEnd).toLocaleDateString() : '';
  $: dailyLimit = usage?.daily?.limit ?? (isPro ? 200 : 15);
  $: dailyUsed = usage?.daily?.used ?? 0;
  $: dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  $: maxChars = isManaged ? 240 : 1000;
  $: quotaExceeded = isManaged && dailyRemaining <= 0;
  // Modos en los que la respuesta se genera en este equipo (flujo /chat/local/*)
  $: cliEngine = (activeMode === 'claude-cli' ? 'claude' : activeMode === 'antigravity-cli' ? 'antigravity' : null) as CliEngine | null;
  $: isLocalLike = (activeMode === 'local' && local.enabled) || (cliEngine !== null && cli.engine === cliEngine);
  $: chatReady = isManaged || (activeMode === 'byok' && config.configured) || isLocalLike;

  // La conversación es `ChatView`, de @pockai/ui. Aquí se le da el puerto: el turno va al
  // servidor o a un motor de este equipo, y las herramientas del equipo se ejecutan aquí.
  let chatView: any;
  /** Sube para volver a montar la conversación (y cargar el historial) tras cambiar de motor. */
  let chatKey = 0;

  /** Turno con un motor de este equipo (Hermes local o un CLI): el servidor da el contexto y guarda el resultado. */
  async function runLocal(text: string, handlers: ChatStreamHandlers, signal: AbortSignal): Promise<ChatDone> {
    const ctx = await api.localChatContext(pet.id, text, buildClientContext());
    if ('moderated' in ctx) {
      handlers.onModerated(ctx.moderated);
      return { moderated: true };
    }
    const result = cliEngine
      ? await streamCliCompletion(cli, ctx.messages, ctx.maxTokens, handlers.onDelta, signal)
      : await streamLocalCompletion(local, ctx.messages, ctx.maxTokens, handlers.onDelta, signal);
    const synced = await api.localChatSync(pet.id, ctx.turnId, result.reply);
    if ('moderated' in synced) {
      handlers.onModerated(synced.moderated);
      return { moderated: true };
    }
    return { ...synced, message: { ...synced.message, thinking: result.thinking || undefined } };
  }

  /** Acciones confirmadas que se hacen en este equipo. */
  async function runClientTool(res: ConfirmedAction): Promise<{ note: string; followUp?: string }> {
    const args = res.args ?? {};
    switch (res.tool) {
      case 'open_url':
        await openUrl(args.url);
        // Las manitas espirituales del Pockai abren el portal web (efecto en el escritorio)
        dispatch('agentAction', 'open_url');
        return { note: 'Abierto en tu navegador' };
      case 'toggle_desktop_skill':
        setSkillAuthorization(args.skill_id, !!args.enabled, pet.id);
        return { note: args.enabled ? 'Habilidad activada' : 'Habilidad desactivada' };
      case 'start_pomodoro':
        startPomodoro(args.work_minutes, args.break_minutes);
        return { note: `Pomodoro de ${args.work_minutes} min en marcha` };
      case 'stop_pomodoro':
        stopPomodoro();
        return { note: 'Pomodoro detenido' };
      case 'play_ambient': {
        const t = args.track as string | undefined;
        const track = t === undefined ? undefined : t === 'none' ? null : (`music.lofi.${t}` as MixerTrack);
        mixerPlay(track, args.layers as MixerLayer[] | undefined);
        return { note: 'Música en marcha' };
      }
      case 'stop_ambient':
        mixerStop();
        return { note: 'Música en pausa' };
      case 'read_clipboard': {
        const text = (await readClipboardText()).trim();
        if (!text) return { note: 'El portapapeles está vacío' };
        dispatch('agentAction', 'read_clipboard');
        return { note: 'Compartido con tu mascota', followUp: `Esto es lo que tengo en el portapapeles:\n"""\n${text.slice(0, 800)}\n"""` };
      }
      default:
        return { note: 'Hecho' };
    }
  }

  const chatApi: ChatApi = {
    getChatHistory: (petId) => api.getChatHistory(petId),
    chatStream: (petId, text, handlers, signal) =>
      isLocalLike ? runLocal(text, handlers, signal) : api.chatStream(petId, text, CLIENT_TOOLS, handlers, signal, buildClientContext()),
    getPendingActions: (petId) => api.getPendingActions(petId),
    confirmAction: (petId, actionId) => api.confirmAction(petId, actionId),
    rejectAction: (petId, actionId) => api.rejectAction(petId, actionId),
    runClientTool,
    listReminders: () => api.listReminders(),
    deleteReminder: (id) => api.deleteReminder(id),
    getMemories: (petId) => api.getMemories(petId),
    forgetMemory: (petId, memoryId) => api.forgetMemory(petId, memoryId),
    forgetAllMemories: (petId) => api.forgetAllMemories(petId),
    errorText: (e, fallback) => friendlyError(e, fallback),
  };

  /** Turno terminado: bocadillo, reacción de la mascota y uso. */
  function onChatDone(e: CustomEvent<{ content: string; behavior?: any }>) {
    const spoken = toSpeakable(e.detail.content);
    if (spoken) dispatch('bubble', spoken);
    // Reacción del Pockai (spec 36): opcional; servidores anteriores no la envían
    if (e.detail.behavior) dispatch('behavior', e.detail.behavior);
    dispatch('refreshPet');
    if (!isLocalLike) loadUsage();
  }

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

  let lastPromptN = 0;
  $: if (pendingPrompt && pendingPrompt.n !== lastPromptN && loaded && pet && chatView) {
    lastPromptN = pendingPrompt.n;
    dispatch('promptConsumed', pendingPrompt.n);
    if (chatReady) chatView.send(pendingPrompt.text);
    else chatView.setInput(pendingPrompt.text);
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
    if (chatReady && pet && !isLocalLike) await loadUsage();
    loaded = true;

    const s = getSocket();
    s?.on('entitlement:updated', handleEntitlementUpdated);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }
  });

  onDestroy(() => {
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
      chatKey += 1; // la conversación se monta de nuevo con el motor recién guardado
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

</script>

<div class="ui-stack ai">
  {#if !pet}
    <EmptyState icon="chat" title="Sin mascota" text="Necesitas una mascota para conversar. Eclosiona un huevo primero." />
  {:else if !loaded}
    <Skeleton rows={1} height={36} />
    <Skeleton rows={1} height={230} />
  {:else}
    {#if true}
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

    {#if isManaged && !showSettings && usage && !quotaExceeded}
      <Notice tone="info" icon="chat">
        Te quedan <strong>{dailyRemaining} de {dailyLimit}</strong> mensajes hoy · se renuevan a medianoche.
        <svelte:fragment slot="end">
          {#if isPro && giftedPro}
            <Badge tone="accent" icon="star" title="Pro regalado">Pro hasta {giftedUntil}</Badge>
          {:else if isPro}
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
          {#if isPro && giftedPro}
            <Notice tone="ok"><strong>Pro regalado hasta el {giftedUntil}:</strong> 200 mensajes diarios y herramientas de agente habilitadas.</Notice>
          {:else if isPro}
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
            {:else}
              <Button variant="ghost" disabled={busy} on:click={() => setMode('managed')}>Cancelar</Button>
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
            Limitaciones: sin herramientas de agente (recordatorios y acciones solo con la IA de Pockai o con tu
            propia key). Los recuerdos se siguen resumiendo en el servidor.
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
            Limitaciones: sin herramientas de agente (recordatorios y acciones solo con la IA de Pockai o con tu
            propia key). Los recuerdos se siguen resumiendo en el servidor.
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
      {#key `${activeMode}:${chatKey}`}
        <ChatView
          bind:this={chatView}
          {pet}
          {chatApi}
          serverTurns={!isLocalLike}
          managed={isManaged}
          {quotaExceeded}
          {dailyLimit}
          {maxChars}
          canUpgrade
          on:done={onChatDone}
          on:quota={() => {
            loadUsage();
            showPaywall = true;
          }}
          on:upgrade={() => (showPaywall = true)}
          on:useOwnKey={() => setMode('byok')}
          on:refreshPet={() => dispatch('refreshPet')}
        />
      {/key}
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

  {#if isPro && giftedPro}
    <Notice tone="ok"><strong>Tienes Pro regalado hasta el {giftedUntil}.</strong></Notice>
  {:else if isPro}
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
  @keyframes typing {
    40% {
      opacity: 1;
      translate: 0 -2px;
    }
  }
</style>
