<script lang="ts">
  /**
   * Modo hábitat (lib/habitatMode): solo la sala del Pockai, grande, flotando en el escritorio.
   * Lleva la clase `panel-card` para que el click-through la trate como zona interactiva y para que
   * soltar al Pockai encima lo meta en casa (y sacarlo fuera lo saque al escritorio), igual que el
   * panel. Una barra pequeña aparece al pasar el ratón: mover, cambiar de sala, paisaje y volver
   * al panel. La esquina inferior derecha la redimensiona.
   */
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { ChevronLeft, ChevronRight, GripHorizontal, Minimize2, Mountain } from 'lucide-svelte';
  import { backdropUrl } from '@pockai/scene';
  import IsoRoomView from './IsoRoomView.svelte';
  import { Button } from './ui';
  import { api, type HabitatCatalog, type HabitatState } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';
  import { habitatBackdrop } from '../lib/habitatBackdrop';
  import { HABITAT_MIN, habitatMode, placeBox, type Box } from '../lib/habitatMode';
  import { startHabitatExitDrag, type RoomPetDrag } from '../lib/habitatExitDrag';

  export let pet: any = null;

  const dispatch = createEventDispatcher<{ exit: void; petUpdated: any }>();

  let catalog: HabitatCatalog | null = null;
  let state: HabitatState | null = null;
  let error = '';
  let busy = false;

  async function load() {
    error = '';
    try {
      [catalog, state] = await Promise.all([api.getHabitatCatalog(), api.getHabitat()]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el hábitat.');
    }
  }

  let loadedFor = '';
  $: if (pet?.id && pet.id !== loadedFor) {
    loadedFor = pet.id;
    void load();
  }

  $: rooms = state?.rooms.filter((r) => r.unlocked) ?? [];
  $: room = rooms.find((r) => r.id === $habitatMode.roomId) ?? rooms.find((r) => r.active) ?? rooms[0] ?? null;
  $: roomIdx = room ? rooms.indexOf(room) : -1;
  $: isInHabitat = !!pet?.inHabitat;
  $: isSleeping = !!pet?.sleeping;
  $: activity = !isInHabitat ? 'away' : isSleeping ? 'sleep' : 'idle';
  $: petName = pet?.nickname || pet?.species?.name || 'Tu Pockai';

  function stepRoom(d: number) {
    if (rooms.length < 2) return;
    const next = rooms[(roomIdx + d + rooms.length) % rooms.length];
    habitatMode.setRoom(next.id);
  }

  async function bringHome() {
    if (busy || !pet?.id) return;
    busy = true;
    try {
      dispatch('petUpdated', await api.setPetInHabitat(pet.id, true));
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo llevar a casa.');
    } finally {
      busy = false;
    }
  }

  function onPetPress(e: CustomEvent<{ event: MouseEvent; ghost: HTMLElement; room: RoomPetDrag }>) {
    if (busy) return;
    startHabitatExitDrag(e.detail.event, e.detail.ghost, e.detail.room);
  }

  // ---------- Mover y redimensionar (como el panel: captura todo el viewport mientras dura) ----------
  const screen = () => ({ w: window.innerWidth, h: window.innerHeight });
  let box: Box = placeBox($habitatMode.box, screen());
  let gesture: { kind: 'move' | 'resize'; sx: number; sy: number; start: Box } | null = null;

  function startGesture(kind: 'move' | 'resize', e: MouseEvent) {
    if (e.button !== 0) return;
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    gesture = { kind, sx: e.clientX, sy: e.clientY, start: { ...box } };
    document.body.dataset.dragging = '1';
    window.addEventListener('mousemove', onGesture);
    window.addEventListener('mouseup', endGesture);
  }

  function onGesture(e: MouseEvent) {
    if (!gesture) return;
    if (e.buttons === 0) return endGesture();
    const dx = e.clientX - gesture.sx;
    const dy = e.clientY - gesture.sy;
    const s = gesture.start;
    if (gesture.kind === 'move') {
      box = {
        ...s,
        x: Math.min(Math.max(0, s.x + dx), window.innerWidth - s.w),
        y: Math.min(Math.max(0, s.y + dy), window.innerHeight - s.h),
      };
    } else {
      box = {
        ...s,
        w: Math.min(Math.max(HABITAT_MIN.w, s.w + dx), window.innerWidth - s.x),
        h: Math.min(Math.max(HABITAT_MIN.h, s.h + dy), window.innerHeight - s.y),
      };
    }
  }

  function endGesture() {
    gesture = null;
    delete document.body.dataset.dragging;
    window.removeEventListener('mousemove', onGesture);
    window.removeEventListener('mouseup', endGesture);
    box = placeBox(box, screen());
    habitatMode.setBox(box);
  }

  /** Al cambiar la pantalla se vuelve a encajar, sin olvidar dónde la dejó el jugador. */
  function onWindowResize() {
    if (!gesture) box = placeBox($habitatMode.box, screen());
  }

  onDestroy(() => {
    if (gesture) endGesture();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('exit');
  }
</script>

<svelte:window on:resize={onWindowResize} />

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="panel-card habitat-widget"
  class:busy={!!gesture}
  role="region"
  aria-label="Hábitat de {petName}"
  style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px;"
  on:keydown={onKey}
>
  {#if room && catalog}
    {#key room.id}
      <IsoRoomView
        fill
        {pet}
        {room}
        furniture={catalog.furniture}
        {activity}
        night={isInHabitat && isSleeping}
        showVisitors={isInHabitat}
        label="Sala {room.name}"
        on:petPress={onPetPress}
      />
    {/key}
  {:else}
    <div class="widget-msg">{error || 'Cargando el hábitat…'}</div>
  {/if}

  {#if !isInHabitat && room}
    <div class="absent">
      <span class="absent-text">{petName} está fuera, explorando tu pantalla</span>
      <Button variant="primary" size="sm" icon="home" loading={busy} on:click={bringHome}>Llevar a casa</Button>
      <small class="absent-hint">o arrástralo hasta aquí</small>
    </div>
  {/if}

  <!-- Barra: solo al pasar el ratón (o con el foco dentro) -->
  <div class="widget-bar" on:mousedown={(e) => startGesture('move', e)} role="presentation" title="Arrastra para mover">
    <GripHorizontal size={16} aria-hidden="true" />
    {#if rooms.length > 1}
      <button class="bar-btn" aria-label="Sala anterior" title="Sala anterior" on:click={() => stepRoom(-1)}><ChevronLeft size={16} /></button>
    {/if}
    <span class="bar-room">{room?.name ?? 'Hábitat'}</span>
    {#if rooms.length > 1}
      <button class="bar-btn" aria-label="Sala siguiente" title="Sala siguiente" on:click={() => stepRoom(1)}><ChevronRight size={16} /></button>
    {/if}
    <span class="bar-gap"></span>
    {#if room && backdropUrl(room.id)}
      <button
        class="bar-btn"
        aria-pressed={$habitatBackdrop === 'painted'}
        aria-label={$habitatBackdrop === 'painted' ? 'Ver solo el cielo' : 'Ver el paisaje pintado'}
        title={$habitatBackdrop === 'painted' ? 'Ver solo el cielo' : 'Ver el paisaje pintado'}
        on:click={() => habitatBackdrop.update((m) => (m === 'painted' ? 'plain' : 'painted'))}
      ><Mountain size={16} /></button>
    {/if}
    <button class="bar-btn bar-exit" title="Volver al panel" on:click={() => dispatch('exit')}>
      <Minimize2 size={16} /> Panel
    </button>
  </div>

  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="resize-grip" title="Arrastra para cambiar el tamaño" on:mousedown={(e) => startGesture('resize', e)}></div>
</div>

<style>
  .habitat-widget {
    color-scheme: light;
    position: fixed;
    z-index: var(--z-panel);
    pointer-events: auto;
    border-radius: var(--radius-3xl);
    overflow: hidden;
    border: 1.5px solid var(--line);
    box-shadow: var(--shadow-4);
    background:
      radial-gradient(80% 70% at 50% 35%, rgb(255 255 255 / 0.65), transparent 75%),
      var(--band-sky, #dceeff);
    outline: 3px solid transparent;
    outline-offset: -3px;
    transition: outline-color var(--dur-1) ease, box-shadow var(--dur-1) ease;
  }
  /* El Pockai del escritorio se arrastra encima: su casa se marca como destino */
  :global(body[data-pet-over-panel]) .habitat-widget {
    outline-color: color-mix(in srgb, var(--success) 85%, transparent);
    box-shadow: var(--shadow-4), 0 0 28px color-mix(in srgb, var(--success) 45%, transparent);
  }

  .widget-msg {
    display: grid;
    place-items: center;
    height: 100%;
    padding: var(--space-3);
    text-align: center;
    font-weight: 700;
    color: var(--on-color);
  }

  .widget-bar {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translate(-50%, -6px);
    z-index: calc(var(--z-sticky) + 2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    max-width: calc(100% - 16px);
    padding: 4px var(--space-2);
    border-radius: var(--radius-pills);
    background: rgb(255 255 255 / 0.92);
    border: 1px solid var(--on-color);
    color: var(--on-color);
    box-shadow: var(--shadow-1);
    cursor: grab;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-1) ease, transform var(--dur-1) ease;
  }
  .habitat-widget:hover .widget-bar,
  .habitat-widget:focus-within .widget-bar,
  .habitat-widget.busy .widget-bar {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, 0);
  }
  .habitat-widget.busy .widget-bar {
    cursor: grabbing;
  }
  .bar-room {
    font-size: var(--text-caption);
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .bar-gap {
    flex: 1;
    min-width: var(--space-2);
  }
  .bar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    min-width: 28px;
    height: 28px;
    justify-content: center;
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-pills);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
  }
  .bar-btn:hover {
    background: rgb(0 0 0 / 0.08);
  }
  .bar-btn:focus-visible {
    outline: var(--focus-ring);
  }
  .bar-btn[aria-pressed='true'] {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .resize-grip {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 22px;
    height: 22px;
    z-index: calc(var(--z-sticky) + 2);
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, rgb(0 0 0 / 0.28) 50% 58%, transparent 58% 70%, rgb(0 0 0 / 0.28) 70% 78%, transparent 78%);
    opacity: 0;
    transition: opacity var(--dur-1) ease;
  }
  .habitat-widget:hover .resize-grip,
  .habitat-widget.busy .resize-grip {
    opacity: 1;
  }

  .absent {
    position: absolute;
    inset: 0;
    z-index: var(--z-sticky);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    text-align: center;
    background: rgb(11 10 20 / 0.38);
    backdrop-filter: blur(2px);
  }
  .absent-text {
    font-size: var(--text-caption);
    font-weight: 700;
    color: var(--on-color);
    background: rgb(255 255 255 / 0.9);
    border: 1px solid var(--on-color);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pills);
  }
  .absent-hint {
    font-size: var(--text-caption);
    color: rgb(255 255 255 / 0.85);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .widget-bar,
    .resize-grip {
      transition: none;
    }
  }
</style>
