<script lang="ts">
  import Ico from './Ico.svelte';
  import { onDestroy, createEventDispatcher } from 'svelte';
  import {
    api,
    ANY_ROOM,
    type HabitatCatalog,
    type HabitatState,
    type HabitatBuffs,
    type HabitatFurniture,
    type HabitatRoom,
  } from '../lib/api';
  import { backdropUrl, furnitureUrl } from '@pockai/scene';
  import IsoRoomView from './IsoRoomView.svelte';
  import { AsyncState, Badge, Button, ConfirmDialog, EmptyState, Notice, SectionHeader, Segmented } from './ui';
  import { friendlyError } from '../lib/ui/errors';
  import { startHabitatExitDrag, type RoomPetDrag } from '../lib/habitatExitDrag';
  import { habitatMode } from '../lib/habitatMode';
  import { Home, Pencil, Check, RotateCw, Trash2, Mountain, Maximize2 } from 'lucide-svelte';
  import { habitatBackdrop } from '../lib/habitatBackdrop';
  import { roomGuestOf, sceneLabel, stageLabel, visitScene, visitorsStore } from '../lib/visitors';
  import { visitorTalk } from '../lib/visitDialog';
  import { ownedFurniture } from '../lib/stores/desktopSkillsStore';

  const dispatch = createEventDispatcher();

  export let pet: any = null;
  export let user: any = null;

  let catalog: HabitatCatalog | null = null;
  let state: HabitatState | null = null;
  let buffs: HabitatBuffs | null = null;
  let error = '';
  let loading = true;
  let busy = ''; // furnitureId / itemId en acción (colocar/quitar)
  let habitatBusy = false;
  /** Mueble pendiente de confirmar su compra / objeto colocado pendiente de confirmar que se quita. */
  let buying: HabitatFurniture | null = null;
  let removing: { id: string; name: string } | null = null;
  let activeRoomId = '';

  // Modo edición de la sala: seleccionar, arrastrar y girar muebles
  let editing = false;
  let selectedId: string | null = null;
  let roomView: IsoRoomView;

  // Resaltado de la sala cuando se arrastra algo encima
  let dragDepth = 0;
  $: isDropTarget = dragDepth > 0 && !isInHabitat;

  const BUFF_LABEL: Record<string, string> = {
    hygiene_decay_reduction: 'Higiene decae menos',
    happiness_decay_reduction: 'Felicidad decae menos',
    energy_recovery_boost: 'Recupera energía',
    combat_mood_bonus: 'Bonus de ánimo en combate',
  };

  function furnName(id: string): string {
    return catalog?.furniture.find((f) => f.id === id)?.name ?? id;
  }

  async function load() {
    if (!pet?.id) return;
    loading = !catalog || !state;
    error = '';
    try {
      [catalog, state, buffs] = await Promise.all([
        api.getHabitatCatalog(),
        api.getHabitat(),
        api.getHabitatBuffs(),
      ]);
      const rooms = state.rooms;
      // Muebles que tiene (desbloquean habilidades como Música ambiente, spec 42)
      ownedFurniture.set([...new Set(rooms.flatMap((r) => r.items.map((i) => i.furnitureId)))]);
      if (!rooms.some((r) => r.id === activeRoomId)) {
        activeRoomId = rooms.find((r) => r.unlocked)?.id ?? rooms[0]?.id ?? '';
      }
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el hábitat.');
    } finally {
      loading = false;
    }
  }

  $: petId = pet?.id;
  $: isInHabitat = !!pet?.inHabitat;
  $: isSleeping = !!pet?.sleeping;
  $: petName = pet?.nickname || pet?.species?.name || 'Tu Pockai';
  // Carga al montar y al cambiar de mascota (no en cada actualización de `pet` ni de `loading`).
  let loadedFor = '';
  $: if (petId && petId !== loadedFor) {
    loadedFor = petId;
    load();
  }

  // Visita en curso: el Pockai del amigo que cabe en la sala y lo último que han hecho juntos
  $: roomGuest = roomGuestOf($visitorsStore);
  $: guestScene = roomGuest && $visitScene?.visitorId === roomGuest.visitorId ? $visitScene : null;
  /** Lo último que el entrenador visitante ha hecho con tu Pockai. */
  $: guestTalk = roomGuest && $visitorTalk?.visitorId === roomGuest.visitorId ? $visitorTalk : null;

  let activeRoom: HabitatRoom | null = null;
  let furnitureByRoom: HabitatFurniture[] = [];
  $: activeRoom = state?.rooms.find((r) => r.id === activeRoomId) ?? null;
  $: furnitureByRoom = catalog ? catalog.furniture.filter((f) => f.room === activeRoomId || f.room === ANY_ROOM) : [];
  /** Dónde está ya colocado un mueble único (spec 42), o null. */
  const ownedUnique = (f: HabitatFurniture, st: HabitatState | null): { roomId: string; itemId: string } | null => {
    if (!f.unique || !st) return null;
    for (const r of st.rooms) {
      const it = r.items.find((i) => i.furnitureId === f.id);
      if (it) return { roomId: r.id, itemId: it.id };
    }
    return null;
  };
  /** Trae aquí un mueble único que ya está en otra sala (sin cobro). */
  async function bringHere(f: HabitatFurniture) {
    const at = ownedUnique(f, state);
    if (!at || busy) return;
    busy = f.id;
    error = '';
    try {
      const res = await api.moveHabitatItem(at.itemId, { roomId: activeRoomId });
      await load();
      editing = true;
      selectedId = res.itemId ?? null;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo traer el mueble a esta sala.');
    } finally {
      busy = '';
    }
  }
  $: canEdit = !!activeRoom?.unlocked && !!activeRoom?.active && activeRoom.items.length > 0;
  $: if (!canEdit && editing) editing = false;
  $: activity = !isInHabitat ? 'away' : isSleeping ? 'sleep' : 'idle';
  $: selectedItem = activeRoom?.items.find((i) => i.id === selectedId) ?? null;
  const canAfford = (f: HabitatFurniture): boolean =>
    (f.currency === 'coins' ? user?.coins ?? 0 : user?.gems ?? 0) >= f.price;
  const canPlace = (f: HabitatFurniture): boolean =>
    !!activeRoom?.unlocked && activeRoom.active && canAfford(f) && !busy;
  /** Por qué no se puede comprar un mueble (vacío si se puede). */
  const blockedReason = (f: HabitatFurniture, room: HabitatRoom | null, _user: any): string => {
    if (!room?.unlocked) return 'Sala bloqueada';
    if (!room.active) return 'Activa esta sala para amueblarla';
    if (!canAfford(f)) return f.currency === 'coins' ? 'No te alcanzan las monedas' : 'No te alcanzan las gemas';
    return '';
  };
  const STAGE_LABEL: Record<string, string> = { baby: 'bebé', juvenile: 'joven', adult: 'adulto', final: 'forma final' };
  $: roomUnlock = catalog?.rooms.find((r) => r.id === activeRoomId)?.unlockStage;
  const askRemove = (id: string, furnitureId: string) => (removing = { id, name: furnName(furnitureId) });

  function changeRoom(id: string) {
    activeRoomId = id;
    selectedId = null;
  }

  async function toggleHabitat(inHabitat: boolean) {
    if (habitatBusy || !pet?.id) return;
    habitatBusy = true;
    error = '';
    try {
      const updated = await api.setPetInHabitat(pet.id, inHabitat);
      dispatch('petUpdated', updated);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cambiar dónde está tu Pockai.');
    } finally {
      habitatBusy = false;
    }
  }

  /** Compra: el servidor lo pone en el primer hueco y se abre la edición para colocarlo a gusto. */
  async function place(f: HabitatFurniture) {
    if (!canPlace(f)) return;
    busy = f.id;
    error = '';
    try {
      const res = await api.placeHabitatFurniture(f.id, f.room === ANY_ROOM ? { roomId: activeRoomId } : undefined);
      await load();
      dispatch('refreshUser');
      editing = true;
      selectedId = res.itemId ?? null;
      buying = null;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo comprar el mueble.');
      buying = null;
    } finally {
      busy = '';
    }
  }

  async function remove(itemId: string) {
    if (busy) return;
    busy = itemId;
    try {
      await api.removeHabitatItem(itemId);
      if (selectedId === itemId) selectedId = null;
      await load();
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo quitar el mueble.');
    } finally {
      removing = null;
      busy = '';
    }
  }

  // Movimientos desde la sala: la escena ya los muestra; se guardan con un pequeño retardo para no
  // lanzar una petición por cada flecha pulsada. Si el servidor lo rechaza, se recarga la sala.
  const pendingMoves = new Map<string, { x: number; y: number; rotation: number }>();
  let moveTimer: ReturnType<typeof setTimeout> | null = null;

  function onMove(e: CustomEvent<{ itemId: string; x: number; y: number; rotation: number }>) {
    const { itemId, ...to } = e.detail;
    pendingMoves.set(itemId, to);
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(flushMoves, 350);
  }

  async function flushMoves() {
    moveTimer = null;
    const moves = [...pendingMoves];
    pendingMoves.clear();
    try {
      for (const [itemId, to] of moves) await api.moveHabitatItem(itemId, to);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo mover el mueble.');
      await load();
    }
  }

  onDestroy(() => {
    if (moveTimer) {
      clearTimeout(moveTimer);
      void flushMoves();
    }
  });

  function onPetPress(e: CustomEvent<{ event: MouseEvent; ghost: HTMLElement; room: RoomPetDrag }>) {
    if (habitatBusy) return;
    startHabitatExitDrag(e.detail.event, e.detail.ghost, e.detail.room);
  }

  function handleStageDrop() {
    dragDepth = 0;
    if (!isInHabitat) toggleHabitat(true);
  }
</script>

<div class="ui-stack">
{#if !pet?.id}
  <EmptyState icon="home" title="Sin mascota" text="Necesitas una mascota para ver su hábitat." />
{:else if (loading && !state) || (error && !state)}
  <AsyncState loading={loading && !state} error={state ? '' : error} onRetry={load} rows={3} height={64} />
{:else if state && catalog}
  {#if error}
    <Notice tone="error" dismissible on:dismiss={() => (error = '')}>{error}</Notice>
  {/if}

  <!-- Cabecera de estado: En casa vs En escritorio -->
  <div class="habitat-status-card" class:in-house={isInHabitat}>
    <div class="status-left">
      <div class="status-icon-circle"><Home size={18} /></div>
      <div class="status-text">
        <span class="status-badge">{isInHabitat ? (isSleeping ? 'Durmiendo en casa' : 'En casa') : 'En el escritorio'}</span>
        <p class="status-subtitle">
          {#if isInHabitat}
            {petName} vive dentro del panel. No saldrá hasta que lo saques.
          {:else}
            {petName} pasea libre por tu pantalla.
          {/if}
        </p>
      </div>
    </div>

    {#if isInHabitat}
      <Button size="sm" icon="external" loading={habitatBusy} on:click={() => toggleHabitat(false)}>Sacar al escritorio</Button>
    {:else}
      <Button size="sm" icon="home" loading={habitatBusy} on:click={() => toggleHabitat(true)}>Llevar a casa</Button>
    {/if}
  </div>

  <!-- Selector de salas -->
  <Segmented
    variant="pills"
    label="Salas"
    value={activeRoomId ?? ''}
    options={state.rooms.map((r) => ({ value: r.id, label: r.name, icon: r.unlocked ? 'home' : 'lock' }))}
    on:change={(e) => changeRoom(e.detail)}
  />

  <!-- SALA ISOMÉTRICA -->
  {#if activeRoom}
    <div
      class="room-stage"
      class:drop-target={isDropTarget}
      class:editing
      role="region"
      aria-label="Sala {activeRoom.name}"
      on:dragenter={() => dragDepth++}
      on:dragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
      on:dragover|preventDefault
      on:drop|preventDefault={handleStageDrop}
    >
      <IsoRoomView
        bind:this={roomView}
        bind:selectedId
        {pet}
        room={activeRoom}
        furniture={catalog.furniture}
        {activity}
        night={isInHabitat && isSleeping}
        edit={editing}
        showVisitors={isInHabitat && !editing}
        label="Sala {activeRoom.name}{editing ? ': modo edición. Flechas para mover, R para girar, Escape para soltar' : ''}"
        height={340}
        on:move={onMove}
        on:petPress={onPetPress}
      />

      {#if roomGuest && isInHabitat && !editing}
        <!-- Quién está de visita y qué hacen: el dibujo solo no dice de quién es el otro Pockai -->
        <p class="visit-caption" aria-live="polite">
          <strong>{roomGuest.pet.nickname}</strong>, de {roomGuest.visitorName}, está de visita{#if guestScene}: {sceneLabel(guestScene.type)}{/if}.
          {#if guestScene && stageLabel(guestScene.stage)}<span class="visit-caption__stage">{stageLabel(guestScene.stage)}.</span>{/if}
          {#if guestTalk}<span class="visit-caption__talk">{roomGuest.visitorName}: {guestTalk.line}</span>{/if}
        </p>
      {/if}

      {#if !editing && backdropUrl(activeRoom.id)}
        <button
          class="btn btn--sm backdrop-toggle"
          aria-pressed={$habitatBackdrop === 'painted'}
          title={$habitatBackdrop === 'painted' ? 'Ver solo el cielo' : 'Ver el paisaje pintado alrededor de la sala'}
          on:click={() => habitatBackdrop.update((m) => (m === 'painted' ? 'plain' : 'painted'))}
        >
          <Mountain size={14} /> {$habitatBackdrop === 'painted' ? 'Paisaje' : 'Solo cielo'}
        </button>
      {/if}

      {#if !editing && activeRoom.unlocked}
        <button
          class="btn btn--sm habitat-mode-btn"
          title="Ocultar la interfaz y dejar solo la sala, grande, en el escritorio"
          on:click={() => habitatMode.enter(activeRoom?.id)}
        >
          <Maximize2 size={14} /> Modo hábitat
        </button>
      {/if}

      {#if canEdit}
        <div class="room-tools">
          {#if editing && selectedItem}
            <span class="sel-name">{furnName(selectedItem.furnitureId)}</span>
            <Button size="sm" title="Girar (R)" on:click={() => roomView?.rotate()}>
              <RotateCw size={14} /> Girar
            </Button>
            <button class="btn btn--sm btn--ghost remove-btn" disabled={!!busy} on:click={() => askRemove(selectedItem.id, selectedItem.furnitureId)}>
              <Trash2 size={14} /> Quitar
            </button>
          {:else if editing}
            <span class="sel-hint">Pulsa un mueble para moverlo</span>
          {/if}
          <button class="btn btn--sm" class:btn--primary={editing} on:click={() => (editing = !editing)}>
            {#if editing}<Check size={14} /> Listo{:else}<Pencil size={14} /> Editar{/if}
          </button>
        </div>
      {/if}

      {#if !isInHabitat && !editing}
        <div class="pet-absent-overlay">
          <span class="absent-text">{petName} está fuera, explorando tu pantalla</span>
          <Button variant="primary" size="sm" icon="home" loading={habitatBusy} on:click={() => toggleHabitat(true)}>Llevar a casa</Button>
          <small class="absent-hint">o arrástralo hasta aquí</small>
        </div>
      {/if}

      {#if !activeRoom.unlocked}
        <div class="room-locked-badge"><Ico n="lock" /> Sala bloqueada{#if roomUnlock} · se abre cuando {petName} sea {STAGE_LABEL[roomUnlock] ?? roomUnlock}{/if}</div>
      {/if}
    </div>
  {/if}

  <!-- Buffs activos -->
  <SectionHeader title="Bonificaciones activas" icon="energy" count={buffs ? `${buffs.itemCount} muebles` : null} />
  <div class="buffs">
    {#if buffs && Object.keys(buffs.activeBuffs).length > 0}
      {#each Object.entries(buffs.activeBuffs) as [k, v] (k)}
        <div class="buff">
          <small>{BUFF_LABEL[k] ?? k}</small>
          <span>+{Math.round(v * 100)}%</span>
        </div>
      {/each}
    {:else}
      <EmptyState compact icon="energy" text="Coloca muebles en tu casa para activar bonificaciones pasivas." />
    {/if}
  </div>

  <!-- Catálogo de muebles -->
  <SectionHeader title="Muebles de {activeRoom?.name ?? ''}" icon="shop" />
  <div class="shop">
    {#each furnitureByRoom as f (f.id)}
      {@const why = blockedReason(f, activeRoom, user)}
      {@const owned = ownedUnique(f, state)}
      <div class="shop-row">
        <span class="f-icon">
          {#if furnitureUrl(f.id)}<img src={furnitureUrl(f.id)} alt="" />{:else}<Ico n="home" />{/if}
        </span>
        <div class="f-info">
          <span class="f-name">{f.name}</span>
          <small>{f.description}</small>
        </div>
        <span class="f-price" class:short={!canAfford(f)} aria-label="{f.price} {f.currency === 'coins' ? 'monedas' : 'gemas'}">{f.price} <Ico n={f.currency === 'coins' ? 'coin' : 'gem'} /></span>
        {#if owned && owned.roomId === activeRoomId}
          <Badge size="sm" tone="success" icon="check">Aquí</Badge>
        {:else if owned}
          <Button size="sm" loading={busy === f.id} disabled={!activeRoom?.unlocked || !activeRoom?.active || !!busy} label="Traer {f.name} a esta sala" on:click={() => bringHere(f)}>
            Traer aquí
          </Button>
        {:else}
          <Button size="sm" loading={busy === f.id} disabled={!canPlace(f)} title={why || undefined} label="Comprar {f.name}" on:click={() => (buying = f)}>
            {why === 'No te alcanzan las monedas' || why === 'No te alcanzan las gemas' ? 'No alcanza' : 'Comprar'}
          </Button>
        {/if}
      </div>
    {:else}
      <EmptyState compact icon="shop" text="Esta sala no tiene muebles en el catálogo." />
    {/each}
  </div>

  <!-- Muebles colocados -->
  {#if activeRoom && activeRoom.items.length > 0}
    <SectionHeader title="Muebles colocados aquí" icon="home" count={activeRoom.items.length} />
    <div class="placed">
      {#each activeRoom.items as it (it.id)}
        <div class="placed-row" class:selected={it.id === selectedId}>
          <button
            class="placed-name"
            title="Seleccionar en la sala"
            on:click={() => {
              editing = true;
              selectedId = it.id;
            }}
          >
            {#if furnitureUrl(it.furnitureId)}<img src={furnitureUrl(it.furnitureId)} alt="" />{/if}
            {furnName(it.furnitureId)}
          </button>
          <Button variant="ghost" size="sm" class="remove-btn" loading={busy === it.id} disabled={!!busy} label="Quitar {furnName(it.furnitureId)}" on:click={() => askRemove(it.id, it.furnitureId)}>Quitar</Button>
        </div>
      {/each}
    </div>
  {/if}
{/if}
</div>

{#if buying}
  <ConfirmDialog
    title="Comprar {buying.name}"
    icon="shop"
    confirmLabel="Comprar"
    cost={buying.price}
    currency={buying.currency}
    balance={buying.currency === 'coins' ? (user?.coins ?? 0) : (user?.gems ?? 0)}
    loading={busy === buying.id}
    on:confirm={() => buying && place(buying)}
    on:cancel={() => (buying = null)}
  >
    <p>{buying.description}</p>
    <p>Se coloca en la sala y se abre la edición para que lo pongas donde quieras.</p>
  </ConfirmDialog>
{/if}

{#if removing}
  <ConfirmDialog
    title="Quitar {removing.name}"
    icon="trash"
    danger
    confirmLabel="Quitar"
    loading={busy === removing.id}
    on:confirm={() => removing && remove(removing.id)}
    on:cancel={() => (removing = null)}
  >
    <p>El mueble desaparece de la sala y <strong>no se devuelve lo que costó</strong>. Si lo quieres otra vez, tendrás que comprarlo de nuevo.</p>
  </ConfirmDialog>
{/if}

<style>

  /* Tarjeta de estado */
  .habitat-status-card :global(.btn) {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .habitat-status-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    background: var(--surface);
    color: var(--ink);
    border: var(--outline);
    border-radius: var(--radius-cards);
    padding: var(--space-2) var(--space-3);
    box-shadow: var(--shadow-1);
    transition: background var(--dur-2) var(--ease-out);
  }
  .habitat-status-card.in-house {
    background: color-mix(in srgb, var(--success) 14%, var(--surface));
    box-shadow: var(--shadow-pop);
  }
  .status-left { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  .status-icon-circle {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: var(--outline);
    background: var(--surface-2);
    color: var(--ink-muted);
  }
  .in-house .status-icon-circle {
    background: var(--color-mint-pop);
    color: var(--on-color);
  }
  .status-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .status-badge {
    align-self: flex-start;
    font-size: var(--text-caption);
    font-weight: 800;
    padding: 1px var(--space-2);
    border-radius: var(--radius-pills);
    border: 1px solid var(--on-color);
    background: var(--color-sunburst);
    color: var(--on-color);
  }
  .in-house .status-badge { background: var(--color-mint-pop); }
  .status-subtitle { font-size: var(--text-caption); color: var(--ink-muted); margin: 0; line-height: 1.3; }

  /* --- SALA ISOMÉTRICA ---
     Isla de tono: los colores de la sala vienen de habitats.json (theme), iguales en claro y oscuro. */
  .room-stage {
    color-scheme: light;
    position: relative;
    width: 100%;
    border-radius: var(--radius-cards);
    overflow: hidden;
    border: 1.5px solid var(--line);
    box-shadow: var(--shadow-pop);
    background:
      radial-gradient(80% 70% at 50% 35%, rgb(255 255 255 / 0.65), transparent 75%),
      var(--band-sky, #dceeff);
    transition: outline-color var(--dur-1), box-shadow var(--dur-1);
    outline: 3px solid transparent;
    outline-offset: 2px;
  }
  .room-stage.drop-target {
    outline-color: var(--color-mint-pop);
    box-shadow: var(--shadow-pop), 0 0 24px rgb(85 219 156 / 0.55);
  }
  .room-stage.editing {
    outline-color: var(--accent);
  }

  .backdrop-toggle {
    position: absolute;
    left: 8px;
    bottom: 8px;
    z-index: calc(var(--z-sticky) + 2);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgb(255 255 255 / 0.9);
    color: var(--on-color);
  }
  .habitat-mode-btn {
    position: absolute;
    right: 8px;
    top: 8px;
    z-index: calc(var(--z-sticky) + 2);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgb(255 255 255 / 0.9);
    color: var(--on-color);
  }
  .room-tools {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: calc(var(--z-sticky) + 2);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border-radius: var(--radius-pills);
    background: rgb(255 255 255 / 0.9);
    border: 1px solid var(--on-color);
    color: var(--on-color);
  }
  .sel-name,
  .sel-hint {
    padding: 0 var(--space-2);
    font-size: var(--text-caption);
    font-weight: 700;
    white-space: nowrap;
  }
  .sel-hint {
    font-weight: 600;
    color: var(--ink-muted);
  }

  .pet-absent-overlay {
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
  .absent-hint { font-size: var(--text-caption); color: rgb(255 255 255 / 0.85); font-weight: 600; }
  .drop-target .pet-absent-overlay { background: rgb(85 219 156 / 0.35); }

  .room-locked-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: calc(var(--z-sticky) + 1);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-caption);
    font-weight: 700;
    color: var(--on-color);
    background: var(--color-soft-mist);
    border: 1px solid var(--on-color);
    border-radius: var(--radius-pills);
    padding: 2px var(--space-2);
  }

  /* Buffs y compras */
  .buffs { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
  .buffs :global(.ui-empty) { grid-column: 1 / -1; }
  .buff {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
  }
  .buff small { font-size: var(--text-caption); color: var(--ink-muted); }
  .buff span { font-size: var(--text-label); font-weight: 800; color: var(--success-ink); }

  .shop, .placed { display: flex; flex-direction: column; gap: var(--space-2); }
  .shop-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
  }
  .f-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    overflow: hidden;
  }
  .f-icon img {
    max-width: 36px;
    max-height: 36px;
  }
  .f-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .f-name { font-size: var(--text-label); font-weight: 700; color: var(--ink); }
  .f-info small { font-size: var(--text-caption); color: var(--ink-muted); }
  .f-price { font-size: var(--text-caption); font-weight: 800; white-space: nowrap; color: var(--ink); }
  .f-price.short { color: var(--danger-ink); }
  .placed-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-2);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    font-size: var(--text-caption);
    color: var(--ink);
    border: 1px solid transparent;
  }
  .placed-row.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  }
  .placed-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .placed-name img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .remove-btn { color: var(--danger-ink); }
  .visit-caption {
    margin: var(--space-2, 8px) 0 0;
    font-size: var(--text-sm, 13px);
    color: var(--text-secondary, inherit);
    text-align: center;
  }
  .visit-caption__stage {
    opacity: 0.75;
  }
  .visit-caption__talk {
    display: block;
    margin-top: var(--space-1, 4px);
    color: var(--ink, inherit);
    text-wrap: pretty;
  }
</style>
