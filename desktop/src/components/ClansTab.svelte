<script lang="ts">
  /** Clanes (feature 021): crear/unirse por tag, roster con presencia y rango, invitar y salir.
   *  Además: chat del clan y objetivos de clan (con progreso en vivo por socket).
   *  Rangos del Nexo (docs/LORE.md §8): Forjador > Guardián > Vigía > Hermano; las acciones de
   *  gestión solo se muestran a quien puede hacerlas (el backend las valida igualmente). */
  import SocialAvatar from './SocialAvatar.svelte';
  import { onMount } from 'svelte';
  import {
    Shield, Crown, Eye, Users, Target, MessageCircle, Pencil, Plus, Trash2, Send, RefreshCw, UserPlus,
    AlertCircle, CircleCheck, LogOut, Sparkles, ChevronUp, ChevronDown, X,
  } from 'lucide-svelte';
  import {
    api,
    type ClanMember,
    type ClanMessage,
    type ClanRole,
    type ClanSummary,
    type ClanGoal,
    type ClanGoalMetric,
  } from '../lib/api';
  import {
    clanMessagesStore,
    clanGoalsStore,
    clanRosterTick,
    pushClanMessage,
    setClanMessages,
    setClanGoals,
    upsertClanGoal,
    dropClanGoal,
    dropClanMessage,
    clearClan,
    goalPercent,
    clanRole,
    clanMemberActions,
    hasClanRank,
    CLAN_ROLE_LABEL,
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

  // Edición del clan (Guardián+)
  let editing = false;
  let editName = '';
  let editDescription = '';
  /** Confirmación en dos pasos en el propio botón (sin confirm() nativo, que congela Tauri). */
  let armed = '';
  let armedTimer: ReturnType<typeof setTimeout> | undefined;

  const METRIC_LABEL: Record<string, string> = { xp: 'XP', visits: 'Visitas', generic: 'Progreso' };
  const ROLE_ICON: Record<string, any> = { creator: Crown, admin: Shield, moderator: Eye };
  /** Sección visible dentro del clan (en vez de apilarlo todo). */
  let section: 'members' | 'goals' | 'chat' = 'members';
  let showGoalForm = false;
  $: onlineMembers = clan ? clan.members.filter((m) => m.isOnline).length : 0;
  $: activeGoals = $clanGoalsStore.filter((g) => g.status !== 'completed' && goalPercent(g) < 100).length;  /** Mi rango en el clan (derivado del roster). */
  $: myRole = clanRole(clan?.members.find((m) => m.userId === meId)?.role ?? (clan && clan.leaderId === meId ? 'creator' : 'member'));
  $: canInvite = hasClanRank(myRole, 'moderator');
  $: canModerate = hasClanRank(myRole, 'moderator');
  $: canEdit = hasClanRank(myRole, 'admin');
  $: isCreator = myRole === 'creator';
  /** Roster ordenado por rango (Forjador primero) y antigüedad. */
  $: roster = clan
    ? [...clan.members].sort(
        (a, b) =>
          ['creator', 'admin', 'moderator', 'member'].indexOf(clanRole(a.role)) -
            ['creator', 'admin', 'moderator', 'member'].indexOf(clanRole(b.role)) ||
          new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      )
    : [];

  /** Recarga cuando el socket avisa de cambios de roster (rangos, expulsiones, disolución). */
  let lastTick = 0;
  $: if ($clanRosterTick !== lastTick) {
    lastTick = $clanRosterTick;
    if (!loading) load();
  }
  /** Objetivos activos primero, luego los completados. */
  $: sortedGoals = [...$clanGoalsStore].sort(
    (a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0),
  );
  /** El chat siempre queda pegado al final al llegar mensajes. */
  $: if (chatEl && $clanMessagesStore) {
    const el = chatEl;
    queueMicrotask(() => (el.scrollTop = el.scrollHeight));
  }

  async function load() {
    loading = true;
    error = '';
    try {
      clan = await api.getMyClan(); // null si aún no hay clan (404 del contrato)
      if (clan) {
        // Roster vivo por el endpoint dedicado (el summary puede traerlo cacheado)
        try {
          const fresh = await api.getClanMembers(clan.id);
          if (fresh?.members?.length) clan = fresh;
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

  /** Quien soy (para saber mi rango) + objetivos y chat del clan. */
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

  // ── Gestión del Nexo (rangos) ──────────────────────────────────────────────
  /** Primer clic arma la acción `key`; el segundo (antes de 4 s) la ejecuta. */
  function confirmTwice(key: string, run: () => void) {
    if (armed === key) {
      armed = '';
      clearTimeout(armedTimer);
      run();
      return;
    }
    armed = key;
    clearTimeout(armedTimer);
    armedTimer = setTimeout(() => (armed = ''), 4000);
  }

  /** Ejecuta una acción de gestión con estado busy/errores comunes. */
  async function manage(key: string, action: () => Promise<unknown>, success: string) {
    busy = key;
    error = '';
    ok = '';
    try {
      await action();
      ok = success;
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  function kick(m: ClanMember) {
    if (!clan) return;
    const id = clan.id;
    confirmTwice(`kick-${m.userId}`, () =>
      manage(`member-${m.userId}`, () => api.kickClanMember(id, m.userId), `${m.displayName} ha sido expulsado del Nexo.`),
    );
  }

  function changeRole(m: ClanMember, role: Exclude<ClanRole, 'creator'>) {
    if (!clan) return;
    const id = clan.id;
    manage(
      `member-${m.userId}`,
      () => api.setClanMemberRole(id, m.userId, role),
      `${m.displayName} ahora es ${CLAN_ROLE_LABEL[role]}.`,
    );
  }

  function transfer(m: ClanMember) {
    if (!clan) return;
    const id = clan.id;
    confirmTwice(`transfer-${m.userId}`, () =>
      manage(`member-${m.userId}`, () => api.transferClanCreator(id, m.userId), `Has cedido la Forja a ${m.displayName}. Ahora eres Guardián.`),
    );
  }

  function startEdit() {
    if (!clan) return;
    editName = clan.name;
    editDescription = clan.description ?? '';
    editing = true;
  }

  async function saveEdit() {
    if (!clan || !editName.trim()) return;
    const id = clan.id;
    await manage('edit', () => api.updateClan(id, { name: editName.trim(), description: editDescription.trim() || null }), 'Nexo actualizado.');
    if (!error) editing = false;
  }

  function disband() {
    if (!clan) return;
    const id = clan.id;
    confirmTwice('disband', async () => {
      await manage('disband', () => api.disbandClan(id), 'El Nexo se ha deshecho y ha vuelto al Éter.');
      if (!error) clearClan();
    });
  }

  async function deleteMsg(m: ClanMessage) {
    if (!clan) return;
    busy = `msg-${m.id}`;
    error = '';
    try {
      await api.deleteClanMessage(clan.id, m.id);
      dropClanMessage(m.id);
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
      showGoalForm = false;
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
    if (!clan || !canModerate) return;
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

<div class="soc">
  {#if error}<div class="soc-notice soc-notice--error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>{/if}
  {#if ok}<div class="soc-notice soc-notice--ok" role="status"><CircleCheck size={15} /><span>{ok}</span></div>{/if}

  {#if loading && !clan}
    <div class="soc-loading" aria-label="Cargando clan">
      <div class="soc-skel tall"></div>
      <div class="soc-skel"></div>
      <div class="soc-skel"></div>
    </div>
  {:else if clan}
    <!-- Cabecera del Nexo -->
    <div class="clan-hero">
      <div class="clan-hero__crest" aria-hidden="true"><Shield size={26} /></div>
      <div class="clan-hero__info">
        <div class="clan-hero__title">
          <span class="clan-name">{clan.name}</span>
          <span class="chip clan-tag">[{clan.tag}]</span>
        </div>
        <p class="clan-desc">{clan.description || 'Sin descripción'}</p>
        <div class="clan-stats">
          <span class="chip clan-stat"><Sparkles size={12} /> {(clan.xp ?? 0).toLocaleString()} XP</span>
          <span class="chip clan-stat" title="Hebras"><Users size={12} /> {clan.memberCount}</span>
          <span class="chip clan-stat role-chip role-{myRole}" title="Tu rango">
            {#if ROLE_ICON[myRole]}<svelte:component this={ROLE_ICON[myRole]} size={12} />{/if}
            {CLAN_ROLE_LABEL[myRole]}
          </span>
        </div>
      </div>
      <div class="clan-hero__tools">
        {#if canEdit && !editing}
          <button class="btn btn--ghost btn--icon soc-ibtn" title="Editar Nexo" aria-label="Editar Nexo" on:click={startEdit}><Pencil size={15} /></button>
        {/if}
        <button class="btn btn--ghost btn--icon soc-ibtn soc-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar clan" on:click={load}>
          <RefreshCw size={15} />
        </button>
      </div>
    </div>

    {#if editing}
      <form class="soc-card" on:submit|preventDefault={saveEdit}>
        <span class="soc-card__title"><Pencil size={14} /> Editar Nexo</span>
        <input class="input" placeholder="Nombre del clan" aria-label="Nombre del clan" maxlength="40" bind:value={editName} disabled={busy === 'edit'} />
        <textarea class="input desc" rows="2" maxlength="300" placeholder="Descripción" aria-label="Descripción" bind:value={editDescription} disabled={busy === 'edit'}></textarea>
        <div class="soc-inline end">
          <button type="button" class="btn btn--sm btn--ghost" disabled={busy === 'edit'} on:click={() => (editing = false)}>Cancelar</button>
          <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'edit' || !editName.trim()}>
            {busy === 'edit' ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    {/if}

    <div class="soc-seg" role="tablist" aria-label="Secciones del clan">
      <button role="tab" aria-selected={section === 'members'} class:active={section === 'members'} on:click={() => (section = 'members')}>
        <Users size={14} /> Miembros <span class="seg-n" title="En línea / total">{onlineMembers}/{clan.members.length}</span>
      </button>
      <button role="tab" aria-selected={section === 'goals'} class:active={section === 'goals'} on:click={() => (section = 'goals')}>
        <Target size={14} /> Objetivos {#if activeGoals}<span class="seg-n">{activeGoals}</span>{/if}
      </button>
      <button role="tab" aria-selected={section === 'chat'} class:active={section === 'chat'} on:click={() => (section = 'chat')}>
        <MessageCircle size={14} /> Chat
      </button>
    </div>

    {#if section === 'members'}
      <section class="soc-list">
        {#each roster as m (m.userId)}
          {@const acts = m.userId === meId ? null : clanMemberActions(myRole, m.role)}
          {@const role = clanRole(m.role)}
          <div class="soc-row member" class:me={m.userId === meId}>
            <div class="member-main">
              <SocialAvatar name={m.displayName} presence={m.isOnline ? 'online' : 'offline'} />
              <div class="soc-row__body">
                <span class="soc-row__title">{m.displayName}{m.userId === meId ? ' (tú)' : ''}</span>
                <span class="soc-row__sub">Desde {new Date(m.joinedAt).toLocaleDateString()}</span>
              </div>
              <span class="chip soc-chip role-chip role-{role}">
                {#if ROLE_ICON[role]}<svelte:component this={ROLE_ICON[role]} size={11} />{/if}
                {CLAN_ROLE_LABEL[role]}
              </span>
            </div>
            {#if acts && (acts.kick || acts.promote || acts.demote || acts.transfer)}
              <div class="member-actions">
                {#if acts.promote}
                  <button class="btn btn--sm btn--ghost" disabled={busy === `member-${m.userId}`} on:click={() => acts.promote && changeRole(m, acts.promote)}>
                    <ChevronUp size={14} /> {CLAN_ROLE_LABEL[acts.promote]}
                  </button>
                {/if}
                {#if acts.demote}
                  <button class="btn btn--sm btn--ghost" disabled={busy === `member-${m.userId}`} on:click={() => acts.demote && changeRole(m, acts.demote)}>
                    <ChevronDown size={14} /> {CLAN_ROLE_LABEL[acts.demote]}
                  </button>
                {/if}
                {#if acts.transfer}
                  <button class="btn btn--sm btn--ghost" class:armed={armed === `transfer-${m.userId}`} disabled={busy === `member-${m.userId}`} on:click={() => transfer(m)}>
                    <Crown size={14} /> {armed === `transfer-${m.userId}` ? '¿Seguro? Ceder' : 'Ceder Forja'}
                  </button>
                {/if}
                {#if acts.kick}
                  <button class="btn btn--sm btn--ghost danger-ghost" class:armed={armed === `kick-${m.userId}`} disabled={busy === `member-${m.userId}`} on:click={() => kick(m)}>
                    {armed === `kick-${m.userId}` ? '¿Seguro? Expulsar' : 'Expulsar'}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </section>

      {#if canInvite}
        <form class="soc-card" on:submit|preventDefault={invite}>
          <span class="soc-card__title"><UserPlus size={15} /> Invitar al Nexo</span>
          <div class="soc-inline">
            <input class="input" placeholder="Email o ID de jugador" aria-label="Email o ID de jugador" bind:value={inviteTarget} disabled={busy === 'invite'} />
            <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'invite' || !inviteTarget.trim()}>
              {busy === 'invite' ? 'Enviando…' : 'Invitar'}
            </button>
          </div>
        </form>
      {/if}

      <!-- Zona de peligro -->
      <div class="danger-zone">
        {#if isCreator && clan.memberCount > 1}
          <p class="soc-card__hint">Como Forjador, cede la Forja a otra hebra antes de salir del Nexo.</p>
        {:else}
          <button class="btn btn--sm btn--ghost danger-ghost" disabled={!!busy} on:click={leave}>
            <LogOut size={14} /> {busy === 'leave' ? 'Saliendo…' : 'Salir del clan'}
          </button>
        {/if}
        {#if isCreator}
          <button class="btn btn--sm btn--ghost danger-ghost" class:armed={armed === 'disband'} disabled={!!busy} on:click={disband}>
            <Trash2 size={14} /> {busy === 'disband' ? 'Deshaciendo…' : armed === 'disband' ? '¿Seguro? Se borrará todo' : 'Disolver el Nexo'}
          </button>
        {/if}
      </div>

    {:else if section === 'goals'}
      <section class="soc-list">
        <div class="soc-head">
          <span class="label-caps">Objetivos del Nexo</span>
          <div class="soc-head__end">
            <button class="btn btn--sm" class:btn--ink={showGoalForm} on:click={() => (showGoalForm = !showGoalForm)} aria-expanded={showGoalForm}>
              {#if showGoalForm}<X size={14} /> Cerrar{:else}<Plus size={14} /> Nuevo{/if}
            </button>
          </div>
        </div>

        {#if showGoalForm}
          <form class="soc-card" on:submit|preventDefault={createGoal}>
            <input class="input" placeholder="Título del objetivo" aria-label="Título del objetivo" bind:value={goalTitle} disabled={busy === 'goal-create'} />
            <div class="soc-inline">
              <select class="input" aria-label="Métrica" bind:value={goalMetric} disabled={busy === 'goal-create'}>
                <option value="xp">XP</option>
                <option value="visits">Visitas</option>
                <option value="generic">Progreso</option>
              </select>
              <input class="input goal-target" type="number" min="1" placeholder="Meta" aria-label="Meta" bind:value={goalTarget} disabled={busy === 'goal-create'} />
              <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'goal-create' || !goalTitle.trim() || !(parseInt(goalTarget, 10) > 0)}>
                {busy === 'goal-create' ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </form>
        {/if}

        {#each sortedGoals as g (g.id)}
          {@const done = g.status === 'completed' || goalPercent(g) >= 100}
          <div class="goal" class:done>
            <div class="goal-top">
              <span class="goal-title">{g.title}</span>
              <span class="chip soc-chip goal-status">{done ? 'Cumplido' : METRIC_LABEL[g.metric] ?? g.metric}</span>
            </div>
            {#if g.description}<span class="soc-row__sub">{g.description}</span>{/if}
            <div class="goal-foot">
              <div class="meter goal-meter" style="--meter-color: {done ? 'var(--success)' : 'var(--theme-social)'}">
                <i style="width: {goalPercent(g)}%"></i>
              </div>
              <span class="goal-num">{Math.min(g.progress, g.target)}/{g.target}</span>
              {#if !done}
                <button class="btn btn--sm soc-ibtn" title="Sumar 1" aria-label="Sumar 1 a {g.title}" disabled={busy === `goal-${g.id}`} on:click={() => addProgress(g)}>+1</button>
              {/if}
              {#if canModerate}
                <button class="btn btn--ghost btn--icon soc-ibtn soc-ibtn--no" title="Borrar objetivo" aria-label="Borrar {g.title}" disabled={busy === `goal-${g.id}`} on:click={() => deleteGoal(g)}>
                  <Trash2 size={14} />
                </button>
              {/if}
            </div>
          </div>
        {:else}
          {#if !showGoalForm}
            <div class="soc-empty">
              <span class="soc-empty__icon"><Target size={22} /></span>
              <strong>Sin objetivos todavía</strong>
              <p>Proponed una meta común y sumad progreso entre todos.</p>
            </div>
          {/if}
        {/each}
      </section>

    {:else}
      <section class="chat-box">
        <div class="chat" bind:this={chatEl}>
          {#each $clanMessagesStore as m (m.id)}
            {@const mine = m.userId === meId}
            <div class="msg" class:mine>
              {#if !mine}<SocialAvatar name={m.senderName} size={26} />{/if}
              <div class="bubble">
                <div class="bubble-meta">
                  {#if !mine}<span class="sender">{m.senderName}</span>{/if}
                  <span class="time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {#if canModerate || mine}
                    <button class="msg-del" title="Borrar mensaje" aria-label="Borrar mensaje" disabled={busy === `msg-${m.id}`} on:click={() => deleteMsg(m)}><X size={11} /></button>
                  {/if}
                </div>
                <div class="bubble-body">{m.body}</div>
              </div>
            </div>
          {:else}
            <div class="chat-empty">
              <MessageCircle size={22} />
              <span>Sé el primero en escribir.</span>
            </div>
          {/each}
        </div>
        <form class="chat-input" on:submit|preventDefault={sendMsg}>
          <input class="input" placeholder="Escribe un mensaje…" aria-label="Mensaje" bind:value={chatInput} disabled={busy === 'chat'} />
          <button type="submit" class="btn btn--primary btn--icon soc-ibtn" title="Enviar" aria-label="Enviar" disabled={busy === 'chat' || !chatInput.trim()}>
            <Send size={15} />
          </button>
        </form>
      </section>
    {/if}

  {:else}
    <!-- Sin clan -->
    <div class="soc-empty no-clan">
      <span class="soc-empty__icon"><Shield size={24} /></span>
      <strong>Aún no perteneces a ningún Nexo</strong>
      <p>Funda el tuyo o únete al de tus amigos con su tag.</p>
    </div>

    <form class="soc-card" on:submit|preventDefault={join}>
      <span class="soc-card__title"><Users size={15} /> Unirse por tag</span>
      <div class="soc-inline">
        <input class="input tag-input" placeholder="TAG" aria-label="Tag del clan" bind:value={joinTag} disabled={busy === 'join'} />
        <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'join' || !joinTag.trim()}>
          {busy === 'join' ? 'Uniéndote…' : 'Unirse'}
        </button>
      </div>
    </form>

    <form class="soc-card" on:submit|preventDefault={create}>
      <span class="soc-card__title"><Plus size={15} /> Fundar un Nexo</span>
      <div class="soc-inline">
        <input class="input" placeholder="Nombre del clan" aria-label="Nombre del clan" bind:value={name} disabled={busy === 'create'} />
        <input class="input tag-input short" placeholder="TAG" aria-label="Tag (p. ej. PCK)" bind:value={tag} disabled={busy === 'create'} />
      </div>
      <textarea class="input desc" rows="2" placeholder="Descripción (opcional)" aria-label="Descripción" bind:value={description} disabled={busy === 'create'}></textarea>
      <button type="submit" class="btn btn--primary" disabled={busy === 'create' || !name.trim() || !tag.trim()}>
        {busy === 'create' ? 'Creando…' : 'Crear clan'}
      </button>
    </form>
  {/if}
</div>

<style>
  .soc-skel.tall {
    height: 110px;
  }

  /* Cabecera del Nexo */
  .clan-hero {
    display: flex;
    gap: 12px;
    padding: 14px;
    border: var(--outline);
    border-radius: var(--radius-cards);
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--theme-social) 34%, transparent), transparent 62%),
      var(--surface);
    box-shadow: var(--shadow-pop);
  }
  .clan-hero__crest {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    border: 1.5px solid var(--color-carbon);
    background: var(--theme-social);
    color: var(--on-color);
    box-shadow: 2px 3px 0 var(--color-carbon);
    rotate: -4deg;
  }
  .clan-hero__info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .clan-hero__title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .clan-name {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: 19px;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .clan-tag {
    padding: 1px 8px;
    font-size: 11px;
    background: var(--surface-2);
  }
  .clan-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.35;
    color: var(--ink-muted);
  }
  .clan-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .clan-stat {
    padding: 2px 8px;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .clan-hero__tools {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: -6px -6px 0 0;
  }

  /* Rangos */
  .role-chip {
    gap: 4px;
  }
  .role-chip.role-creator {
    background: color-mix(in srgb, var(--color-sunburst) 55%, var(--surface));
    border-color: var(--color-carbon);
  }
  .role-chip.role-admin {
    background: color-mix(in srgb, var(--color-electric-blue) 30%, var(--surface));
    border-color: var(--color-carbon);
  }
  .role-chip.role-moderator {
    background: color-mix(in srgb, var(--color-lavender) 40%, var(--surface));
  }
  .role-chip.role-member {
    color: var(--ink-muted);
  }

  .seg-n {
    font-size: 10px;
    font-weight: 800;
    padding: 0 6px;
    border-radius: var(--radius-pills);
    background: color-mix(in srgb, var(--theme-social) 40%, var(--surface));
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  /* Miembros */
  .member {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .member.me {
    border-color: color-mix(in srgb, var(--theme-social) 70%, var(--line));
  }
  .member-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .member-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    padding-top: 6px;
    border-top: 1px dashed var(--line-soft);
  }
  .danger-ghost {
    color: var(--danger-ink);
  }
  .danger-ghost:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
  .armed {
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    border-color: var(--danger);
    color: var(--danger-ink);
  }
  .danger-zone {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line-soft);
  }
  .danger-zone .soc-card__hint {
    text-align: center;
  }

  /* Objetivos */
  .goal {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .goal.done {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, var(--surface));
  }
  .goal-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .goal-title {
    font-size: 13px;
    font-weight: 700;
  }
  .goal.done .goal-status {
    background: var(--success);
    color: var(--on-color);
    border-color: var(--color-carbon);
  }
  .goal-foot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .goal-meter {
    flex: 1;
    height: 8px;
  }
  .goal-num {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .soc-inline .goal-target {
    flex: 0 0 72px;
  }

  /* Chat */
  .chat-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chat {
    min-height: 160px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-cards);
    background: var(--surface-2);
  }
  .chat-empty {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .msg {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    max-width: 88%;
  }
  .msg.mine {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .bubble {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
    border: 1px solid var(--line-soft);
    border-radius: 14px 14px 14px 4px;
    background: var(--surface);
    min-width: 0;
  }
  .msg.mine .bubble {
    border-radius: 14px 14px 4px 14px;
    background: color-mix(in srgb, var(--theme-social) 28%, var(--surface));
    border-color: color-mix(in srgb, var(--theme-social) 60%, var(--line-soft));
  }
  .bubble-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--ink-muted);
  }
  .sender {
    font-weight: 800;
    color: var(--accent-ink);
  }
  .bubble-body {
    font-size: 13px;
    line-height: 1.35;
    color: var(--ink);
    word-break: break-word;
    user-select: text;
  }
  .msg-del {
    display: inline-grid;
    place-items: center;
    margin-left: auto;
    padding: 1px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--dur-1);
  }
  .msg:hover .msg-del,
  .msg-del:focus-visible {
    opacity: 1;
  }
  .msg-del:hover {
    color: var(--danger-ink);
  }
  .chat-input {
    display: flex;
    gap: 6px;
  }
  .chat-input .input {
    flex: 1;
    min-width: 0;
  }

  /* Formularios */
  .desc {
    resize: none;
  }
  .soc-inline.end {
    justify-content: flex-end;
  }
  .tag-input {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }
  .soc-inline .tag-input.short {
    flex: 0 0 84px;
  }
  .no-clan {
    border-style: solid;
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--theme-social) 22%, transparent), transparent 70%),
      var(--surface);
  }
</style>
