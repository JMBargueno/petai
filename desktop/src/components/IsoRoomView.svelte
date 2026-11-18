<script lang="ts">
  /**
   * Sala isométrica del Pockai (GUIA_ARTISTICA §7.4), dibujada con el núcleo compartido
   * `@pockai/scene` (el mismo que incrustan Android e iOS). Traduce las props a mensajes del
   * protocolo y reenvía los eventos de la escena.
   *
   * Eventos: `move` (mueble movido o girado a una posición válida), `select` (mueble
   * seleccionado), `petTap` y `petPress` (mousedown sobre el Pockai, para sacarlo de la sala).
   */
  import { onDestroy, onMount, createEventDispatcher } from 'svelte';
  import { PockaiScene, parseClock, type Activity, type HostMessage, type RoomState, type SceneEvent } from '@pockai/scene';
  import type { HabitatFurniture, HabitatRoom } from '../lib/api';
  import { environmentalStatus } from '../lib/environmental';
  import { habitatBackdrop } from '../lib/habitatBackdrop';
  import { resolveBaseState } from '../lib/animation/AnimationController';
  import { hashSeed } from '@pockai/mind';
  import { fallbackDims, loadDims, petDims } from '../lib/brain/personalityStore';
  import { guestPetState, roomGuestOf, visitScene, visitorsStore } from '../lib/visitors';

  export let pet: any = null;
  export let room: HabitatRoom | null = null;
  export let furniture: HabitatFurniture[] = [];
  export let activity: Activity = 'idle';
  export let night = false;
  export let edit = false;
  export let selectedId: string | null = null;
  export let label = 'Sala del Pockai';
  export let height = 360;
  /** Dibuja en la sala al Pockai del amigo que esté de visita (solo si el tuyo está en ella). */
  export let showVisitors = false;

  const dispatch = createEventDispatcher<{
    move: { itemId: string; x: number; y: number; rotation: number };
    select: { itemId: string | null };
    petTap: void;
    petPress: { event: MouseEvent; ghost: HTMLElement };
  }>();

  let host: HTMLDivElement;
  let ghost: HTMLDivElement;
  let scene: PockaiScene | null = null;
  let destroyed = false;

  function onEvent(e: SceneEvent) {
    if (e.type === 'furnitureMoved') dispatch('move', { itemId: e.itemId, x: e.x, y: e.y, rotation: e.rotation });
    else if (e.type === 'itemSelected') {
      selectedId = e.itemId;
      dispatch('select', { itemId: e.itemId });
    } else if (e.type === 'petTapped') dispatch('petTap');
    else if (e.type === 'error') console.warn('[IsoRoomView]', e.message);
  }

  const send = (m: HostMessage) => scene?.receive(m);

  onMount(() => {
    void PockaiScene.create({ host, label, onEvent }).then((s) => {
      if (destroyed) return s.destroy();
      scene = s;
    });
  });
  onDestroy(() => {
    destroyed = true;
    scene?.destroy();
    scene = null;
  });

  /** Gira el mueble seleccionado (botón «Girar» del panel). */
  export function rotate() {
    send({ type: 'rotateSelected' });
  }

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: if (scene && pet)
    send({
      type: 'setPet',
      pet: {
        species: speciesKey,
        stage: pet.stage ?? 'baby',
        palette: {
          primary: pet.palette?.primary ?? '#E25822',
          secondary: pet.palette?.secondary ?? '#F3C544',
        },
        pattern: pet.pattern?.id && pet.pattern.id !== 'plain' ? pet.pattern.id : null,
        visualSeed: pet.visualSeed ?? 1337,
        shiny: !!pet.shiny,
        accessories: pet.accessories ?? {},
      },
    });

  let roomState: RoomState | null = null;
  $: roomState = room
    ? {
        id: room.id,
        gridWidth: room.gridWidth,
        gridHeight: room.gridHeight,
        ...(room.blocked ? { blocked: room.blocked } : {}),
        theme: room.theme ?? null,
        items: room.items.map((i) => ({ id: i.id, furnitureId: i.furnitureId, x: i.x, y: i.y, rotation: i.rotation ?? 0 })),
        furniture: furniture.map((f) => ({
          id: f.id,
          name: f.name,
          footprint: f.footprint,
          mount: f.mount,
          interaction: f.interaction,
        })),
      }
    : null;
  $: if (scene) send({ type: 'setRoom', room: roomState });
  // Clip de reposo según el estado (enfermo, hambriento, cansado, triste…), como PetMiniAvatar.
  $: rest = (() => {
    const s = resolveBaseState(pet);
    return s === 'sleep' ? 'idle' : s;
  })();
  // Personalidad y necesidades, para que en la sala elija qué hacer según cómo es y cómo está
  // (con hambre va al comedero, sucio a la fuente…). La personalidad es la última que dio el
  // servidor para esta mascota; `$petDims` solo se lee para refrescar cuando llega una nueva.
  const roomSeedSalt = Date.now();
  $: roomMind = pet
    ? {
        dims: ($petDims, loadDims(typeof localStorage === 'undefined' ? null : localStorage, pet.id)) ?? fallbackDims(pet),
        needs: {
          hunger: pet.hunger ?? 60,
          energy: pet.energy ?? 60,
          hygiene: pet.hygiene ?? 60,
          happiness: pet.happiness ?? 60,
        },
        seed: hashSeed(`room:${pet.id}:${roomSeedSalt}`),
      }
    : undefined;
  $: if (scene) send({ type: 'setActivity', activity, rest, mind: roomMind });
  $: if (scene) send({ type: 'setNight', night });

  // Visita: el Pockai del amigo entra en la sala y los dos representan lo que decide el servidor.
  // La clave evita volver a hornearlo cada vez que cambia otra cosa de la lista de visitantes.
  $: guest = showVisitors && activity !== 'away' ? roomGuestOf($visitorsStore) : null;
  $: guestKey = guest ? `${guest.visitorId}:${guest.pet.petId}:${guest.pet.stage ?? ''}` : '';
  let sentGuestKey = '';
  $: if (scene && guestKey !== sentGuestKey) {
    sentGuestKey = guestKey;
    send({ type: 'setGuest', pet: guest ? guestPetState(guest) : null });
  }
  let playedScene = 0;
  $: if (scene && guest && $visitScene && $visitScene.n !== playedScene && $visitScene.visitorId === guest.visitorId) {
    playedScene = $visitScene.n;
    send({ type: 'playScene', scene: $visitScene.type });
  }
  // Clima y sol reales (la hora la pone el reloj del equipo dentro de la escena). Sin ubicación
  // no hay dato: cielo despejado y horas de sol por defecto.
  $: weather = $environmentalStatus?.weather ?? null;
  $: sunrise = parseClock(weather?.sunrise);
  $: sunset = parseClock(weather?.sunset);
  $: if (scene)
    send({
      type: 'setAmbience',
      weather: weather ? { code: weather.weatherCode ?? null, temperature: weather.temperature ?? null } : null,
      sun: sunrise !== null && sunset !== null ? { sunrise, sunset } : null,
      // Modo híbrido: paisaje pintado detrás de la sala (preferencia del equipo).
      backdrop: $habitatBackdrop,
    });
  $: if (scene) send({ type: 'setEditMode', edit });
  $: if (scene) send({ type: 'selectItem', itemId: selectedId });

  function onMouseDown(e: MouseEvent) {
    if (edit || !scene || e.button !== 0 || !scene.isPetAt(e.clientX, e.clientY)) return;
    const rect = scene.petClientRect();
    const snap = scene.petSnapshot();
    if (!rect || !snap) return;
    // Fuente del «fantasma»: el Pockai tal como se ve, en su sitio (invisible hasta que se clona).
    Object.assign(ghost.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    snap.style.width = '100%';
    snap.style.height = '100%';
    ghost.replaceChildren(snap);
    dispatch('petPress', { event: e, ghost });
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="iso-room" style="--room-h: {height}px" bind:this={host} on:mousedown={onMouseDown}></div>
<div class="pet-ghost-src" bind:this={ghost} aria-hidden="true"></div>

<style>
  .iso-room {
    position: relative;
    width: 100%;
    height: var(--room-h);
  }
  .iso-room :global(canvas:focus-visible) {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-cards);
  }
  .pet-ghost-src {
    position: fixed;
    opacity: 0;
    pointer-events: none;
  }
</style>
