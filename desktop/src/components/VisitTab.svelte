<script lang="ts">
  /**
   * Social › Visitas en el escritorio: carga, cuida, empieza y termina; la pantalla es `VisitsView`,
   * de `@pockai/ui`. Lo propio del escritorio va aquí: la visita en curso (store), el viaje por el
   * portal, las escenas (casa del amigo, su sala y el diálogo de la visita) y la ventana de perfil.
   */
  import { onMount, createEventDispatcher } from 'svelte';
  import { VisitDialog, VisitsView } from '@pockai/ui';
  import { acceptedFriends } from '@pockai/ui/social';
  import { api, type CoopFriend, type CoopVisitLog, type CoopVisitResult } from '../lib/api';
  import { activeVisit } from '../lib/activeVisit';
  import { endTravel, restoreFromHistory, startTravel } from '../lib/visitTravel';
  import { friendlyError } from '../lib/ui/errors';
  import UserProfileModal from '../features/profile/UserProfileModal.svelte';
  import HomeScene from './HomeScene.svelte';
  import FriendRoomView from './FriendRoomView.svelte';
  import { clipCueOf, type ClipCue } from '../lib/visitDialog';
  import { PawPrint } from 'lucide-svelte';

  /** Amigo a preseleccionar (otherUserId), p. ej. al pulsar «Visitar» en Amigos. */
  export let initialFriend = '';

  const dispatch = createEventDispatcher();

  let friends: CoopFriend[] = [];
  let history: CoopVisitLog[] = [];
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  let selected: string = initialFriend;
  /** Reacción del Pockai del amigo a tu última elección del menú, para animarla en su sala. */
  let friendClip: ClipCue | null = null;
  let profileOf = '';

  async function load() {
    loading = true;
    error = '';
    try {
      const [fr, hist] = await Promise.all([api.getCoopFriends(), api.getCoopHistory()]);
      friends = fr;
      history = hist?.visits ?? [];
      // Si la app se reinició con una visita abierta, se recupera del historial.
      restoreFromHistory(history);
      const acc = acceptedFriends(friends);
      if ($activeVisit && acc.some((f) => f.otherUserId === $activeVisit) && !initialFriend) selected = $activeVisit;
      if (acc.length && !acc.some((f) => f.otherUserId === selected)) selected = acc[0].otherUserId;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron cargar las visitas.');
    } finally {
      loading = false;
    }
  }

  async function care(f: CoopFriend, action: 'feed' | 'play' | 'clean') {
    if (!f.otherPet?.petId) return;
    busy = action;
    error = '';
    ok = '';
    try {
      const res: CoopVisitResult = await api.coopVisit({ ownerId: f.otherUserId, petId: f.otherPet.petId, action });
      ok = `${res.message} +${res.xpGained} XP`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo hacer el cuidado.');
    } finally {
      busy = '';
    }
  }

  async function startVisit(f: CoopFriend, message: string) {
    busy = 'start';
    error = '';
    ok = '';
    try {
      await api.startHabitatVisit(f.otherUserId, message);
      activeVisit.set(f.otherUserId);
      // Se va por un portal de hebras del Nexo (lib/visitTravel + PetView)
      startTravel(f.otherDisplayName);
      ok = `¡Tu Pockai está de visita en el hábitat de ${f.otherDisplayName}!`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo iniciar la visita.');
    } finally {
      busy = '';
    }
  }

  async function endVisit() {
    busy = 'end';
    error = '';
    ok = '';
    try {
      await api.endHabitatVisit();
      activeVisit.set('');
      endTravel();
      ok = 'Visita terminada. ¡Hasta la próxima!';
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo terminar la visita.');
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<VisitsView
  {friends}
  {history}
  {error}
  {ok}
  {loading}
  {busy}
  visiting={$activeVisit}
  bind:selected
  on:refresh={load}
  on:care={(e) => care(e.detail.friend, e.detail.action)}
  on:start={(e) => startVisit(e.detail.friend, e.detail.message)}
  on:end={endVisit}
  on:openProfile={(e) => (profileOf = e.detail)}
  on:goFriends={() => dispatch('goFriends')}
  on:dismissError={() => (error = '')}
>
  <svelte:fragment slot="scene" let:friend let:live>
    <HomeScene class="visit-scene" label="Casa de {friend.otherDisplayName}" mood={live ? 'live' : 'day'} height={110} showRug={false} decor={false}>
      <span class="scene-pet" aria-hidden="true"><PawPrint size={34} /></span>
    </HomeScene>
  </svelte:fragment>
  <svelte:fragment slot="room" let:friend>
    {#key friend.otherUserId}
      <FriendRoomView ownerId={friend.otherUserId} ownerName={friend.otherDisplayName} clipCue={friendClip} />
      <VisitDialog ownerId={friend.otherUserId} interact={(id, choice, turn) => api.visitInteract(id, choice, turn)} errorText={friendlyError} on:reply={(e) => (friendClip = clipCueOf(e.detail.behavior))} />
    {/key}
  </svelte:fragment>
</VisitsView>

{#if profileOf}
  <UserProfileModal userId={profileOf} on:close={() => (profileOf = '')} />
{/if}

<style>
  /* La escena de casa ocupa la cabecera de la tarjeta del amigo, sin bordes propios. */
  :global(.visit-scene) {
    border-width: 0 0 1.5px;
    border-radius: 0;
  }
  .scene-pet {
    position: relative;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1.5px solid var(--on-color);
    background: #fffaf0;
    color: var(--on-color);
    animation: bob 3s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scene-pet {
      animation: none;
    }
  }
</style>
