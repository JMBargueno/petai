<script lang="ts">
  /**
   * La sala del amigo al que estás visitando, con su Pockai y el tuyo. Solo se mira: del anfitrión
   * llegan la sala y el aspecto de su Pockai, nada de su estado ni de sus recuerdos. Las escenas
   * entre los dos son las mismas que ve él (las decide el servidor).
   *
   * La app dice cómo traer la sala (`loadRoom`) y, si quiere, qué sala usar (`roomView`: el
   * escritorio pasa la suya, con su clima y su paisaje; por defecto, la de la biblioteca).
   */
  import { onMount, type ComponentType } from 'svelte';
  import type { VisitRoom } from './social/types';
  import { guestPetState, sceneLabel, stageLabel, visitScene } from './social/visitors';
  import type { ClipCue } from './social/visitDialog';
  import IsoRoomView from './IsoRoomView.svelte';

  /** Amigo al que se visita (su userId) y su nombre, para el pie. */
  export let ownerId: string;
  export let ownerName = '';
  /** Reacción del Pockai del amigo a tu última elección del menú. */
  export let clipCue: ClipCue | null = null;
  /** Trae la sala del amigo (`GET /habitat/visit/:ownerId/room`). */
  export let loadRoom: (ownerId: string) => Promise<VisitRoom>;
  /** Un error, en una frase para el jugador. */
  export let errorText: (e: unknown, fallback: string) => string = (_e, fallback) => fallback;
  /** Sala que se usa para pintarla (por defecto, la de la biblioteca). */
  export let roomView: ComponentType = IsoRoomView;

  let data: VisitRoom | null = null;
  let error = '';
  let loading = true;

  async function load() {
    loading = true;
    error = '';
    try {
      data = await loadRoom(ownerId);
    } catch (e: any) {
      error = errorText(e, 'No se pudo cargar la sala de tu amigo.');
    } finally {
      loading = false;
    }
  }
  onMount(load);

  /** El Pockai del amigo con la forma que espera la sala: solo su aspecto. */
  $: hostPet = data
    ? {
        id: data.host.petId,
        species: { id: data.host.speciesId },
        stage: data.host.stage,
        palette: data.host.look?.palette,
        pattern: data.host.look?.pattern ? { id: data.host.look.pattern } : null,
        visualSeed: data.host.look?.visualSeed,
        shiny: data.host.look?.shiny,
        accessories: data.host.look?.accessories ?? {},
      }
    : null;
  $: myPet = data ? guestPetState({ visitorId: 'me', visitorName: '', pet: data.guest } as any) : null;
  $: room = data ? ({ ...data.room, description: '', unlocked: true, active: true } as any) : null;
  $: furniture = (data?.furniture ?? []) as any[];
  // Escenas que llegan como visitante de este amigo
  $: scene = $visitScene && $visitScene.role === 'guest' && $visitScene.ownerId === ownerId ? $visitScene : null;
</script>

<section class="friend-room" aria-label="Sala de {ownerName || 'tu amigo'}">
  {#if loading}
    <div class="ui-skel friend-room__skel"></div>
  {:else if data && room && hostPet}
    <svelte:component
      this={roomView}
      readonly
      pet={hostPet}
      {room}
      {furniture}
      activity="idle"
      guestPet={myPet}
      sceneCue={scene ? { n: scene.n, type: scene.type } : null}
      {clipCue}
      height={220}
      label="Sala de {ownerName || 'tu amigo'}, con {data.host.nickname} y {data.guest.nickname}"
    />
    <p class="friend-room__caption" aria-live="polite">
      <strong>{data.guest.nickname}</strong> está en casa de <strong>{data.host.nickname}</strong>{#if scene && sceneLabel(scene.type)}: {sceneLabel(scene.type)}{/if}.
      {#if scene && stageLabel(scene.stage)}<span class="friend-room__stage">{stageLabel(scene.stage)}.</span>{/if}
    </p>
  {:else if error}
    <p class="friend-room__error" role="alert">{error} <button class="btn btn--ghost btn--sm" on:click={load}>Reintentar</button></p>
  {/if}
</section>

<style>
  .friend-room {
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    overflow: hidden;
  }
  .friend-room__skel {
    height: 220px;
  }
  .friend-room__caption,
  .friend-room__error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-caption);
    color: var(--ink-soft, var(--ink));
    text-align: center;
    text-wrap: pretty;
  }
  .friend-room__stage {
    opacity: 0.75;
  }
  .friend-room__error {
    color: var(--color-danger, #c0392b);
  }
</style>
