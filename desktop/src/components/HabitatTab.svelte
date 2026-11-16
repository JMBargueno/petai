<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    api,
    type HabitatCatalog,
    type HabitatState,
    type HabitatBuffs,
    type HabitatFurniture,
    type HabitatRoom,
  } from '../lib/api';
  import PetMiniAvatar from './PetMiniAvatar.svelte';
  import { Home, ExternalLink, Sparkles, Check, ArrowRight } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  export let pet: any = null;
  export let user: any = null;

  let catalog: HabitatCatalog | null = null;
  let state: HabitatState | null = null;
  let buffs: HabitatBuffs | null = null;
  let error = '';
  let loading = true;
  let busy = ''; // furnitureId en acción (colocar/quitar)
  let habitatBusy = false;
  let activeRoomId = '';

  // Animación del Pockai dentro del diorama
  let petRoomX = 45; // Porcentaje horizontal 15% a 75%
  let petRoomDir = 1;

  const FURN_ICON: Record<string, string> = {
    fountain_water: '⛲', soft_bed: '🛏️', toy_ball: '⚽', wall_shelf: '📚',
    flower_pot: '🌸', garden_bench: '🪑', garden_pond: '🐟', shrine_altar: '⛩️',
    crystal_lamp: '💎', final_throne: '👑', final_garden: '🌳',
  };

  const BUFF_LABEL: Record<string, string> = {
    hygiene_decay_reduction: 'Higiene decae menos',
    happiness_decay_reduction: 'Felicidad decae menos',
    energy_recovery_boost: 'Recupera energía',
    combat_mood_bonus: 'Bonus de ánimo en combate',
  };

  function icon(id: string): string {
    return FURN_ICON[id] ?? '🪑';
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
      if (!rooms.some((r) => r.id === activeRoomId)) {
        activeRoomId = rooms.find((r) => r.unlocked)?.id ?? rooms[0]?.id ?? '';
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: petId = pet?.id;
  $: isInHabitat = !!pet?.inHabitat;
  $: if (petId && !loading) load();
  onMount(() => {
    load();
    const walkTimer = setInterval(() => {
      if (!isInHabitat) return;
      if (Math.random() < 0.4) {
        petRoomX = Math.min(75, Math.max(15, petRoomX + 12 * petRoomDir));
        if (petRoomX >= 75) petRoomDir = -1;
        else if (petRoomX <= 15) petRoomDir = 1;
      }
    }, 2800);
    return () => clearInterval(walkTimer);
  });

  let activeRoom: HabitatRoom | null = null;
  let furnitureByRoom: HabitatFurniture[] = [];
  $: activeRoom = state?.rooms.find((r) => r.id === activeRoomId) ?? null;
  $: furnitureByRoom = catalog ? catalog.furniture.filter((f) => f.room === activeRoomId) : [];
  const canAfford = (f: HabitatFurniture): boolean =>
    (f.currency === 'coins' ? user?.coins ?? 0 : user?.gems ?? 0) >= f.price;
  const canPlace = (f: HabitatFurniture): boolean =>
    !!activeRoom?.unlocked && activeRoom.active && canAfford(f) && !busy;

  async function toggleHabitat(inHabitat: boolean) {
    if (habitatBusy || !pet?.id) return;
    habitatBusy = true;
    error = '';
    try {
      const updated = await api.setPetInHabitat(pet.id, inHabitat);
      dispatch('petUpdated', updated);
    } catch (e: any) {
      error = e.message || 'Error al cambiar estado de hábitat';
    } finally {
      habitatBusy = false;
    }
  }

  async function place(f: HabitatFurniture) {
    if (!canPlace(f)) return;
    busy = f.id;
    try {
      await api.placeHabitatFurniture(f.id);
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function remove(furnitureId: string) {
    if (busy) return;
    busy = furnitureId;
    try {
      await api.removeHabitatFurniture(furnitureId);
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  function handleDragStartFromHabitat(e: DragEvent) {
    if (e.dataTransfer) {
      // Mismo contrato que App.handleViewportDrop y la tarjeta de Inicio
      e.dataTransfer.setData('application/petai-pet', 'exit-habitat');
      e.dataTransfer.effectAllowed = 'move';
    }
  }
</script>

{#if !pet?.id}
  <div class="empty-msg">Necesitas una mascota para ver su hábitat.</div>
{:else if loading && !state}
  <div class="empty-msg">Cargando hábitat…</div>
{:else if error && !state}
  <div class="error-msg">{error}</div>
{:else if state && catalog}
  <!-- Cabecera de estado: En Casa vs En Escritorio -->
  <div class="habitat-status-card" class:in-house={isInHabitat}>
    <div class="status-left">
      <div class="status-icon-circle">
        <Home size={18} />
      </div>
      <div>
        <div class="status-title">
          {#if isInHabitat}
            <span class="badge in-badge">En Casa</span> {pet.nickname || pet.species?.name} está en el hábitat
          {:else}
            <span class="badge out-badge">En Escritorio</span> {pet.nickname || pet.species?.name} está libre
          {/if}
        </div>
        <p class="status-subtitle">
          {#if isInHabitat}
            Vive dentro del panel. No se moverá por el escritorio hasta que lo saques.
          {:else}
            Pasea libremente por tus ventanas y pantalla.
          {/if}
        </p>
      </div>
    </div>

    <div class="status-action">
      {#if isInHabitat}
        <button
          class="btn-portal btn-out"
          disabled={habitatBusy}
          on:click={() => toggleHabitat(false)}
        >
          <ExternalLink size={15} /> Sacar al Escritorio
        </button>
      {:else}
        <button
          class="btn-portal btn-in"
          disabled={habitatBusy}
          on:click={() => toggleHabitat(true)}
        >
          <Home size={15} /> Llevar a Casa
        </button>
      {/if}
    </div>
  </div>

  <!-- Selector de Salas -->
  <div class="rooms-nav">
    {#each state.rooms as room (room.id)}
      <button
        class="room-tab"
        class:active={room.id === activeRoomId}
        on:click={() => (activeRoomId = room.id)}
      >
        <Ico n={room.unlocked ? 'unlock' : 'lock'} /> {room.name}
      </button>
    {/each}
  </div>

  <!-- DIORAMA VISUAL DE LA HABITACIÓN -->
  {#if activeRoom}
    <div
      class="diorama-stage stage--{activeRoom.id}"
      role="region"
      aria-label="Diorama de la habitación"
      on:dragover|preventDefault
      on:drop|preventDefault={() => !isInHabitat && toggleHabitat(true)}
    >
      <!-- Pared y ventana decorativa -->
      <div class="diorama-wall">
        <div class="diorama-window">
          <div class="window-sky"></div>
        </div>
      </div>

      <!-- Muebles colocados en la sala -->
      <div class="diorama-furniture-layer">
        {#each activeRoom.items as it, idx (it.id)}
          <div
            class="furniture-prop"
            style="left: {15 + (idx % 4) * 22}%; bottom: {18 + Math.floor(idx / 4) * 16}px;"
            title={catalog.furniture.find((f) => f.id === it.furnitureId)?.name ?? it.furnitureId}
          >
            <span class="furn-sprite">{icon(it.furnitureId)}</span>
          </div>
        {/each}
      </div>

      <!-- El Pockai dentro de la habitación -->
      {#if isInHabitat}
        <div
          class="pet-in-room"
          style="left: {petRoomX}%; transform: scaleX({petRoomDir});"
          title="Arrastra para sacarlo al escritorio o pulsa el botón"
        >
          <PetMiniAvatar
            {pet}
            size={76}
            anim="walk"
            draggable={true}
            on:dragstart={handleDragStartFromHabitat}
          />
        </div>
      {:else}
        <div class="pet-absent-overlay">
          <span>🐾 {pet.nickname || 'Tu Pockai'} está fuera explorando tu pantalla</span>
          <button class="btn-call-home" on:click={() => toggleHabitat(true)}>
            Llamar a casa
          </button>
        </div>
      {/if}

      <!-- Suelo de la habitación -->
      <div class="diorama-floor"></div>
    </div>
  {/if}

  <!-- Buffs activos -->
  <div class="sec-title">Buffs activos {buffs ? `(${buffs.itemCount} muebles)` : ''}</div>
  <div class="buffs">
    {#if buffs && Object.keys(buffs.activeBuffs).length > 0}
      {#each Object.entries(buffs.activeBuffs) as [k, v] (k)}
        <div class="buff">
          <small>{BUFF_LABEL[k] ?? k}</small>
          <span>+{Math.round(v * 100)}%</span>
        </div>
      {/each}
    {:else}
      <div class="empty-msg small">Coloca muebles en tu casa para activar bonificaciones pasivas.</div>
    {/if}
  </div>

  <!-- Catálogo de Muebles -->
  <div class="sec-title">Muebles de {activeRoom?.name ?? ''}</div>
  <div class="shop">
    {#each furnitureByRoom as f (f.id)}
      <div class="shop-row">
        <span class="f-icon">{icon(f.id)}</span>
        <div class="f-info">
          <span class="f-name">{f.name}</span>
          <small>{f.description}</small>
        </div>
        <span class="f-price">{f.price} <Ico n={f.currency === 'coins' ? 'coin' : 'gem'} /></span>
        <button class="place-btn" disabled={!canPlace(f)} on:click={() => place(f)}>
          {busy === f.id ? '…' : 'Colocar'}
        </button>
      </div>
    {:else}
      <div class="empty-msg small">Esta sala no tiene muebles en el catálogo.</div>
    {/each}
  </div>

  <!-- Muebles colocados -->
  {#if activeRoom && activeRoom.items.length > 0}
    <div class="sec-title">Muebles colocados aquí</div>
    <div class="placed">
      {#each activeRoom.items as it (it.id)}
        <div class="placed-row">
          <span>{icon(it.furnitureId)} {catalog.furniture.find((f) => f.id === it.furnitureId)?.name ?? it.furnitureId}</span>
          <button class="remove-btn" disabled={!!busy} on:click={() => remove(it.furnitureId)}>
            {busy === it.furnitureId ? '…' : 'Quitar'}
          </button>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .empty-msg { font-size: 12px; color: #94a3b8; text-align: center; padding: 12px 0; }
  .empty-msg.small { font-size: 11px; padding: 6px 0; }
  .error-msg { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; margin-bottom: 8px; }

  /* Tarjeta de Estado */
  .habitat-status-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 12px;
    transition: all 0.2s ease;
  }

  .habitat-status-card.in-house {
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }

  .habitat-status-card.in-house .status-icon-circle {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .status-title {
    font-size: 13px;
    font-weight: 600;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-subtitle {
    font-size: 11px;
    color: #94a3b8;
    margin: 2px 0 0;
    line-height: 1.3;
  }

  .badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
  }

  .in-badge {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.4);
  }

  .out-badge {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .btn-portal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-in {
    background: #4f46e5;
    color: #ffffff;
  }

  .btn-in:hover {
    background: #4338ca;
  }

  .btn-out {
    background: #059669;
    color: #ffffff;
  }

  .btn-out:hover {
    background: #047857;
  }

  /* Selector de Salas */
  .rooms-nav {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }

  .room-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(15, 23, 42, 0.6);
    color: #94a3b8;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .room-tab.active {
    background: rgba(99, 102, 241, 0.2);
    border-color: rgba(99, 102, 241, 0.4);
    color: #c7d2fe;
  }

  /* DIORAMA ESCÉNICO */
  .diorama-stage {
    position: relative;
    width: 100%;
    height: 190px;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  /* Temas de Salas */
  .stage--sala {
    background: linear-gradient(180deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%);
  }

  .stage--sala .diorama-floor {
    background: linear-gradient(180deg, #78350f 0%, #451a03 100%);
    border-top: 3px solid #92400e;
  }

  .stage--jardin {
    background: linear-gradient(180deg, #075985 0%, #0284c7 60%, #0369a1 100%);
  }

  .stage--jardin .diorama-floor {
    background: linear-gradient(180deg, #15803d 0%, #166534 100%);
    border-top: 3px solid #22c55e;
  }

  .stage--templo {
    background: linear-gradient(180deg, #3f3f46 0%, #52525b 60%, #27272a 100%);
  }

  .stage--templo .diorama-floor {
    background: linear-gradient(180deg, #a16207 0%, #713f12 100%);
    border-top: 3px solid #ca8a04;
  }

  .stage--cristal {
    background: linear-gradient(180deg, #311042 0%, #581c87 60%, #3b0764 100%);
  }

  .stage--cristal .diorama-floor {
    background: linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%);
    border-top: 3px solid #8b5cf6;
  }

  .diorama-floor {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 52px;
    z-index: 1;
  }

  .diorama-wall {
    position: absolute;
    top: 14px;
    right: 20px;
    z-index: 2;
  }

  .diorama-window {
    width: 44px;
    height: 48px;
    border: 3px solid rgba(255, 255, 255, 0.4);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(2px);
    overflow: hidden;
  }

  .window-sky {
    width: 100%;
    height: 100%;
    background: linear-gradient(180deg, #38bdf8 0%, #818cf8 100%);
    opacity: 0.7;
  }

  .diorama-furniture-layer {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    z-index: 3;
    pointer-events: none;
  }

  .furniture-prop {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.4));
  }

  .furn-sprite {
    font-size: 26px;
  }

  .pet-in-room {
    position: absolute;
    bottom: 18px;
    z-index: 10;
    transition: left 0.8s ease-in-out;
  }

  .pet-absent-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(2px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #e2e8f0;
    font-size: 12px;
    font-weight: 500;
  }

  .btn-call-home {
    background: rgba(99, 102, 241, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-call-home:hover {
    background: #4f46e5;
  }

  /* Buffs y compras */
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 6px; color: #f1f5f9; }
  .buffs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .buff { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 8px; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
  .buff small { font-size: 11px; color: #94a3b8; }
  .buff span { font-size: 13px; font-weight: 700; color: #34d399; }

  .shop { display: flex; flex-direction: column; gap: 6px; }
  .shop-row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255, 255, 255, 0.06); }
  .f-icon { font-size: 20px; }
  .f-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .f-name { font-size: 13px; font-weight: 600; color: #f8fafc; }
  .f-info small { font-size: 10px; color: #94a3b8; }
  .f-price { font-size: 12px; font-weight: 700; white-space: nowrap; color: #e2e8f0; }
  .place-btn, .remove-btn { padding: 6px 10px; border: none; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; background: #6366f1; color: #ffffff; }
  .place-btn:disabled, .remove-btn:disabled { opacity: 0.4; cursor: default; }
  .remove-btn { background: #dc2626; color: #ffffff; }
  .placed { display: flex; flex-direction: column; gap: 4px; }
  .placed-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 8px; background: rgba(30, 41, 59, 0.4); font-size: 12px; color: #cbd5e1; }
</style>
