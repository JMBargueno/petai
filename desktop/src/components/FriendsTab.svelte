<script lang="ts">
  /** Social › Amigos en el escritorio: carga y acciones; la pantalla es `FriendsView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { FriendsView } from '@pockai/ui';
  import { presenceState, type PresenceState } from '@pockai/ui/social';
  import { api, type CoopFriend, type PresenceInfo } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';
  import UserProfileModal from '../features/profile/UserProfileModal.svelte';

  const dispatch = createEventDispatcher<{ visit: string }>();

  let friends: CoopFriend[] = [];
  let presence: Record<string, PresenceState> = {};
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  /** Jugador cuyo perfil está abierto (userId). */
  let profileOf = '';

  async function load() {
    loading = true;
    error = '';
    try {
      friends = await api.getCoopFriends();
      await loadPresence();
    } catch (e: any) {
      error = friendlyError(e);
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

  /** Una acción sobre la lista: su aviso y recargar. */
  async function run(key: string, fn: () => Promise<unknown>, message: string) {
    busy = key;
    error = '';
    ok = '';
    try {
      await fn();
      ok = message;
      await load();
    } catch (e: any) {
      error = friendlyError(e);
    } finally {
      busy = '';
    }
  }

  const accept = (f: CoopFriend) => run(`accept-${f.id}`, () => api.acceptCoopFriend(f.id), `Ahora sois amigos con ${f.otherDisplayName}.`);
  const decline = (f: CoopFriend) => run(`decline-${f.id}`, () => api.declineCoopFriend(f.id), `Petición de ${f.otherDisplayName} rechazada.`);
  const request = (handle: string) => run('request', () => api.requestCoopFriend({ handle }), `Petición de amistad enviada a @${handle}.`);

  onMount(load);
</script>

<FriendsView
  {friends}
  {presence}
  {error}
  {ok}
  {loading}
  {busy}
  on:refresh={load}
  on:accept={(e) => accept(e.detail)}
  on:decline={(e) => decline(e.detail)}
  on:request={(e) => request(e.detail)}
  on:visit={(e) => dispatch('visit', e.detail)}
  on:openProfile={(e) => (profileOf = e.detail)}
  on:dismissError={() => (error = '')}
/>

{#if profileOf}
  <UserProfileModal
    userId={profileOf}
    canVisit
    on:close={() => (profileOf = '')}
    on:visit={(e) => { profileOf = ''; dispatch('visit', e.detail); }}
  />
{/if}
