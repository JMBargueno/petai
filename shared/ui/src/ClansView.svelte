<script lang="ts">
  /** Clanes (feature 021): crear/unirse por tag, roster con presencia y rango, invitar y salir.
   *  Además: chat del clan y objetivos de clan (con progreso en vivo por el feed social).
   *  Rangos del Nexo (docs/LORE.md §8): Forjador > Guardián > Vigía > Hermano; las acciones de
   *  gestión solo se muestran a quien puede hacerlas (el backend las valida igualmente).
   *
   *  Toda la pantalla vive aquí y habla con el servidor por el puerto `clansApi` (cada app pone el
   *  suyo). El hábitat del clan es de cada app: si pasa `habitat` (un componente que recibe
   *  `clanId`, `xp`, `refreshKey` y avisa con `xp`), la cabecera del clan se pinta dentro. */
  import SocialAvatar from './SocialAvatar.svelte';
  import { onMount, type ComponentType } from 'svelte';
  import { isNearBottom } from './chatScroll';
  import Button from './Button.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import Notice from './Notice.svelte';
  import { handleFormatError, normalizeHandle } from './handle';
  import type { ClansApi } from './social/clansApi';
  import {
    Shield, Crown, Eye, Users, Target, MessageCircle, Pencil, Plus, Trash2, Send, RefreshCw, UserPlus,
    AlertCircle, CircleCheck, LogOut, Sparkles, ChevronUp, ChevronDown, X,
  } from 'lucide-svelte';
  import type { ClanMember, ClanMessage, ClanRole, ClanSummary, ClanGoal, ClanGoalMetric } from './social/types';
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
  } from './social/clans';

  /** Cómo habla esta pantalla con el servidor. */
  export let clansApi: ClansApi;
  /** Hábitat del clan (opcional): envuelve la cabecera del clan. */
  export let habitat: ComponentType | null = null;

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
  /** El chat sigue al último mensaje solo si ya estabas abajo: si has subido a leer, no te mueve. */
  let chatPinned = true;
  $: if (chatEl && $clanMessagesStore && chatPinned) {
    const el = chatEl;
    queueMicrotask(() => (el.scrollTop = el.scrollHeight));
  }

  /** Acción destructiva pendiente de confirmar en un diálogo. */
  let pending: { title: string; text: string; label: string; run: () => Promise<void> | void } | null = null;
  let confirming = false;
  async function runPending() {
    if (!pending) return;
    confirming = true;
    try {
      await pending.run();
    } finally {
      confirming = false;
      pending = null;
    }
  }
  const askLeave = () =>
    (pending = { title: 'Salir del clan', label: 'Salir', text: `Dejarás ${clan?.name ?? 'el clan'} y perderás el acceso a su chat y a sus objetivos. Para volver necesitarás su tag o una invitación.`, run: leave });
  const askDeleteGoal = (g: ClanGoal) =>
    (pending = { title: 'Borrar objetivo', label: 'Borrar', text: `Se borrará «${g.title}» con su progreso (${g.progress}/${g.target}) para todo el clan.`, run: () => deleteGoal(g) });
  const askDeleteMsg = (m: ClanMessage) =>
    (pending = { title: 'Borrar mensaje', label: 'Borrar', text: `«${m.body.length > 120 ? m.body.slice(0, 120) + '…' : m.body}»`, run: () => deleteMsg(m) });

  /** Cada recarga del clan vuelve a sortear los pockais del hábitat. */
  let habitatKey = 0;

  async function load() {
    loading = true;
    error = '';
    habitatKey += 1;
    try {
      clan = await clansApi.getMyClan(); // null si aún no hay clan (404 del contrato)
      if (clan) {
        // Roster vivo por el endpoint dedicado (el summary puede traerlo cacheado)
        try {
          const fresh = await clansApi.getClanMembers(clan.id);
          if (fresh?.members?.length) clan = fresh;
        } catch {
          /* el summary ya trae members; no crítico */
        }
        await loadClanExtras(clan.id);
      } else {
        clearClan();
      }
    } catch (e: any) {
      error = clansApi.errorText(e);
    } finally {
      loading = false;
    }
  }

  /** Quien soy (para saber mi rango) + objetivos y chat del clan. */
  async function loadClanExtras(clanId: string) {
    try {
      const me = await clansApi.getMe();
      meId = me?.id ?? '';
    } catch {
      meId = '';
    }
    try {
      setClanGoals(await clansApi.getClanGoals(clanId));
    } catch {
      setClanGoals([]); // endpoint aún no disponible: se rellena con los eventos del socket
    }
    try {
      setClanMessages(await clansApi.getClanMessages(clanId, { limit: 50 }));
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
      await clansApi.createClan({ name: name.trim(), tag: tag.trim().toUpperCase(), description: description.trim() || undefined });
      ok = `¡Clan ${name.trim()} creado!`;
      name = '';
      tag = '';
      description = '';
      await load();
    } catch (e: any) {
      error = clansApi.errorText(e);
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
      await clansApi.joinClan(joinTag.trim().toUpperCase());
      ok = `¡Has entrado en el clan ${joinTag.trim().toUpperCase()}!`;
      joinTag = '';
      await load();
    } catch (e: any) {
      error = clansApi.errorText(e);
    } finally {
      busy = '';
    }
  }

  async function invite() {
    if (!clan || !inviteTarget.trim()) return;
    busy = 'invite';
    error = '';
    ok = '';
    // Se invita por @nickname (con o sin la @); el email ya no identifica a nadie.
    const handle = normalizeHandle(inviteTarget);
    const formatError = handleFormatError(handle);
    if (formatError) {
      error = `Ese no es un nickname válido: ${formatError.toLowerCase()}`;
      busy = '';
      return;
    }
    try {
      await clansApi.inviteToClan(clan.id, { handle });
      ok = `Invitación enviada a @${handle}.`;
      inviteTarget = '';
      await load();
    } catch (e: any) {
      error = clansApi.errorText(e);
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
      await clansApi.leaveClan();
      ok = 'Has salido del clan.';
      clearClan();
      await load();
    } catch (e: any) {
      error = clansApi.errorText(e);
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
      error = clansApi.errorText(e);
    } finally {
      busy = '';
    }
  }

  function kick(m: ClanMember) {
    if (!clan) return;
    const id = clan.id;
    confirmTwice(`kick-${m.userId}`, () =>
      manage(`member-${m.userId}`, () => clansApi.kickClanMember(id, m.userId), `${m.displayName} ha sido expulsado del Nexo.`),
    );
  }

  function changeRole(m: ClanMember, role: Exclude<ClanRole, 'creator'>) {
    if (!clan) return;
    const id = clan.id;
    manage(
      `member-${m.userId}`,
      () => clansApi.setClanMemberRole(id, m.userId, role),
      `${m.displayName} ahora es ${CLAN_ROLE_LABEL[role]}.`,
    );
  }

  function transfer(m: ClanMember) {
    if (!clan) return;
    const id = clan.id;
    confirmTwice(`transfer-${m.userId}`, () =>
      manage(`member-${m.userId}`, () => clansApi.transferClanCreator(id, m.userId), `Has cedido la Forja a ${m.displayName}. Ahora eres Guardián.`),
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
    await manage('edit', () => clansApi.updateClan(id, { name: editName.trim(), description: editDescription.trim() || null }), 'Nexo actualizado.');
    if (!error) editing = false;
  }

  function disband() {
    if (!clan) return;
    const id = clan.id;
    confirmTwice('disband', async () => {
      await manage('disband', () => clansApi.disbandClan(id), 'El Nexo se ha deshecho y ha vuelto al Éter.');
      if (!error) clearClan();
    });
  }

  async function deleteMsg(m: ClanMessage) {
    if (!clan) return;
    busy = `msg-${m.id}`;
    error = '';
    try {
      await clansApi.deleteClanMessage(clan.id, m.id);
      dropClanMessage(m.id);
    } catch (e: any) {
      error = clansApi.errorText(e);
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
      const goal = await clansApi.createClanGoal(clan.id, { title: goalTitle.trim(), metric: goalMetric, target });
      upsertClanGoal(goal);
      goalTitle = '';
      goalTarget = '';
      ok = 'Objetivo creado.';
      showGoalForm = false;
    } catch (e: any) {
      error = clansApi.errorText(e);
    } finally {
      busy = '';
    }
  }

  async function addProgress(goal: ClanGoal) {
    if (!clan) return;
    busy = `goal-${goal.id}`;
    error = '';
    try {
      const updated = await clansApi.addClanGoalProgress(clan.id, goal.id, 1);
      upsertClanGoal(updated);
    } catch (e: any) {
      error = clansApi.errorText(e);
    } finally {
      busy = '';
    }
  }

  async function deleteGoal(goal: ClanGoal) {
    if (!clan || !canModerate) return;
    busy = `goal-${goal.id}`;
    error = '';
    try {
      await clansApi.deleteClanGoal(clan.id, goal.id);
      dropClanGoal(goal.id);
      ok = 'Objetivo eliminado.';
    } catch (e: any) {
      error = clansApi.errorText(e);
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
      const sent = await clansApi.sendClanMessage(clan.id, body);
      // Lo guardamos ya por si el socket tarda (deduplicado por id en el store)
      if (sent?.id) pushClanMessage(sent);
    } catch (e: any) {
      error = clansApi.errorText(e);
      chatInput = body; // permite reintentar
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<div class="ui-stack">
  <!-- Pegados arriba: se ven aunque la acción esté al final de la lista (invitar, chat, zona de peligro) -->
  {#if error || ok}
    <div class="clan-notice">
      {#if error}<Notice tone="error" dismissible on:dismiss={() => (error = '')}>{error}</Notice>{/if}
      {#if ok}<Notice tone="ok" dismissible on:dismiss={() => (ok = '')}>{ok}</Notice>{/if}
    </div>
  {/if}

  {#if loading && !clan}
    <div class="ui-loading" aria-label="Cargando clan">
      <div class="ui-skel tall"></div>
      <div class="ui-skel"></div>
      <div class="ui-skel"></div>
    </div>
  {:else if clan}
    <!-- Cabecera del Nexo: el hábitat vivo, con la información del clan encima -->
    {#snippet clanHero()}
    {@const c = clan!}
    <div class="clan-hero">
      <div class="clan-hero__crest" aria-hidden="true"><Shield size={26} /></div>
      <div class="clan-hero__info">
        <div class="clan-hero__title">
          <span class="clan-name">{c.name}</span>
          <span class="chip clan-tag">[{c.tag}]</span>
        </div>
        <p class="clan-desc">{c.description || 'Sin descripción'}</p>
        <span class="clan-leader">Forjador: {c.leader?.displayName ?? 'Desconocido'}{c.leader?.handle ? ` · @${c.leader.handle}` : ''}</span>
        <div class="clan-stats">
          <span class="chip clan-stat"><Sparkles size={12} /> {(c.xp ?? 0).toLocaleString()} XP</span>
          <span class="chip clan-stat" title="Hebras"><Users size={12} /> {c.memberCount}</span>
          <span class="chip clan-stat role-chip role-{myRole}" title="Tu rango">
            {#if ROLE_ICON[myRole]}<svelte:component this={ROLE_ICON[myRole]} size={12} />{/if}
            {CLAN_ROLE_LABEL[myRole]}
          </span>
        </div>
      </div>
      <div class="clan-hero__tools">
        {#if canEdit && !editing}
          <Button variant="ghost" class="ui-ibtn" iconOnly label="Editar Nexo" title="Editar Nexo" on:click={startEdit}><Pencil size={15} /></Button>
        {/if}
        <button class="btn btn--ghost btn--icon ui-ibtn ui-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar clan" on:click={load}>
          <RefreshCw size={15} />
        </button>
      </div>
    </div>
    {/snippet}
    {#if habitat}
      <svelte:component this={habitat} clanId={clan.id} xp={clan.xp ?? 0} refreshKey={habitatKey} on:xp={(e) => clan && (clan = { ...clan, xp: e.detail })}>
        {@render clanHero()}
      </svelte:component>
    {:else}
      {@render clanHero()}
    {/if}

    {#if editing}
      <form class="ui-card" on:submit|preventDefault={saveEdit}>
        <span class="ui-card__title"><Pencil size={14} /> Editar Nexo</span>
        <input class="input" placeholder="Nombre del clan" aria-label="Nombre del clan" maxlength="40" bind:value={editName} disabled={busy === 'edit'} />
        <textarea class="input desc" rows="2" maxlength="300" placeholder="Descripción" aria-label="Descripción" bind:value={editDescription} disabled={busy === 'edit'}></textarea>
        <div class="ui-inline end">
          <Button variant="ghost" size="sm" disabled={busy === 'edit'} on:click={() => (editing = false)}>Cancelar</Button>
          <Button variant="primary" size="sm" type="submit" disabled={busy === 'edit' || !editName.trim()}>
            {busy === 'edit' ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    {/if}

    <div class="ui-seg" role="tablist" aria-label="Secciones del clan">
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
      <section class="ui-list">
        {#each roster as m (m.userId)}
          {@const acts = m.userId === meId ? null : clanMemberActions(myRole, m.role)}
          {@const role = clanRole(m.role)}
          <div class="ui-row member" class:me={m.userId === meId}>
            <div class="member-main">
              <SocialAvatar name={m.displayName} presence={m.isOnline ? 'online' : 'offline'} />
              <div class="ui-row__body">
                <span class="ui-row__title">{m.displayName}{#if m.handle} <span class="handle">@{m.handle}</span>{/if}{m.userId === meId ? ' (tú)' : ''}</span>
                <span class="ui-row__sub">Desde {new Date(m.joinedAt).toLocaleDateString()}</span>
              </div>
              <span class="chip ui-chip role-chip role-{role}">
                {#if ROLE_ICON[role]}<svelte:component this={ROLE_ICON[role]} size={11} />{/if}
                {CLAN_ROLE_LABEL[role]}
              </span>
            </div>
            {#if acts && (acts.kick || acts.promote || acts.demote || acts.transfer)}
              <div class="member-actions">
                {#if acts.promote}
                  <Button variant="ghost" size="sm" disabled={busy === `member-${m.userId}`} on:click={() => acts.promote && changeRole(m, acts.promote)}>
                    <ChevronUp size={14} /> {CLAN_ROLE_LABEL[acts.promote]}
                  </Button>
                {/if}
                {#if acts.demote}
                  <Button variant="ghost" size="sm" disabled={busy === `member-${m.userId}`} on:click={() => acts.demote && changeRole(m, acts.demote)}>
                    <ChevronDown size={14} /> {CLAN_ROLE_LABEL[acts.demote]}
                  </Button>
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
        <form class="ui-card" on:submit|preventDefault={invite}>
          <span class="ui-card__title"><UserPlus size={15} /> Invitar al Nexo</span>
          <div class="ui-inline">
            <input class="input" placeholder="@nickname del jugador" aria-label="Nickname del jugador" autocapitalize="none" spellcheck="false" bind:value={inviteTarget} disabled={busy === 'invite'} />
            <Button variant="primary" size="sm" type="submit" disabled={busy === 'invite' || !inviteTarget.trim()}>
              {busy === 'invite' ? 'Enviando…' : 'Invitar'}
            </Button>
          </div>
        </form>
      {/if}

      <!-- Zona de peligro -->
      <div class="danger-zone">
        {#if isCreator && clan.memberCount > 1}
          <p class="ui-card__hint">Como Forjador, cede la Forja a otra hebra antes de salir del Nexo.</p>
        {:else}
          <button class="btn btn--sm btn--ghost danger-ghost" disabled={!!busy} on:click={askLeave}>
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
      <section class="ui-list">
        <div class="ui-head">
          <span class="label-caps">Objetivos del Nexo</span>
          <div class="ui-head__end">
            <button class="btn btn--sm" class:btn--ink={showGoalForm} on:click={() => (showGoalForm = !showGoalForm)} aria-expanded={showGoalForm}>
              {#if showGoalForm}<X size={14} /> Cerrar{:else}<Plus size={14} /> Nuevo{/if}
            </button>
          </div>
        </div>

        {#if showGoalForm}
          <form class="ui-card" on:submit|preventDefault={createGoal}>
            <input class="input" placeholder="Título del objetivo" aria-label="Título del objetivo" bind:value={goalTitle} disabled={busy === 'goal-create'} />
            <div class="ui-inline">
              <select class="input" aria-label="Métrica" bind:value={goalMetric} disabled={busy === 'goal-create'}>
                <option value="xp">XP</option>
                <option value="visits">Visitas</option>
                <option value="generic">Progreso</option>
              </select>
              <input class="input goal-target" type="number" min="1" placeholder="Meta" aria-label="Meta" bind:value={goalTarget} disabled={busy === 'goal-create'} />
              <Button variant="primary" size="sm" type="submit" disabled={busy === 'goal-create' || !goalTitle.trim() || !(parseInt(goalTarget, 10)> 0)}>
                {busy === 'goal-create' ? 'Creando…' : 'Crear'}
              </Button>
            </div>
          </form>
        {/if}

        {#each sortedGoals as g (g.id)}
          {@const done = g.status === 'completed' || goalPercent(g) >= 100}
          <div class="goal" class:done>
            <div class="goal-top">
              <span class="goal-title">{g.title}</span>
              <span class="chip ui-chip goal-status">{done ? 'Cumplido' : METRIC_LABEL[g.metric] ?? g.metric}</span>
            </div>
            {#if g.description}<span class="ui-row__sub">{g.description}</span>{/if}
            <div class="goal-foot">
              <div class="ui-progress goal-meter" style="--progress-c: {done ? 'var(--success)' : 'var(--theme-social)'}">
                <i style="width: {goalPercent(g)}%"></i>
              </div>
              <span class="goal-num">{Math.min(g.progress, g.target)}/{g.target}</span>
              {#if !done}
                <Button size="sm" class="ui-ibtn" label="Sumar 1 a {g.title}" title="Sumar 1" disabled={busy === `goal-${g.id}`} on:click={() => addProgress(g)}>+1</Button>
              {/if}
              {#if canModerate}
                <Button variant="ghost" class="ui-ibtn ui-ibtn--no" iconOnly label="Borrar {g.title}" title="Borrar objetivo" disabled={busy === `goal-${g.id}`} on:click={() => askDeleteGoal(g)}>
                  <Trash2 size={14} />
                </Button>
              {/if}
            </div>
          </div>
        {:else}
          {#if !showGoalForm}
            <div class="ui-empty">
              <span class="ui-empty__icon"><Target size={22} /></span>
              <strong>Sin objetivos todavía</strong>
              <p>Proponed una meta común y sumad progreso entre todos.</p>
            </div>
          {/if}
        {/each}
      </section>

    {:else}
      <section class="chat-box">
        <div class="chat" role="log" aria-label="Chat del clan" bind:this={chatEl} on:scroll={() => chatEl && (chatPinned = isNearBottom(chatEl))}>
          {#each $clanMessagesStore as m (m.id)}
            {@const mine = m.userId === meId}
            <div class="msg" class:mine>
              {#if !mine}<SocialAvatar name={m.senderName} size={26} />{/if}
              <div class="bubble">
                <div class="bubble-meta">
                  {#if !mine}<span class="sender">{m.senderName}</span>{/if}
                  <span class="time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {#if canModerate || mine}
                    <button class="msg-del" title="Borrar mensaje" aria-label="Borrar mensaje" disabled={busy === `msg-${m.id}`} on:click={() => askDeleteMsg(m)}><X size={12} /></button>
                  {/if}
                </div>
                <div class="bubble-body ui-usertext">{m.body}</div>
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
          <Button variant="primary" class="ui-ibtn" iconOnly label="Enviar" type="submit" title="Enviar" disabled={busy === 'chat' || !chatInput.trim()}>
            <Send size={15} />
          </Button>
        </form>
      </section>
    {/if}

  {:else}
    <!-- Sin clan -->
    <div class="ui-empty no-clan">
      <span class="ui-empty__icon"><Shield size={24} /></span>
      <strong>Aún no perteneces a ningún Nexo</strong>
      <p>Funda el tuyo o únete al de tus amigos con su tag.</p>
    </div>

    <form class="ui-card" on:submit|preventDefault={join}>
      <span class="ui-card__title"><Users size={15} /> Unirse por tag</span>
      <div class="ui-inline">
        <input class="input tag-input" placeholder="TAG" aria-label="Tag del clan" maxlength="6" bind:value={joinTag} disabled={busy === 'join'} />
        <Button size="sm" type="submit" disabled={busy === 'join' || !joinTag.trim()}>
          {busy === 'join' ? 'Uniéndote…' : 'Unirse'}
        </Button>
      </div>
    </form>

    <form class="ui-card" on:submit|preventDefault={create}>
      <span class="ui-card__title"><Plus size={15} /> Fundar un Nexo</span>
      <div class="ui-inline">
        <input class="input" placeholder="Nombre del clan" aria-label="Nombre del clan" maxlength="40" bind:value={name} disabled={busy === 'create'} />
        <input class="input tag-input short" placeholder="TAG" aria-label="Tag (p. ej. PCK)" maxlength="6" bind:value={tag} disabled={busy === 'create'} />
      </div>
      <textarea class="input desc" rows="2" maxlength="300" placeholder="Descripción (opcional)" aria-label="Descripción" bind:value={description} disabled={busy === 'create'}></textarea>
      <p class="form-hint">El tag es un código corto en mayúsculas (por ejemplo, PCK): con él os encontrarán.</p>
      <Button variant="primary" type="submit" disabled={busy === 'create' || !name.trim() || !tag.trim()}>
        {busy === 'create' ? 'Creando…' : 'Crear clan'}
      </Button>
    </form>
  {/if}

  {#if pending}
    <ConfirmDialog title={pending.title} icon="trash" danger confirmLabel={pending.label} loading={confirming} on:confirm={runPending} on:cancel={() => (pending = null)}>
      <p class="ui-usertext">{pending.text}</p>
      <p>No se puede deshacer.</p>
    </ConfirmDialog>
  {/if}
</div>

<style>
  .clan-notice {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .ui-skel.tall {
    height: 110px;
  }

  /* Cabecera del Nexo */
  /* Placa de cristal sobre el hábitat (ClanHabitat la coloca arriba) */
  .clan-hero {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-cards);
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: var(--shadow-pop);
  }
  .clan-hero .clan-desc {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .clan-hero .clan-hero__info {
    gap: 3px;
  }
  .clan-hero .clan-hero__crest {
    width: 38px;
    height: 38px;
  }
  .clan-hero .clan-name {
    font-size: calc(var(--text-title) * 0.85);
  }
  /* El Forjador ya sale en el roster: en el hábitat se deja ver más escenario */
  .clan-hero .clan-leader {
    display: none;
  }
  .clan-hero__crest {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: var(--radius-2xl);
    border: 1.5px solid var(--on-color);
    background: var(--theme-social);
    color: var(--on-color);
    box-shadow: 2px 3px 0 var(--on-color);
    rotate: -4deg;
  }
  .clan-hero__info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    flex: 1;
  }
  .clan-hero__title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .clan-name {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: var(--text-title);
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .clan-tag {
    padding: 1px var(--space-2);
    font-size: var(--text-caption);
    background: var(--surface-2);
  }
  .clan-desc {
    margin: 0;
    font-size: var(--text-caption);
    line-height: 1.35;
    color: var(--ink-muted);
  }
  .clan-leader {
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--ink-muted);
  }
  .handle {
    font-weight: 500;
    color: var(--ink-muted);
  }
  .clan-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .clan-stat {
    padding: 2px var(--space-2);
    font-size: var(--text-caption);
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
    gap: var(--space-1);
  }
  .role-chip.role-creator {
    background: color-mix(in srgb, var(--color-sunburst) 55%, var(--surface));
    border-color: var(--line);
  }
  .role-chip.role-admin {
    background: color-mix(in srgb, var(--color-electric-blue) 30%, var(--surface));
    border-color: var(--line);
  }
  .role-chip.role-moderator {
    background: color-mix(in srgb, var(--color-lavender) 40%, var(--surface));
  }
  .role-chip.role-member {
    color: var(--ink-muted);
  }

  .seg-n {
    font-size: var(--text-caption);
    font-weight: 800;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pills);
    background: color-mix(in srgb, var(--theme-social) 40%, var(--surface));
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  /* Miembros */
  .member {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }
  .member.me {
    border-color: color-mix(in srgb, var(--theme-social) 70%, var(--line));
  }
  .member-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .member-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    justify-content: flex-end;
    padding-top: var(--space-2);
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
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--line-soft);
  }
  .danger-zone .ui-card__hint {
    text-align: center;
  }

  /* Objetivos */
  .goal {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
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
    gap: var(--space-2);
  }
  .goal-title {
    font-size: var(--text-label);
    font-weight: 700;
  }
  .goal.done .goal-status {
    background: var(--success);
    color: var(--on-color);
    border-color: var(--on-color);
  }
  .goal-foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .goal-meter {
    flex: 1;
    height: 8px;
  }
  .goal-num {
    font-size: var(--text-caption);
    font-weight: 700;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .ui-inline .goal-target {
    flex: 0 0 72px;
  }

  /* Chat */
  .chat-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .chat {
    min-height: 160px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-cards);
    background: var(--surface-2);
  }
  .chat-empty {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .msg {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
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
    padding: var(--space-2) var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
    background: var(--surface);
    min-width: 0;
  }
  .msg.mine .bubble {
    border-radius: var(--radius-md) var(--radius-md) 4px var(--radius-md);
    background: color-mix(in srgb, var(--theme-social) 28%, var(--surface));
    border-color: color-mix(in srgb, var(--theme-social) 60%, var(--line-soft));
  }
  .bubble-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .sender {
    font-weight: 800;
    color: var(--accent-ink);
  }
  .bubble-body {
    font-size: var(--text-label);
    line-height: 1.35;
    color: var(--ink);
    word-break: break-word;
    user-select: text;
  }
  .msg-del {
    display: inline-grid;
    place-items: center;
    margin-left: auto;
    /* Zona de clic de 24 px aunque el icono sea pequeño; siempre visible (atenuado), no solo al pasar el ratón */
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    opacity: 0.45;
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
    gap: var(--space-2);
  }
  .chat-input .input {
    flex: 1;
    min-width: 0;
  }

  /* Formularios */
  .desc {
    resize: none;
  }
  .ui-inline.end {
    justify-content: flex-end;
  }
  .tag-input {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }
  .ui-inline .tag-input.short {
    flex: 0 0 84px;
  }
  .no-clan {
    border-style: solid;
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--theme-social) 22%, transparent), transparent 70%),
      var(--surface);
  }
</style>
