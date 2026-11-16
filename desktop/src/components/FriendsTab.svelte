<script lang="ts">
  /** Amigos (feature 021): lista con presencia, pendientes a aceptar/rechazar y petición por email. */
  import { onMount } from 'svelte';
  import { api, type CoopFriend, type PresenceInfo } from '../lib/api';
  import { pendingFriends, presenceState, friendPetLabel, type PresenceState } from '../lib/visitors';

  let friends: CoopFriend[] = [];
  /** Presencia por userId ('unknown' = no se pudo cargar: punto gris). */
  let presence: Record<string, PresenceState> = {};
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  let requestEmail = '';

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
      ok = `Ahora sois amigos con ${f.otherDisplayName} 🤝`;
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

{#if loading && !friends.length}
  <div class="empty-msg">Cargando amigos…</div>
{:else}
  {#if error}<div class="error-msg">{error}</div>{/if}
  {#if ok}<div class="ok-msg">{ok}</div>{/if}

  {#each pendingFriends(friends) as f (f.id)}
    <div class="friend-card pending">
      <div class="friend-main">
        <span class="p-dot {presence[f.otherUserId] ?? 'unknown'}" title="Presencia"></span>
        <div class="friend-body">
          <span class="friend-name">{f.otherDisplayName}</span>
          <small>{friendPetLabel(f)} · {f.direction === 'incoming' ? 'quiere ser tu amigo' : 'esperando respuesta'}</small>
        </div>
      </div>
      <div class="friend-actions">
        <button class="btn-sm ok" disabled={!!busy} on:click={() => accept(f)}>
          {busy === `accept-${f.id}` ? '…' : 'Aceptar'}
        </button>
        <button class="btn-sm no" disabled={!!busy} on:click={() => decline(f)}>
          {busy === `decline-${f.id}` ? '…' : 'Rechazar'}
        </button>
      </div>
    </div>
  {/each}

  <div class="sec-title">Amigos ({friends.filter((f) => f.status === 'accepted').length})</div>
  <div class="list">
    {#each friends.filter((f) => f.status === 'accepted') as f (f.id)}
      <div class="friend-card">
        <div class="friend-main">
          <span class="p-dot {presence[f.otherUserId] ?? 'unknown'}" title="Presencia"></span>
          <div class="friend-body">
            <span class="friend-name">{f.otherDisplayName}</span>
            <small>{friendPetLabel(f)}</small>
          </div>
        </div>
        <span class="p-state">{presence[f.otherUserId] === 'online' ? 'En línea' : presence[f.otherUserId] === 'offline' ? 'Ausente' : ''}</span>
      </div>
    {:else}
      <div class="empty-msg">Aún no tienes amigos. Pide una amistad abajo 👇</div>
    {/each}
  </div>

  <div class="sec-title">Pedir amistad</div>
  <div class="form-row">
    <input
      class="input"
      type="email"
      placeholder="Email de tu amigo"
      bind:value={requestEmail}
      disabled={busy === 'request'}
    />
    <button class="btn-sm primary" disabled={busy === 'request' || !requestEmail.trim()} on:click={requestFriend}>
      {busy === 'request' ? '…' : 'Pedir'}
    </button>
  </div>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}

<style>
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 12px 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .friend-card { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .friend-card.pending { border-color: color-mix(in srgb, var(--color-sunburst) 60%, transparent); }
  .friend-main { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .friend-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .friend-name { font-size: 13px; font-weight: 600; }
  .friend-body small { font-size: 11px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .p-state { font-size: 10px; color: var(--ink-muted); white-space: nowrap; }
  .p-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: var(--ink-muted); opacity: 0.5; }
  .p-dot.online { background: var(--success); opacity: 1; }
  .p-dot.offline { background: var(--ink-muted); opacity: 0.7; }
  .p-dot.unknown { opacity: 0.4; }
  .friend-actions { display: flex; gap: 4px; }
  .btn-sm { padding: 5px 9px; border: none; border-radius: var(--radius-2xl); font-size: 12px; font-weight: 700; cursor: pointer; }
  .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm.ok { background: var(--success); color: var(--success-ink); }
  .btn-sm.no { background: color-mix(in srgb, var(--danger) 18%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); }
  .btn-sm.primary { background: var(--accent); color: var(--on-color); white-space: nowrap; }
  .form-row { display: flex; gap: 6px; }
  .input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); font-size: 13px; color: var(--ink); }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
</style>
