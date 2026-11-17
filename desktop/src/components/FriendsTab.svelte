<script lang="ts">
  /** Amigos (feature 021): lista con presencia, pendientes a aceptar/rechazar y petición por @nickname. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type CoopFriend, type PresenceInfo } from '../lib/api';
  import { pendingFriends, acceptedFriends, presenceState, friendPetLabel, type PresenceState } from '../lib/visitors';
  import { handleFormatError, normalizeHandle } from '../lib/handle';
  import SocialAvatar from './SocialAvatar.svelte';
  import UserProfileModal from '../features/profile/UserProfileModal.svelte';
  import { UserPlus, Check, X, Home, RefreshCw, Users, AlertCircle, CircleCheck, Send, IdCard } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{ visit: string }>();

  let friends: CoopFriend[] = [];
  /** Presencia por userId ('unknown' = no se pudo cargar: punto gris). */
  let presence: Record<string, PresenceState> = {};
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  let requestHandle = '';
  /** Jugador cuyo perfil está abierto (userId). */
  let profileOf = '';

  $: pending = pendingFriends(friends);
  $: incoming = pending.filter((f) => f.direction === 'incoming');
  $: outgoing = pending.filter((f) => f.direction !== 'incoming');
  /** Amigos en línea primero; luego por nombre. */
  $: accepted = [...acceptedFriends(friends)].sort(
    (a, b) =>
      Number(presence[b.otherUserId] === 'online') - Number(presence[a.otherUserId] === 'online') ||
      a.otherDisplayName.localeCompare(b.otherDisplayName),
  );
  $: onlineCount = accepted.filter((f) => presence[f.otherUserId] === 'online').length;

  async function load() {
    loading = true;
    error = '';
    try {
      friends = await api.getCoopFriends();
      await loadPresence();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function loadPresence() {
    const list = [...new Set(friends.map((f) => f.otherUserId))];
    const results = await Promise.all(
      list.map(async (uid) => {
        try {
          const p: PresenceInfo = await api.getPresence(uid);
          return [uid, presenceState(p)] as const;
        } catch {
          return [uid, 'unknown' as const] as const;
        }
      }),
    );
    presence = Object.fromEntries(results);
  }

  async function accept(f: CoopFriend) {
    busy = `accept-${f.id}`;
    error = '';
    ok = '';
    try {
      await api.acceptCoopFriend(f.id);
      ok = `Ahora sois amigos con ${f.otherDisplayName}.`;
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function decline(f: CoopFriend) {
    busy = `decline-${f.id}`;
    error = '';
    ok = '';
    try {
      await api.declineCoopFriend(f.id);
      ok = `Petición de ${f.otherDisplayName} rechazada.`;
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function requestFriend() {
    // Se pide amistad por @nickname (con o sin la @); el email ya no identifica a nadie.
    const handle = normalizeHandle(requestHandle);
    if (!handle) return;
    const formatError = handleFormatError(handle);
    if (formatError) {
      error = `Ese no es un nickname válido: ${formatError.toLowerCase()}`;
      ok = '';
      return;
    }
    busy = 'request';
    error = '';
    ok = '';
    try {
      await api.requestCoopFriend({ handle });
      ok = `Petición de amistad enviada a @${handle}.`;
      requestHandle = '';
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<div class="ui-stack">
  <!-- Añadir amigo -->
  <form class="ui-card" on:submit|preventDefault={requestFriend}>
    <span class="ui-card__title"><UserPlus size={15} /> Añadir amigo</span>
    <div class="ui-inline">
      <input
        class="input"
        type="text"
        autocapitalize="none"
        spellcheck="false"
        placeholder="@nickname de tu amigo"
        aria-label="Nickname de tu amigo"
        bind:value={requestHandle}
        disabled={busy === 'request'}
      />
      <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'request' || !requestHandle.trim()}>
        <Send size={14} /> {busy === 'request' ? 'Enviando…' : 'Pedir'}
      </button>
    </div>
  </form>

  {#if error}<div class="ui-notice ui-notice--error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>{/if}
  {#if ok}<div class="ui-notice ui-notice--ok" role="status"><CircleCheck size={15} /><span>{ok}</span></div>{/if}

  {#if loading && !friends.length}
    <div class="ui-loading" aria-label="Cargando amigos">
      <div class="ui-skel"></div>
      <div class="ui-skel"></div>
      <div class="ui-skel"></div>
    </div>
  {:else}
    <!-- Solicitudes -->
    {#if pending.length}
      <section class="ui-list">
        <div class="ui-head">
          <span class="label-caps">Solicitudes</span>
          <span class="chip ui-count">{pending.length}</span>
        </div>
        {#each incoming as f (f.id)}
          <div class="ui-row request">
            <SocialAvatar name={f.otherDisplayName} presence={presence[f.otherUserId] ?? 'unknown'} />
            <button class="ui-row__body profile-link" title="Ver perfil de {f.otherDisplayName}" on:click={() => (profileOf = f.otherUserId)}>
              <span class="ui-row__title">{f.otherDisplayName}{#if f.otherHandle} <span class="handle">@{f.otherHandle}</span>{/if}</span>
              <span class="ui-row__sub">Quiere ser tu amigo · {friendPetLabel(f)}</span>
            </button>
            <div class="ui-row__actions">
              <button class="btn btn--icon ui-ibtn ui-ibtn--ok" title="Aceptar" aria-label="Aceptar a {f.otherDisplayName}" disabled={!!busy} on:click={() => accept(f)}>
                <Check size={16} />
              </button>
              <button class="btn btn--ghost btn--icon ui-ibtn ui-ibtn--no" title="Rechazar" aria-label="Rechazar a {f.otherDisplayName}" disabled={!!busy} on:click={() => decline(f)}>
                <X size={16} />
              </button>
            </div>
          </div>
        {/each}
        {#each outgoing as f (f.id)}
          <div class="ui-row">
            <SocialAvatar name={f.otherDisplayName} />
            <div class="ui-row__body">
              <span class="ui-row__title">{f.otherDisplayName}{#if f.otherHandle} <span class="handle">@{f.otherHandle}</span>{/if}</span>
              <span class="ui-row__sub">Esperando su respuesta</span>
            </div>
            <span class="chip ui-chip ui-chip--pending">Pendiente</span>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Amigos -->
    <section class="ui-list">
      <div class="ui-head">
        <span class="label-caps">Amigos</span>
        <span class="chip ui-count">{accepted.length}</span>
        {#if onlineCount > 0}<span class="online-sum"><i></i>{onlineCount} en línea</span>{/if}
        <div class="ui-head__end">
          <button class="btn btn--ghost btn--icon ui-ibtn ui-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar amigos" on:click={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {#each accepted as f (f.id)}
        {@const st = presence[f.otherUserId] ?? 'unknown'}
        <div class="ui-row">
          <SocialAvatar name={f.otherDisplayName} presence={st} />
          <button class="ui-row__body profile-link" title="Ver perfil de {f.otherDisplayName}" on:click={() => (profileOf = f.otherUserId)}>
            <span class="ui-row__title">{f.otherDisplayName}{#if f.otherHandle} <span class="handle">@{f.otherHandle}</span>{/if}</span>
            <span class="ui-row__sub">{friendPetLabel(f)}</span>
          </button>
          {#if st === 'online'}<span class="chip ui-chip ui-chip--online">En línea</span>{/if}
          <button
            class="btn btn--ghost btn--icon ui-ibtn"
            title="Perfil de {f.otherDisplayName}"
            aria-label="Ver perfil de {f.otherDisplayName}"
            on:click={() => (profileOf = f.otherUserId)}
          >
            <IdCard size={16} />
          </button>
          <button
            class="btn btn--ghost btn--icon ui-ibtn"
            title="Visitar a {f.otherDisplayName}"
            aria-label="Visitar a {f.otherDisplayName}"
            on:click={() => dispatch('visit', f.otherUserId)}
          >
            <Home size={16} />
          </button>
        </div>
      {:else}
        <div class="ui-empty">
          <span class="ui-empty__icon"><Users size={22} /></span>
          <strong>Aún no tienes amigos</strong>
          <p>Escribe arriba el @nickname de alguien para enviarle una petición.</p>
        </div>
      {/each}
    </section>
  {/if}
</div>

{#if profileOf}
  <UserProfileModal
    userId={profileOf}
    canVisit
    on:close={() => (profileOf = '')}
    on:visit={(e) => { profileOf = ''; dispatch('visit', e.detail); }}
  />
{/if}

<style>
  .handle {
    font-weight: 500;
    color: var(--ink-muted);
  }
  .profile-link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .profile-link:hover .ui-row__title {
    text-decoration: underline;
  }
  .request {
    border-color: color-mix(in srgb, var(--color-sunburst) 70%, var(--line));
    background: color-mix(in srgb, var(--color-sunburst) 10%, var(--surface));
  }
  .online-sum {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .online-sum i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--theme-social);
  }
</style>
