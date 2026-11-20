<script lang="ts">
  /**
   * Social › Visitas: carga, cuida, empieza y termina por el núcleo; la pantalla es la de
   * `@pockai/ui`. La visita en curso se deduce del historial (en la fase 5 pasará al núcleo). Durante
   * la visita se ve la sala del amigo (la de la biblioteca) y se habla con su Pockai por menú
   * (`VisitDialog`): su respuesta se ve en la sala. La cabecera de su casa es la sencilla.
   */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { Button, FriendRoomView, Modal, Notice, ProfileView, VisitDialog, VisitsView } from '@pockai/ui';
  import { acceptedFriends, clipCueOf, ongoingVisitFrom, type ClipCue, type VisitInteraction } from '@pockai/ui/social';
  import { act, failureText } from '../core';

  /** Amigo a preseleccionar (otherUserId), p. ej. al pulsar «Visitar» en Amigos. */
  let { initialFriend = '', onGoFriends }: { initialFriend?: string; onGoFriends?: () => void } = $props();

  let friends = $state<any[]>([]);
  let history = $state<any[]>([]);
  let error = $state('');
  let ok = $state('');
  let loading = $state(true);
  let busy = $state('');
  let visiting = $state('');
  let selected = $state(initialFriend);

  /** Lo que hace el Pockai del amigo al contestar, para que la sala lo represente. */
  let friendClip = $state<ClipCue | null>(null);
  const interact = (ownerId: string, choice?: number, turn?: number) =>
    act({ type: 'visitInteract', ownerId, choice: choice ?? null, turn: turn ?? null }) as Promise<VisitInteraction>;

  let profileOf = $state('');
  let profile = $state<any>(null);
  let profileError = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      const [fr, hist] = (await Promise.all([query({ type: 'getCoopFriends' }), query({ type: 'getCoopHistory' })])) as [any[], any];
      friends = fr ?? [];
      history = hist?.visits ?? [];
      visiting = ongoingVisitFrom(history);
      const acc = acceptedFriends(friends);
      if (visiting && acc.some((f) => f.otherUserId === visiting) && !initialFriend) selected = visiting;
      if (acc.length && !acc.some((f) => f.otherUserId === selected)) selected = acc[0].otherUserId;
    } catch (e) {
      error = failureText(e, 'No se pudieron cargar las visitas.');
    } finally {
      loading = false;
    }
  }

  async function run(key: string, action: Parameters<typeof act>[0], message: (res: any) => string, fallback: string) {
    busy = key;
    error = '';
    ok = '';
    try {
      const res = await act(action);
      ok = message(res);
      await load();
    } catch (e) {
      error = failureText(e, fallback);
    } finally {
      busy = '';
    }
  }

  const care = (f: any, action: 'feed' | 'play' | 'clean') =>
    run(action, { type: 'coopVisit', body: { ownerId: f.otherUserId, petId: f.otherPet?.petId, action } }, (res) => `${res?.message ?? 'Hecho.'} +${res?.xpGained ?? 0} XP`, 'No se pudo hacer el cuidado.');
  const start = (f: any, message: string) =>
    run('start', { type: 'startHabitatVisit', ownerId: String(f.otherUserId), message: message.trim() || null }, () => `¡Tu Pockai está de visita en el hábitat de ${f.otherDisplayName}!`, 'No se pudo iniciar la visita.');
  const end = () => run('end', { type: 'endHabitatVisit' }, () => 'Visita terminada. ¡Hasta la próxima!', 'No se pudo terminar la visita.');

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

<VisitsView
  {friends}
  {history}
  {error}
  {ok}
  {loading}
  {busy}
  {visiting}
  bind:selected
  on:refresh={() => load()}
  on:care={(e) => care(e.detail.friend, e.detail.action)}
  on:start={(e) => start(e.detail.friend, e.detail.message)}
  on:end={end}
  on:openProfile={(e) => openProfile(e.detail)}
  on:goFriends={() => onGoFriends?.()}
  on:dismissError={() => (error = '')}
>
  <svelte:fragment slot="room" let:friend>
    {#if friend}
    {#key friend.otherUserId}
      <FriendRoomView
        ownerId={friend.otherUserId}
        ownerName={friend.otherDisplayName}
        loadRoom={(ownerId) => query({ type: 'getVisitRoom', ownerId }) as Promise<any>}
        errorText={(e, fallback) => failureText(e, fallback)}
        clipCue={friendClip}
      />
      <VisitDialog ownerId={friend.otherUserId} {interact} errorText={failureText} on:reply={(e) => (friendClip = clipCueOf(e.detail.behavior))} />
    {/key}
    {/if}
  </svelte:fragment>
</VisitsView>

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
