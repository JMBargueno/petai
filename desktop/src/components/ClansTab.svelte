<script lang="ts">
  /** Clanes (feature 021): crear/unirse por tag, roster con presencia y rol, invitar y salir.
   *  Además: chat del clan y objetivos de clan (con progreso en vivo por socket). */
  import Ico from './Ico.svelte';
  import { onMount } from 'svelte';
  import {
    api,
    type ClanMember,
    type ClanSummary,
    type ClanGoal,
    type ClanGoalMetric,
  } from '../lib/api';
  import {
    clanMessagesStore,
    clanGoalsStore,
    pushClanMessage,
    setClanMessages,
    setClanGoals,
    upsertClanGoal,
    dropClanGoal,
    clearClan,
    goalPercent,
  } from '../lib/clan-store';

  let clan: ClanSummary | null = null;
  let meId = '';
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  // Crear clan
  let name = '';
  let tag = '';
  let description = '';
  // Unirse / invitar
  let joinTag = '';
  let inviteTarget = '';
  // Objetivos
  let goalTitle = '';
  let goalMetric: ClanGoalMetric = 'xp';
  let goalTarget = '';
  // Chat
  let chatInput = '';
  let chatEl: HTMLDivElement | null = null;

  const ROLE_LABEL: Record<string, string> = { leader: 'Líder', member: 'Miembro' };
  const METRIC_LABEL: Record<string, string> = { xp: 'XP', visits: 'Visitas', generic: 'Progreso' };
  /** El usuario actual es el líder del clan (puede borrar objetivos). */
  $: isLeader = !!clan && !!meId && clan.leaderId === meId;
  /** Objetivos activos primero, luego los completados. */
  $: sortedGoals = [...$clanGoalsStore].sort(
    (a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0),
  );
  /** El chat siempre queda pegado al final al llegar mensajes. */
  $: if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;

  async function load() {
    loading = true;
    error = '';
    try {
      clan = await api.getMyClan(); // null si aún no hay clan (404 del contrato)
      if (clan) {
        // Roster vivo por el endpoint dedicado (el summary puede traerlo cacheado)
        try {
          const members: ClanMember[] = await api.getClanMembers(clan.id);
          if (Array.isArray(members) && members.length > 0) clan = { ...clan, members, memberCount: members.length };
        } catch {
          /* el summary ya trae members; no crítico */
        }
        await loadClanExtras(clan.id);
      } else {
        clearClan();
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  /** Quien soy (para saber si soy líder) + objetivos y chat del clan. */
  async function loadClanExtras(clanId: string) {
    try {
      const me = await api.getMe();
      meId = me?.id ?? '';
    } catch {
      meId = '';
    }
    try {
      setClanGoals(await api.getClanGoals(clanId));
    } catch {
      setClanGoals([]); // endpoint aún no disponible: se rellena con los eventos del socket
    }
    try {
      setClanMessages(await api.getClanMessages(clanId, { limit: 50 }));
    } catch {
      setClanMessages([]);
    }
  }

  async function create() {
    if (!name.trim() || !tag.trim()) return;
    busy = 'create';
    error = '';
    ok = '';
    try {
      await api.createClan({ name: name.trim(), tag: tag.trim().toUpperCase(), description: description.trim() || undefined });
      ok = `¡Clan ${name.trim()} creado!`;
      name = '';
      tag = '';
      description = '';
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function join() {
    if (!joinTag.trim()) return;
    busy = 'join';
    error = '';
    ok = '';
    try {
      await api.joinClan(joinTag.trim().toUpperCase());
      ok = `¡Has entrado en el clan ${joinTag.trim().toUpperCase()}!`;
      joinTag = '';
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function invite() {
    if (!clan || !inviteTarget.trim()) return;
    busy = 'invite';
    error = '';
    ok = '';
    const t = inviteTarget.trim();
    try {
      // Si se parece a un email se manda por email; si no, se interpreta como id de jugador
      await api.inviteToClan(clan.id, t.includes('@') ? { email: t } : { userId: t });
      ok = `Invitación enviada a ${t}.`;
      inviteTarget = '';
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function leave() {
    if (!clan) return;
    busy = 'leave';
    error = '';
    ok = '';
    try {
      await api.leaveClan();
      ok = 'Has salido del clan.';
      clearClan();
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  // ── Objetivos de clan ──────────────────────────────────────────────────────
  async function createGoal() {
    if (!clan || !goalTitle.trim()) return;
    const target = parseInt(goalTarget, 10);
    if (!Number.isFinite(target) || target <= 0) return;
    busy = 'goal-create';
    error = '';
    ok = '';
    try {
      const goal = await api.createClanGoal(clan.id, { title: goalTitle.trim(), metric: goalMetric, target });
      upsertClanGoal(goal);
      goalTitle = '';
      goalTarget = '';
      ok = 'Objetivo creado.';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function addProgress(goal: ClanGoal) {
    if (!clan) return;
    busy = `goal-${goal.id}`;
    error = '';
    try {
      const updated = await api.addClanGoalProgress(clan.id, goal.id, 1);
      upsertClanGoal(updated);
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function deleteGoal(goal: ClanGoal) {
    if (!clan || !isLeader) return;
    busy = `goal-${goal.id}`;
    error = '';
    try {
      await api.deleteClanGoal(clan.id, goal.id);
      dropClanGoal(goal.id);
      ok = 'Objetivo eliminado.';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  // ── Chat del clan ──────────────────────────────────────────────────────────
  async function sendMsg() {
    if (!clan || !chatInput.trim()) return;
    busy = 'chat';
    error = '';
    const body = chatInput.trim();
    chatInput = '';
    try {
      const sent = await api.sendClanMessage(clan.id, body);
      // Lo guardamos ya por si el socket tarda (deduplicado por id en el store)
      if (sent?.id) pushClanMessage(sent);
    } catch (e: any) {
      error = e.message;
      chatInput = body; // permite reintentar
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

{#if loading && !clan}
  <div class="empty-msg">Cargando clan…</div>
{:else if clan}
  <div class="clan-card">
    <div class="clan-head">
      <div>
        <h4><Ico n="trophy" /> {clan.name} <span class="tag">[{clan.tag}]</span></h4>
        <small>{clan.description || 'Sin descripción'}</small>
      </div>
      <span class="clan-xp">{(clan.xp ?? 0).toLocaleString()} XP</span>
    </div>
    <div class="clan-meta">Líder: {clan.leader?.displayName ?? clan.leaderId} · {clan.memberCount} miembro(s)</div>
  </div>

  <div class="sec-title">Miembros</div>
  <div class="list">
    {#each clan.members as m (m.userId)}
      <div class="member">
        <span class="p-dot {m.isOnline ? 'online' : 'offline'}" title="Presencia"></span>
        <span class="member-name">{m.displayName}</span>
        <span class="member-role">{ROLE_LABEL[m.role] ?? m.role}</span>
        <small class="member-joined">{new Date(m.joinedAt).toLocaleDateString()}</small>
      </div>
    {/each}
  </div>

  <div class="sec-title">Invitar</div>
  <div class="form-row">
    <input class="input" placeholder="Email o ID de jugador" bind:value={inviteTarget} disabled={busy === 'invite'} />
    <button class="btn-sm primary" disabled={busy === 'invite' || !inviteTarget.trim()} on:click={invite}>
      {busy === 'invite' ? '…' : 'Invitar'}
    </button>
  </div>

  <div class="sec-title">Objetivos</div>
  {#if sortedGoals.length === 0}
    <div class="empty-msg">Sin objetivos todavía.</div>
  {:else}
    <div class="list">
      {#each sortedGoals as g (g.id)}
        {@const done = g.status === 'completed' || goalPercent(g) >= 100}
        <div class="goal" class:done={done}>
          <div class="goal-top">
            <span class="goal-title">{g.title}</span>
            <span class="goal-status">{done ? 'Cumplido' : METRIC_LABEL[g.metric] ?? g.metric}</span>
          </div>
          {#if g.description}<small class="goal-desc">{g.description}</small>{/if}
          <div class="goal-bar"><div class="goal-fill" style="width:{goalPercent(g)}%"></div></div>
          <div class="goal-foot">
            <small class="goal-num">{Math.min(g.progress, g.target)}/{g.target}</small>
            <div class="goal-actions">
              {#if !done}
                <button class="btn-sm primary" disabled={busy === `goal-${g.id}`} on:click={() => addProgress(g)}>
                  +1
                </button>
              {/if}
              {#if isLeader}
                <button class="btn-sm danger" disabled={busy === `goal-${g.id}`} on:click={() => deleteGoal(g)} title="Borrar objetivo">
                  ✕
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="sec-title">Nuevo objetivo</div>
  <div class="form-col">
    <div class="form-row">
      <input class="input" placeholder="Título del objetivo" bind:value={goalTitle} disabled={busy === 'goal-create'} />
      <select class="input" bind:value={goalMetric} disabled={busy === 'goal-create'}>
        <option value="xp">XP</option>
        <option value="visits">Visitas</option>
        <option value="generic">Progreso</option>
      </select>
      <input class="input goal-target" type="number" min="1" placeholder="Meta" bind:value={goalTarget} disabled={busy === 'goal-create'} />
    </div>
    <button class="btn-sm primary" disabled={busy === 'goal-create' || !goalTitle.trim() || !(parseInt(goalTarget, 10) > 0)} on:click={createGoal}>
      {busy === 'goal-create' ? 'Creando…' : '+ Nuevo objetivo'}
    </button>
  </div>

  <div class="sec-title">Chat</div>
  <div class="chat" bind:this={chatEl}>
    {#if $clanMessagesStore.length === 0}
      <div class="empty-msg">Sé el primero en escribir.</div>
    {:else}
      {#each $clanMessagesStore as m (m.id)}
        <div class="chat-msg">
          <div class="chat-meta">
            <span class="chat-sender">{m.senderName}</span>
            <small class="chat-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          </div>
          <div class="chat-body">{m.body}</div>
        </div>
      {/each}
    {/if}
  </div>
  <div class="form-row">
    <input class="input" placeholder="Escribe un mensaje…" bind:value={chatInput} disabled={busy === 'chat'} on:keydown={(e) => e.key === 'Enter' && sendMsg()} />
    <button class="btn-sm primary" disabled={busy === 'chat' || !chatInput.trim()} on:click={sendMsg}>
      {busy === 'chat' ? '…' : 'Enviar'}
    </button>
  </div>

  <button class="danger" disabled={!!busy} on:click={leave}>{busy === 'leave' ? 'Salendo…' : 'Salir del clan'}</button>

{:else}
  <div class="empty-msg">No estás en ningún clan todavía.</div>

  <div class="sec-title">Crear clan</div>
  <div class="form-col">
    <input class="input" placeholder="Nombre del clan" bind:value={name} disabled={busy === 'create'} />
    <input class="input" placeholder="Tag (p. ej. PCK)" bind:value={tag} disabled={busy === 'create'} />
    <textarea class="input desc" rows="2" placeholder="Descripción (opcional)" bind:value={description} disabled={busy === 'create'}></textarea>
    <button class="btn primary" disabled={busy === 'create' || !name.trim() || !tag.trim()} on:click={create}>
      {busy === 'create' ? 'Creando…' : 'Crear clan'}
    </button>
  </div>

  <div class="sec-title">Unirse por tag</div>
  <div class="form-row">
    <input class="input" placeholder="Tag del clan" bind:value={joinTag} disabled={busy === 'join'} />
    <button class="btn-sm primary" disabled={busy === 'join' || !joinTag.trim()} on:click={join}>
      {busy === 'join' ? '…' : 'Unirse'}
    </button>
  </div>
{/if}

{#if error}<div class="error-msg">{error}</div>{/if}
{#if ok}<div class="ok-msg">{ok}</div>{/if}
<button class="primary" on:click={load}>↻ Actualizar</button>

<style>
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 12px 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
  .clan-card { display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .clan-head { display: flex; justify-content: space-between; align-items: flex-start; }
  .clan-head h4 { margin: 0; font-size: 15px; }
  .clan-head .tag { color: var(--accent-ink); font-size: 12px; }
  .clan-head small { color: var(--ink-muted); font-size: 11px; }
  .clan-xp { font-size: 16px; font-weight: 700; color: var(--accent-ink); }
  .clan-meta { font-size: 11px; color: var(--ink-muted); }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .member { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .member-name { font-size: 13px; font-weight: 600; }
  .member-role { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-pills); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); }
  .member-joined { margin-left: auto; font-size: 10px; color: var(--ink-muted); }
  .p-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .p-dot.online { background: var(--success); }
  .p-dot.offline { background: var(--ink-muted); opacity: 0.5; }
  .form-row { display: flex; gap: 6px; }
  .form-col { display: flex; flex-direction: column; gap: 6px; }
  .input { width: 100%; padding: 8px 10px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); font-size: 13px; color: var(--ink); }
  .form-row .input { flex: 1; min-width: 0; width: auto; }
  .input.desc { resize: none; }
  .btn { padding: 9px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: var(--accent); color: var(--on-color); }
  .btn-sm { padding: 5px 10px; border: none; border-radius: var(--radius-2xl); font-size: 12px; font-weight: 700; cursor: pointer; }
  .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm.primary { background: var(--accent); color: var(--on-color); white-space: nowrap; }
  .danger { margin-top: 10px; width: 100%; padding: 8px; border: 1px solid var(--danger); border-radius: var(--radius-2xl); background: color-mix(in srgb, var(--danger) 12%, var(--surface)); color: var(--danger-ink); font-weight: 700; cursor: pointer; }
  .danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
  .goal-target { flex: 0 0 70px; width: 70px; }
  .goal { padding: 8px 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 4px; }
  .goal.done { border-color: var(--success); }
  .goal-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .goal-title { font-size: 13px; font-weight: 600; }
  .goal-status { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-pills); background: color-mix(in srgb, var(--accent) 14%, var(--surface)); color: var(--accent-ink); }
  .goal.done .goal-status { background: color-mix(in srgb, var(--success) 14%, var(--surface)); color: var(--success-ink); }
  .goal-desc { font-size: 11px; color: var(--ink-muted); }
  .goal-bar { height: 6px; border-radius: 999px; background: var(--surface); overflow: hidden; }
  .goal-fill { height: 100%; background: var(--accent); transition: width .25s ease; }
  .goal.done .goal-fill { background: var(--success); }
  .goal-foot { display: flex; justify-content: space-between; align-items: center; }
  .goal-num { font-size: 11px; color: var(--ink-muted); }
  .goal-actions { display: flex; gap: 4px; }
  .btn-sm.danger { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger-ink); }
  .chat { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: var(--radius-2xl); background: var(--surface); border: 1px solid var(--line-soft); }
  .chat-msg { display: flex; flex-direction: column; gap: 1px; }
  .chat-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .chat-sender { font-size: 12px; font-weight: 700; color: var(--accent-ink); }
  .chat-time { font-size: 10px; color: var(--ink-muted); }
  .chat-body { font-size: 13px; color: var(--ink); word-break: break-word; }
</style>
