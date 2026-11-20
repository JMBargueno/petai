<script lang="ts">
  /**
   * Amigos (feature 021): lista con presencia, pendientes a aceptar o rechazar y petición por
   * @nickname. Solo pinta: el contenedor de cada app carga amigos y presencia y hace las acciones.
   * Abrir el perfil de alguien (`openProfile`) y visitarle (`visit`) también son suyos.
   */
  import { createEventDispatcher } from 'svelte';
  import { pendingFriends, acceptedFriends, friendPetLabel, type PresenceState } from './social/visitors';
  import type { CoopFriend } from './social/types';
  import { handleFormatError, normalizeHandle } from './handle';
  import SocialAvatar from './SocialAvatar.svelte';
  import Button from './Button.svelte';
  import Notice from './Notice.svelte';
  import { UserPlus, Check, X, Home, RefreshCw, Users, Send } from 'lucide-svelte';

  export let friends: CoopFriend[] = [];
  /** Presencia por userId ('unknown' = no se pudo cargar: punto gris). */
  export let presence: Record<string, PresenceState> = {};
  export let error = '';
  export let ok = '';
  export let loading = false;
  /** Acción en curso: `request`, `accept-<id>` o `decline-<id>`. */
  export let busy = '';
  /** Hay pantalla de visitas en esta app: se enseña «Visitar» en cada amigo. */
  export let canVisit = true;

  const dispatch = createEventDispatcher<{
    visit: string;
    openProfile: string;
    request: string;
    accept: CoopFriend;
    decline: CoopFriend;
    refresh: void;
    dismissError: void;
  }>();

  let requestHandle = '';
  /** Nickname mal escrito: se avisa sin preguntar al servidor. */
  let localError = '';

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

  const load = () => dispatch('refresh');
  const accept = (f: CoopFriend) => dispatch('accept', f);
  const decline = (f: CoopFriend) => dispatch('decline', f);
  const openProfile = (userId: string) => dispatch('openProfile', userId);

  function requestFriend() {
    // Se pide amistad por @nickname (con o sin la @); el email ya no identifica a nadie.
    const handle = normalizeHandle(requestHandle);
    if (!handle) return;
    const formatError = handleFormatError(handle);
    localError = formatError ? `Ese no es un nickname válido: ${formatError.toLowerCase()}` : '';
    if (!formatError) dispatch('request', handle);
  }

  // Petición enviada sin error: se vacía el campo.
  let wasRequesting = false;
  $: {
    if (wasRequesting && busy !== 'request' && !error) requestHandle = '';
    wasRequesting = busy === 'request';
  }

  $: shownError = localError || error;
  function dismiss() {
    localError = '';
    dispatch('dismissError');
  }
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
      <Button variant="primary" size="sm" type="submit" disabled={busy === 'request' || !requestHandle.trim()}>
        <Send size={14} /> {busy === 'request' ? 'Enviando…' : 'Pedir'}
      </Button>
    </div>
  </form>

  {#if shownError}<Notice tone="error" dismissible on:dismiss={dismiss}>{shownError}</Notice>{/if}
  {#if ok}<Notice tone="ok">{ok}</Notice>{/if}

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
            <button class="ui-row__body profile-link" title="Ver perfil de {f.otherDisplayName}" on:click={() => openProfile(f.otherUserId)}>
              <span class="ui-row__title">{f.otherDisplayName}{#if f.otherHandle} <span class="handle">@{f.otherHandle}</span>{/if}</span>
              <span class="ui-row__sub">Quiere ser tu amigo · {friendPetLabel(f)}</span>
            </button>
            <div class="ui-row__actions">
              <Button class="ui-ibtn ui-ibtn--ok" iconOnly label="Aceptar a {f.otherDisplayName}" title="Aceptar" disabled={!!busy} on:click={() => accept(f)}>
                <Check size={16} />
              </Button>
              <Button variant="ghost" class="ui-ibtn ui-ibtn--no" iconOnly label="Rechazar a {f.otherDisplayName}" title="Rechazar" disabled={!!busy} on:click={() => decline(f)}>
                <X size={16} />
              </Button>
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
          <button class="ui-row__body profile-link" title="Ver perfil de {f.otherDisplayName}" on:click={() => openProfile(f.otherUserId)}>
            <span class="ui-row__title">{f.otherDisplayName}{#if f.otherHandle} <span class="handle">@{f.otherHandle}</span>{/if}</span>
            <span class="ui-row__sub">{friendPetLabel(f)}</span>
          </button>
          {#if st === 'online'}<span class="chip ui-chip ui-chip--online">En línea</span>{/if}
          {#if canVisit}
          <Button variant="ghost" class="ui-ibtn" iconOnly label="Visitar a {f.otherDisplayName}" title="Visitar a {f.otherDisplayName}"
           
            on:click={() => dispatch('visit', f.otherUserId)}
          >
            <Home size={16} />
          </Button>
          {/if}
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
    gap: var(--space-1);
    font-size: var(--text-caption);
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
