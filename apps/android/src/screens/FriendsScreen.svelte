<script lang="ts">
  /**
   * Social › Amigos: carga amigos y presencia por el núcleo y hace las acciones; la pantalla es la
   * de `@pockai/ui`. «Visitar» lleva a Visitas con ese amigo elegido (`onVisit`).
   */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { Button, FriendsView, Modal, Notice, ProfileView } from '@pockai/ui';
  import { presenceState, type PresenceState } from '@pockai/ui/social';
  import { act, failureText } from '../core';

  let { onVisit }: { onVisit?: (userId: string) => void } = $props();

  let friends = $state<any[]>([]);
  let presence = $state<Record<string, PresenceState>>({});
  let error = $state('');
  let ok = $state('');
  let loading = $state(true);
  let busy = $state('');

  /** Perfil abierto de otro jugador. */
  let profileOf = $state('');
  let profile = $state<any>(null);
  let profileError = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      friends = ((await query({ type: 'getCoopFriends' })) as any[]) ?? [];
      await loadPresence();
    } catch (e) {
      error = failureText(e, 'No se pudieron cargar tus amigos.');
    } finally {
      loading = false;
    }
  }

  async function loadPresence() {
    const list = [...new Set(friends.map((f) => String(f.otherUserId)))];
    const results = await Promise.all(
      list.map(async (userId) => {
        try {
          return [userId, presenceState((await query({ type: 'getPresence', userId })) as any)] as const;
        } catch {
          return [userId, 'unknown' as const] as const;
        }
      }),
    );
    presence = Object.fromEntries(results);
  }

  async function run(key: string, action: Parameters<typeof act>[0], message: string) {
    busy = key;
    error = '';
    ok = '';
    try {
      await act(action);
      ok = message;
      await load();
    } catch (e) {
      error = failureText(e, 'No se pudo completar.');
    } finally {
      busy = '';
    }
  }

  async function openProfile(userId: string) {
    profileOf = userId;
    profile = null;
    profileError = '';
    try {
      profile = await query({ type: 'getUserProfile', userId });
    } catch (e) {
      profileError = failureText(e, 'No se pudo cargar el perfil.');
    }
  }

  onMount(() => void load());
</script>

<FriendsView
  {friends}
  {presence}
  {error}
  {ok}
  {loading}
  {busy}
  canVisit={!!onVisit}
  on:visit={(e) => onVisit?.(e.detail)}
  on:refresh={() => load()}
  on:accept={(e) => run(`accept-${e.detail.id}`, { type: 'acceptCoopFriend', friendshipId: String(e.detail.id) }, `Ahora sois amigos con ${e.detail.otherDisplayName}.`)}
  on:decline={(e) => run(`decline-${e.detail.id}`, { type: 'declineCoopFriend', friendshipId: String(e.detail.id) }, `Petición de ${e.detail.otherDisplayName} rechazada.`)}
  on:request={(e) => run('request', { type: 'requestCoopFriend', target: { handle: e.detail } }, `Petición de amistad enviada a @${e.detail}.`)}
  on:openProfile={(e) => openProfile(e.detail)}
  on:dismissError={() => (error = '')}
/>

{#if profileOf}
  <Modal title="Perfil" on:close={() => (profileOf = '')}>
    {#if profileError}
      <Notice tone="error">{profileError}</Notice>
    {:else if profile}
      <ProfileView {profile} own={false} />
    {:else}
      <p class="muted">Cargando perfil…</p>
    {/if}
    <Button block on:click={() => (profileOf = '')}>Cerrar</Button>
  </Modal>
{/if}
