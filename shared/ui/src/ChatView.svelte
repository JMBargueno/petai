<script lang="ts">
  /**
   * Chat con la mascota: la conversación (historial, envío con respuesta en vivo, razonamiento
   * plegado), las acciones que propone y hay que confirmar, el compositor, los recordatorios y los
   * recuerdos. Habla con el servidor por el puerto `chatApi` (`chatApi.ts`).
   *
   * Lo que es de cada app queda fuera: el motor de IA y sus ajustes, el uso y la suscripción. La app
   * avisa de la cuota (`managed`, `quotaExceeded`, `dailyLimit`) y atiende `upgrade` y `useOwnKey`
   * (solo si `canUpgrade`). Puede mandar un mensaje desde fuera con `send(texto)` o dejarlo escrito
   * con `setInput(texto)`.
   */
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import type { ChatApi, ChatMessage } from './chatApi';
  import { parseBold } from './chatText';
  import { stickToBottom } from './chatScroll';
  import { MEMORY_LAYERS, groupMemoriesByLayer, memoryIcon, valenceView } from './mind';
  import Ico from './Ico.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import EmptyState from './EmptyState.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';

  export let pet: any = null;
  /** Cómo habla el chat con el servidor. */
  export let chatApi: ChatApi;
  /** El turno va al servidor (no a un motor local): hay acciones pendientes y la memoria cambia sola. */
  export let serverTurns = true;
  /** IA gestionada por Pockai: tiene cuota diaria. */
  export let managed = true;
  export let quotaExceeded = false;
  export let dailyLimit = 0;
  /** Largo máximo de un mensaje. */
  export let maxChars = 240;
  /** Se ofrece pasar a Pro o usar una clave propia al agotar la cuota. */
  export let canUpgrade = false;
  /** Solo se ofrece la clave propia (donde no se puede pagar Pro desde la app, como en Android). */
  export let canUseOwnKey = false;

  const dispatch = createEventDispatcher<{
    /** Turno terminado (el mensaje final y la reacción de la mascota, si la hay). */
    done: { content: string; behavior?: any };
    /** El servidor rechazó un mensaje por la cuota. */
    quota: void;
    upgrade: void;
    useOwnKey: void;
    /** Una acción confirmada cambió la mascota. */
    refreshPet: void;
  }>();

  type ActionCard = {
    id: string;
    summary: string;
    state: 'pending' | 'working' | 'done' | 'rejected' | 'error';
    note?: string;
  };

  let messages: ChatMessage[] = [];
  let input = '';
  let streaming = false;
  let chatErr = '';
  let scroller: HTMLElement;
  let abort: AbortController | null = null;
  let composer: HTMLTextAreaElement | null = null;

  let actions: ActionCard[] = [];
  let toolHint = '';
  let remOpen = false;
  let reminders: { id: string; text: string; dueAt: string }[] = [];
  let remErr = '';

  let memOpen = false;
  let mem: any = null;
  let memErr = '';
  // Spec 36: episódica, semántica y emocional (los recuerdos antiguos se clasifican por tipo)
  $: memByLayer = groupMemoriesByLayer<any>(mem?.memories ?? []);

  /** Pendiente de confirmar: borrar un recuerdo o un recordatorio. */
  let pendingDelete: { kind: 'memory' | 'reminder'; id: string; text: string } | null = null;
  let deleting = false;

  const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  const errText = (e: any) => chatApi.errorText(e);

  function toggleThinking(m: ChatMessage) {
    m.thinkingOpen = !m.thinkingOpen;
    messages = messages;
  }

  async function loadHistory() {
    try {
      messages = await chatApi.getChatHistory(pet.id);
      await scrollDown(true);
    } catch (e: any) {
      chatErr = errText(e);
    }
  }

  async function loadPending() {
    if (!pet) return;
    try {
      const rows = await chatApi.getPendingActions(pet.id);
      const known = new Set(actions.map((a) => a.id));
      actions = [...actions, ...rows.filter((r) => !known.has(r.id)).map((r) => ({ id: r.id, summary: r.summary, state: 'pending' as const }))];
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
        const res = await chatApi.confirmAction(pet.id, card.id);
        if (res.clientSide) {
          // Herramienta de la app (abrir una web, el portapapeles…): si esta app no la tiene, se dice.
          const ran = chatApi.runClientTool ? await chatApi.runClientTool(res) : { note: 'Esta acción no está disponible aquí' };
          card.note = ran.note;
          followUp = ran.followUp ?? '';
          card.state = 'done';
        } else {
          card.state = 'done';
          card.note = 'Hecho';
          if (remOpen) loadReminders();
          dispatch('refreshPet');
        }
      } else {
        await chatApi.rejectAction(pet.id, card.id);
        card.state = 'rejected';
        card.note = 'Rechazada';
      }
    } catch (e: any) {
      card.state = 'error';
      card.note = errText(e);
    }
    actions = actions;
    if (followUp) await send(followUp);
  }

  async function loadReminders() {
    try {
      reminders = await chatApi.listReminders();
      remErr = '';
    } catch (e: any) {
      remErr = errText(e);
    }
  }

  async function toggleReminders() {
    remOpen = !remOpen;
    if (remOpen) await loadReminders();
  }

  async function removeReminder(id: string) {
    try {
      await chatApi.deleteReminder(id);
      await loadReminders();
    } catch (e: any) {
      remErr = errText(e);
    }
  }

  async function loadMemories() {
    if (!pet) return;
    try {
      mem = await chatApi.getMemories(pet.id);
      memErr = '';
    } catch (e: any) {
      memErr = errText(e);
    }
  }

  async function toggleMemories() {
    memOpen = !memOpen;
    if (memOpen) await loadMemories();
  }

  async function forget(id: string) {
    try {
      await chatApi.forgetMemory(pet.id, id);
      await loadMemories();
    } catch (e: any) {
      memErr = errText(e);
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
      await chatApi.forgetAllMemories(pet.id);
      await loadMemories();
    } catch (e: any) {
      memErr = errText(e);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    deleting = true;
    try {
      if (pendingDelete.kind === 'memory') await forget(pendingDelete.id);
      else await removeReminder(pendingDelete.id);
    } finally {
      deleting = false;
      pendingDelete = null;
    }
  }

  /** Baja al final del hilo. Sin `force`, solo si el jugador ya estaba abajo (no le quita el sitio si está leyendo). */
  async function scrollDown(force = false) {
    const settle = stickToBottom(scroller, force);
    await tick();
    settle();
  }

  function applyModeration(m: { message: string; hideUserMessage: boolean }, reply: ChatMessage, userMsg: ChatMessage) {
    reply.content = m.message;
    reply.notice = true;
    if (m.hideUserMessage) {
      messages = messages.filter((x) => x.id !== userMsg.id);
      input = '';
    }
    messages = messages;
    scrollDown();
  }

  /** Deja un texto escrito en el compositor. */
  export function setInput(text: string) {
    input = text;
  }

  /** Manda un mensaje (el escrito, o `override`). */
  export async function send(override?: string) {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || streaming || !pet) return;
    if (managed && quotaExceeded) {
      dispatch('quota');
      return;
    }

    chatErr = '';
    input = '';
    streaming = true;
    const reply: ChatMessage = { id: `tmp-reply-${Date.now()}`, role: 'assistant', content: '' };
    const userMsg: ChatMessage = { id: `tmp-${Date.now()}`, role: 'user', content: text };
    messages = [...messages, userMsg, reply];
    await scrollDown(true);
    abort = new AbortController();
    toolHint = '';
    try {
      const done = await chatApi.chatStream(
        pet.id,
        text,
        {
          onDelta: (delta) => {
            toolHint = '';
            reply.content += delta;
            messages = messages;
            scrollDown();
          },
          onModerated: (m) => applyModeration(m, reply, userMsg),
          onTool: () => {
            toolHint = 'Consultando…';
          },
          onAction: (a) => {
            actions = [...actions, { id: a.id, summary: a.summary, state: 'pending' }];
            scrollDown();
          },
        },
        abort.signal,
      );
      if ('moderated' in done) return;
      reply.content = done.message.content;
      reply.thinking = done.message.thinking || undefined;
      reply.thinkingOpen = false;
      messages = messages;
      dispatch('done', { content: done.message.content, behavior: done.behavior });
      if (memOpen && serverTurns) setTimeout(loadMemories, 3000);
    } catch (e: any) {
      const raw = String(e?.message ?? '');
      if (e?.name !== 'AbortError') chatErr = errText(e);
      messages = messages.filter((m) => m !== reply && m !== userMsg);
      input = text;
      if (/cuota|quota|429/i.test(raw) || e?.status === 429) dispatch('quota');
    } finally {
      streaming = false;
      toolHint = '';
      abort = null;
      // El campo no se desactiva mientras responde, pero por si el foco se fue a «Detener».
      tick().then(() => composer?.focus());
    }
  }

  function onKey(e: KeyboardEvent) {
    // Durante una composición IME (japonés, chino, acentos muertos) Enter confirma el texto, no envía.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  onMount(async () => {
    if (!pet) return;
    await loadHistory();
    if (serverTurns) await loadPending();
  });

  onDestroy(() => abort?.abort());
</script>

<div class="ui-stack ai">
  <div class="chat" bind:this={scroller} role="log" aria-live="polite" aria-label="Conversación con {pet.nickname || pet.species?.name}">
    {#if messages.length === 0}
      <p class="chat-empty">Saluda a {pet.nickname || pet.species?.name}: escribe abajo y pulsa Enter.</p>
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
      <div class="msg {m.role}" class:notice={m.notice}><span class="sr-only">{m.role === 'user' ? 'Tú: ' : `${pet.nickname || pet.species?.name}: `}</span>{#if m.role === 'assistant'}{#each parseBold(m.content) as part}{#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}{:else}{m.content}{/if}{#if streaming && m.id.startsWith('tmp-reply') && !m.content}<span class="typing" role="status" aria-label="Está escribiendo"><i></i><i></i><i></i></span>{/if}</div>
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
  {#if managed && quotaExceeded}
    <Notice tone="warning" icon="lock">
      <strong>Límite diario alcanzado ({dailyLimit} mensajes).</strong> Se renueva a medianoche.
      {#if canUpgrade || canUseOwnKey}
        <div class="row quota-actions">
          {#if canUpgrade}
            <Button variant="primary" size="sm" icon="star" on:click={() => dispatch('upgrade')}>Hazte Pro</Button>
          {/if}
          <Button size="sm" on:click={() => dispatch('useOwnKey')}>Usar mi clave gratis</Button>
        </div>
      {/if}
    </Notice>
  {:else}
    <div class="composer">
      <div class="textarea-wrapper">
        <textarea
          class="textarea"
          rows="2"
          maxlength={maxChars}
          bind:value={input}
          bind:this={composer}
          on:keydown={onKey}
          aria-label="Mensaje para {pet.nickname || pet.species?.name}"
          placeholder="Escribe un mensaje… (Enter envía, Mayús+Enter salta de línea)"
          readonly={streaming}
        ></textarea>
        <span class="char-count" class:near-limit={input.length >= maxChars - 20} aria-hidden="true">{input.length}/{maxChars}</span>
      </div>
      {#if streaming}
        <Button iconOnly icon="x" label="Detener la respuesta" class="send-btn" on:click={() => abort?.abort()} />
      {:else}
        <Button
          variant="primary"
          iconOnly
          icon="send"
          label="Enviar"
          class="send-btn"
          disabled={!input.trim() || (managed && quotaExceeded)}
          on:click={() => send()}
        />
      {/if}
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
                <Button variant="ghost" size="sm" iconOnly icon="x" label="Eliminar el recordatorio: {r.text}" class="ui-ibtn ui-ibtn--no" on:click={() => (pendingDelete = { kind: 'reminder', id: r.id, text: r.text })} />
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
          {#if mem.memories.length === 0}
            La memoria se desbloquea con {mem.unlockAt} de inteligencia (ahora {mem.intelligence}). Sigue charlando.
          {:else}
            Ya recuerda algunas cosas. Con {mem.unlockAt} de inteligencia (ahora {mem.intelligence}) recordará más y más a menudo.
          {/if}
        </Notice>
      {/if}
      {#if mem && !mem.unlocked && mem.memories.length === 0}
        <!-- Sin recuerdos y aún bloqueada: basta el aviso de arriba -->
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
                        <Button variant="ghost" size="sm" iconOnly icon="x" label="Olvidar este recuerdo" class="ui-ibtn ui-ibtn--no" on:click={() => (pendingDelete = { kind: 'memory', id: m.id, text: m.content })} />
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

  {#if pendingDelete}
<ConfirmDialog
  title={pendingDelete.kind === 'memory' ? 'Olvidar este recuerdo' : 'Eliminar el recordatorio'}
  icon="trash"
  danger
  confirmLabel={pendingDelete.kind === 'memory' ? 'Olvidar' : 'Eliminar'}
  loading={deleting}
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
>
  <p class="ui-usertext">«{pendingDelete.text}»</p>
  <p>{pendingDelete.kind === 'memory' ? 'Tu Pockai dejará de recordarlo. No se puede deshacer.' : 'No te lo recordará. No se puede deshacer.'}</p>
</ConfirmDialog>
  {/if}
</div>

<style>
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
    overflow-wrap: anywhere;
    user-select: text;
  }
  .typing {
    display: inline-flex;
    gap: 3px;
    vertical-align: middle;
  }
  .typing i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.35;
    animation: typing 1s ease-in-out infinite;
  }
  .typing i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .typing i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes typing {
    40% {
      opacity: 1;
      translate: 0 -2px;
    }
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
    /* Hueco para el contador, que va superpuesto abajo a la derecha */
    padding-bottom: var(--space-5);
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
    bottom: 4px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface);
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
</style>
