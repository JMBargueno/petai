<script lang="ts">
  /**
   * Sala isométrica del Pockai (GUIA_ARTISTICA §7.4), dibujada con el núcleo compartido
   * `@pockai/scene` (el mismo que incrustan Android e iOS). Traduce las props a mensajes del
   * protocolo y reenvía los eventos de la escena.
   *
   * Eventos: `move` (mueble movido o girado a una posición válida), `select` (mueble
   * seleccionado), `petTap` y `petPress` (mousedown sobre el Pockai: trae `room`, para llevarlo en la
   * mano dentro de la sala, y el «fantasma» para sacarlo de ella).
   *
   * Lo que sabe solo cada app llega por props: el clima local (`weather`), el fondo (`backdrop`), la
   * personalidad de la mascota (`dims`; sin ella, valores neutros) y cómo avisar al servidor del uso
   * de un mueble (`useItem`; sin él, el uso se queda en la animación). El sonido va por el puerto de
   * sonido de la biblioteca.
   */
  import { onDestroy, onMount, createEventDispatcher } from 'svelte';
  import { PockaiScene, parseClock, type Activity, type HostMessage, type PetState, type RoomState, type SceneEvent } from '@pockai/scene';
  import type { BackdropMode } from '@pockai/scene';
  import type { FurnitureUseResult } from './social/types';
  import { clipCueOf, visitorTalk, type ClipCue } from './social/visitDialog';
  import { resolveBaseState } from '@pockai/scene/sprites';
  import { hashSeed, neutralDims, type Dims } from '@pockai/mind';
  import { guestPetState, roomGuestOf, visitScene, visitorsStore } from './social/visitors';
  import { uiSfxFirst } from './sound';
  import { canvasPalette, resolvedAppearance } from './appearance';
  import { DEFAULT_PET_PALETTE } from './maps';
  import type { RoomPetDrag } from './roomDrag';

  type HabitatFurniture = any;
  type HabitatRoom = { id: string; gridWidth: number; gridHeight: number; blocked?: any; theme?: any; items: any[] } & Record<string, any>;

  export let pet: any = null;
  export let room: HabitatRoom | null = null;
  export let furniture: HabitatFurniture[] = [];
  export let activity: Activity = 'idle';
  export let night = false;
  export let edit = false;
  export let selectedId: string | null = null;
  export let label = 'Sala del Pockai';
  export let height = 360;
  /** Ocupa todo el alto de su contenedor (modo hábitat) en vez de `height`. */
  export let fill = false;
  /** Solo la sala, sin cielo ni paisaje alrededor (modo hábitat). Se lee al montarse. */
  export let bare = false;
  /** Dibuja en la sala al Pockai del amigo que esté de visita (solo si el tuyo está en ella). */
  export let showVisitors = false;
  /**
   * Sala ajena (la del amigo al que visitas): solo se mira. Sin agarrar al Pockai, sin avisar al
   * servidor de los muebles que usa y con el invitado y las escenas dados desde fuera.
   */
  export let readonly = false;
  /** Invitado dado desde fuera (en la sala del amigo, tu propio Pockai). */
  export let guestPet: PetState | null = null;
  /** Escena a representar, dada desde fuera. */
  export let sceneCue: { n: number; type: string } | null = null;
  /** Clip que debe hacer el Pockai de la sala (la reacción a lo que le acaban de hacer). */
  export let clipCue: ClipCue | null = null;
  /** Clima local (`weatherCode`, `temperature`, `sunrise`, `sunset`), o `null`. */
  export let weather: any = null;
  /** Paisaje pintado alrededor de la sala, o solo cielo. */
  export let backdrop: BackdropMode = 'plain';
  /** Personalidad de la mascota (spec 36); sin ella, valores neutros. */
  export let dims: Dims | null = null;
  /** Avisa al servidor de que la mascota ha usado un mueble; sin él, el uso se queda en la animación. */
  export let useItem: ((itemId: string) => Promise<FurnitureUseResult | null>) | null = null;

  const dispatch = createEventDispatcher<{
    move: { itemId: string; x: number; y: number; rotation: number };
    select: { itemId: string | null };
    petTap: void;
    petPress: { event: MouseEvent; ghost: HTMLElement; room: RoomPetDrag };
    furnitureUsed: FurnitureUseResult;
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
    else if (e.type === 'furnitureUsed') void reportUse(e.itemId);
    else if (e.type === 'error') console.warn('[IsoRoomView]', e.message);
  }

  const send = (m: HostMessage) => scene?.receive(m);

  /**
   * El Pockai ha usado un mueble: se avisa al servidor, que decide si tiene efecto (tope diario y
   * enfriamiento). Solo en la sala propia y con la mascota en ella. Un fallo de red no molesta.
   */
  async function reportUse(itemId: string) {
    if (!useItem || readonly || edit || activity === 'away' || !room?.items.some((i: any) => i.id === itemId)) return;
    try {
      const res = await useItem(itemId);
      if (res?.applied) dispatch('furnitureUsed', res);
    } catch {
      /* sin conexión: el uso se queda en la animación */
    }
  }

  onMount(() => {
    void PockaiScene.create({ host, label, onEvent, observeResize: fill, bare, onSound: (ids) => uiSfxFirst(ids) }).then((s) => {
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
          primary: pet.palette?.primary ?? DEFAULT_PET_PALETTE.primary,
          secondary: pet.palette?.secondary ?? DEFAULT_PET_PALETTE.secondary,
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
        items: room.items.map((i: any) => ({ id: i.id, furnitureId: i.furnitureId, x: i.x, y: i.y, rotation: i.rotation ?? 0 })),
        furniture: furniture.map((f: any) => ({
          id: f.id,
          name: f.name,
          footprint: f.footprint,
          mount: f.mount,
          interaction: f.interaction,
        })),
      }
    : null;
  $: if (scene) send({ type: 'setRoom', room: roomState });
  // Apariencia de la app (tema × esquema) con la paleta de canvas del tema, para los efectos.
  $: if (scene)
    send({
      type: 'setTheme',
      mode: $resolvedAppearance.scheme,
      themeId: $resolvedAppearance.theme,
      palette: { ...canvasPalette($resolvedAppearance) },
    });
  // Clip de reposo según el estado (enfermo, hambriento, cansado, triste…), como PetMiniAvatar.
  $: rest = (() => {
    const s = resolveBaseState(pet);
    return s === 'sleep' ? 'idle' : s;
  })();
  // Personalidad y necesidades, para que en la sala elija qué hacer según cómo es y cómo está
  // (con hambre va al comedero, sucio a la fuente…). La personalidad la da la app (`dims`).
  const roomSeedSalt = Date.now();
  $: roomMind = pet
    ? {
        dims: dims ?? neutralDims(),
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
  $: guest = !readonly && showVisitors && activity !== 'away' ? roomGuestOf($visitorsStore) : null;
  $: guestState = guestPet ?? (guest ? guestPetState(guest) : null);
  $: guestKey = guestPet ? `given:${guestPet.species}:${guestPet.stage}:${guestPet.visualSeed}` : guest ? `${guest.visitorId}:${guest.pet.petId}:${guest.pet.stage ?? ''}` : '';
  let sentGuestKey = '';
  $: if (scene && guestKey !== sentGuestKey) {
    sentGuestKey = guestKey;
    send({ type: 'setGuest', pet: guestState });
  }
  let playedScene = 0;
  // Solo las escenas de tu sala: las que llegan como visitante (`role: 'guest'`) son de otra
  $: if (scene && guest && $visitScene && $visitScene.role !== 'guest' && $visitScene.n !== playedScene && $visitScene.visitorId === guest.visitorId) {
    playedScene = $visitScene.n;
    send({ type: 'playScene', scene: $visitScene.type });
  }
  let playedCue = 0;
  $: if (scene && guestState && sceneCue && sceneCue.n !== playedCue) {
    playedCue = sceneCue.n;
    send({ type: 'playScene', scene: sceneCue.type });
  }
  // La reacción de tu Pockai a lo que le hace quien le visita (saludarle, traerle un premio…)
  let playedTalk = 0;
  $: if (scene && guest && $visitorTalk && $visitorTalk.n !== playedTalk && $visitorTalk.visitorId === guest.visitorId) {
    playedTalk = $visitorTalk.n;
    const cue = clipCueOf($visitorTalk.behavior);
    if (cue) send({ type: 'playClip', clip: cue.clip, once: true });
  }
  let playedClip = 0;
  $: if (scene && clipCue && clipCue.n !== playedClip) {
    playedClip = clipCue.n;
    send({ type: 'playClip', clip: clipCue.clip, once: true });
  }
  // Clima y sol reales (la hora la pone el reloj del equipo dentro de la escena). Sin ubicación
  // no hay dato: cielo despejado y horas de sol por defecto.
  $: sunrise = parseClock(weather?.sunrise);
  $: sunset = parseClock(weather?.sunset);
  $: if (scene)
    send({
      type: 'setAmbience',
      weather: weather ? { code: weather.weatherCode ?? null, temperature: weather.temperature ?? null } : null,
      sun: sunrise !== null && sunset !== null ? { sunrise, sunset } : null,
      // Modo híbrido: paisaje pintado detrás de la sala (preferencia del equipo).
      backdrop,
    });
  $: if (scene) send({ type: 'setEditMode', edit });
  $: if (scene) send({ type: 'selectItem', itemId: selectedId });

  function onMouseDown(e: MouseEvent) {
    if (readonly || edit || !scene || e.button !== 0 || !scene.isPetAt(e.clientX, e.clientY)) return;
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
    dispatch('petPress', { event: e, ghost, room: petDrag });
  }

  /** Llevar al Pockai en la mano dentro de esta sala (habitatExitDrag). */
  const petDrag: RoomPetDrag = {
    contains: (x, y) => !!scene?.containsClientPoint(x, y) && isTopmost(x, y),
    grab: (x, y) => !!scene?.grabPet(x, y),
    move: (x, y) => scene?.dragPetTo(x, y),
    release: (x, y) => scene?.releasePet(x, y),
    cancel: () => scene?.cancelPetDrag(),
    setHidden: (h) => scene?.setPetHidden(h),
  };

  /** Que lo que hay bajo el cursor sea esta sala (no un diálogo u otra cosa por encima). */
  function isTopmost(x: number, y: number): boolean {
    const top = document.elementFromPoint?.(x, y);
    return !top || !host || host.contains(top);
  }

  // Mano abierta al pasar sobre el Pockai (se puede agarrar)
  let overPet = false;
  function onHover(e: MouseEvent) {
    const over = !readonly && !edit && !!scene?.isPetAt(e.clientX, e.clientY);
    if (over !== overPet) overPet = over;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="iso-room"
  class:fill
  class:over-pet={overPet}
  style="--room-h: {height}px"
  bind:this={host}
  on:mousedown={onMouseDown}
  on:mousemove={onHover}
  on:mouseleave={() => (overPet = false)}
></div>
<div class="pet-ghost-src" bind:this={ghost} aria-hidden="true"></div>

<style>
  .iso-room {
    position: relative;
    width: 100%;
    height: var(--room-h);
  }
  .iso-room.fill {
    height: 100%;
  }
  .iso-room.over-pet :global(canvas) {
    cursor: grab;
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
