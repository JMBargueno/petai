<script lang="ts">
  /** Amigos (feature 021): lista con presencia, pendientes a aceptar/rechazar y petición por email. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type CoopFriend, type PresenceInfo } from '../lib/api';
  import { pendingFriends, acceptedFriends, presenceState, friendPetLabel, type PresenceState } from '../lib/visitors';
  import SocialAvatar from './SocialAvatar.svelte';
  import { UserPlus, Check, X, Home, RefreshCw, Users, AlertCircle, CircleCheck, Send } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{ visit: string }>();

  let friends: CoopFriend[] = [];
  /** Presencia por userId ('unknown' = no se pudo cargar: punto gris). */
  let presence: Record<string, PresenceState> = {};
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  let requestEmail = '';

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
    const email = requestEmail.trim();
    if (!email) return;
    busy = 'request';
    error = '';
    ok = '';
    try {
      await api.requestCoopFriend({ email });
      ok = `Petición de amistad enviada a ${email}.`;
      requestEmail = '';
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<div class="soc">
  <!-- Añadir amigo -->
  <form class="soc-card" on:submit|preventDefault={requestFriend}>
    <span class="soc-card__title"><UserPlus size={15} /> Añadir amigo</span>
    <div class="soc-inline">
      <input
        class="input"
        type="email"
        placeholder="Email de tu amigo"
        aria-label="Email de tu amigo"
        bind:value={requestEmail}
        disabled={busy === 'request'}
      />
      <button type="submit" class="btn btn--sm btn--primary" disabled={busy === 'request' || !requestEmail.trim()}>
        <Send size={14} /> {busy === 'request' ? 'Enviando…' : 'Pedir'}
      </button>
    </div>
  </form>

  {#if error}<div class="soc-notice soc-notice--error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>{/if}
  {#if ok}<div class="soc-notice soc-notice--ok" role="status"><CircleCheck size={15} /><span>{ok}</span></div>{/if}

  {#if loading && !friends.length}
    <div class="soc-loading" aria-label="Cargando amigos">
      <div class="soc-skel"></div>
      <div class="soc-skel"></div>
      <div class="soc-skel"></div>
    </div>
  {:else}
    <!-- Solicitudes -->
    {#if pending.length}
      <section class="soc-list">
        <div class="soc-head">
          <span class="label-caps">Solicitudes</span>
          <span class="chip soc-count">{pending.length}</span>
        </div>
        {#each incoming as f (f.id)}
          <div class="soc-row request">
            <SocialAvatar name={f.otherDisplayName} presence={presence[f.otherUserId] ?? 'unknown'} />
            <div class="soc-row__body">
              <span class="soc-row__title">{f.otherDisplayName}</span>
              <span class="soc-row__sub">Quiere ser tu amigo · {friendPetLabel(f)}</span>
            </div>
            <div class="soc-row__actions">
              <button class="btn btn--icon soc-ibtn soc-ibtn--ok" title="Aceptar" aria-label="Aceptar a {f.otherDisplayName}" disabled={!!busy} on:click={() => accept(f)}>
                <Check size={16} />
              </button>
              <button class="btn btn--ghost btn--icon soc-ibtn soc-ibtn--no" title="Rechazar" aria-label="Rechazar a {f.otherDisplayName}" disabled={!!busy} on:click={() => decline(f)}>
                <X size={16} />
              </button>
            </div>
          </div>
        {/each}
        {#each outgoing as f (f.id)}
          <div class="soc-row">
            <SocialAvatar name={f.otherDisplayName} />
            <div class="soc-row__body">
              <span class="soc-row__title">{f.otherDisplayName}</span>
              <span class="soc-row__sub">Esperando su respuesta</span>
            </div>
            <span class="chip soc-chip soc-chip--pending">Pendiente</span>
          </div>
        {/each}
      </section>
    {/if}

    <!-- Amigos -->
    <section class="soc-list">
      <div class="soc-head">
        <span class="label-caps">Amigos</span>
        <span class="chip soc-count">{accepted.length}</span>
        {#if onlineCount > 0}<span class="online-sum"><i></i>{onlineCount} en línea</span>{/if}
        <div class="soc-head__end">
          <button class="btn btn--ghost btn--icon soc-ibtn soc-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar amigos" on:click={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {#each accepted as f (f.id)}
        {@const st = presence[f.otherUserId] ?? 'unknown'}
        <div class="soc-row">
          <SocialAvatar name={f.otherDisplayName} presence={st} />
          <div class="soc-row__body">
            <span class="soc-row__title">{f.otherDisplayName}</span>
            <span class="soc-row__sub">{friendPetLabel(f)}</span>
          </div>
          {#if st === 'online'}<span class="chip soc-chip soc-chip--online">En línea</span>{/if}
          <button
            class="btn btn--ghost btn--icon soc-ibtn"
            title="Visitar a {f.otherDisplayName}"
            aria-label="Visitar a {f.otherDisplayName}"
            on:click={() => dispatch('visit', f.otherUserId)}
          >
            <Home size={16} />
          </button>
        </div>
      {:else}
        <div class="soc-empty">
          <span class="soc-empty__icon"><Users size={22} /></span>
          <strong>Aún no tienes amigos</strong>
          <p>Escribe arriba el email de alguien para enviarle una petición.</p>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
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
