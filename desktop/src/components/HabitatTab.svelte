<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type HabitatCatalog, type HabitatState, type HabitatBuffs, type HabitatFurniture, type HabitatRoom } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;
  export let user: any = null;

  let catalog: HabitatCatalog | null = null;
  let state: HabitatState | null = null;
  let buffs: HabitatBuffs | null = null;
  let error = '';
  let loading = true;
  let busy = ''; // furnitureId en acción (colocar/quitar)
  let activeRoomId = '';

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
      // Conserva la sala activa si sigue existiendo; si no, la primera desbloqueada.
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
  $: if (petId && !loading) load();
  onMount(load);

  let activeRoom: HabitatRoom | null = null;
  let furnitureByRoom: HabitatFurniture[] = [];
  $: activeRoom = state?.rooms.find((r) => r.id === activeRoomId) ?? null;
  $: furnitureByRoom = catalog ? catalog.furniture.filter((f) => f.room === activeRoomId) : [];
  const canAfford = (f: HabitatFurniture): boolean =>
    (f.currency === 'coins' ? user?.coins ?? 0 : user?.gems ?? 0) >= f.price;
  const canPlace = (f: HabitatFurniture): boolean =>
    !!activeRoom?.unlocked && activeRoom.active && canAfford(f) && !busy;

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

  /** Celda (x, y) → id de mueble que la ocupa en la sala activa. */
  function occupant(x: number, y: number): string | null {
    const it = activeRoom?.items.find((i) => i.x === x && i.y === y);
    return it ? it.furnitureId : null;
  }
</script>

{#if !pet?.id}
  <div class="empty-msg">Necesitas una mascota para ver su hábitat.</div>
{:else if loading && !state}
  <div class="empty-msg">Cargando hábitat…</div>
{:else if error && !state}
  <div class="error-msg">{error}</div>
{:else if state && catalog}
  <div class="balance">
    <span>🪙 {user?.coins ?? 0}</span>
    <span>💎 {user?.gems ?? 0}</span>
    {#if error}<span class="err-inline">{error}</span>{/if}
  </div>

  <div class="sec-title">Buffs activos {buffs ? `(de ${buffs.itemCount} muebles)` : ''}</div>
  <div class="buffs">
    {#if buffs && Object.keys(buffs.activeBuffs).length > 0}
      {#each Object.entries(buffs.activeBuffs) as [k, v] (k)}
        <div class="buff">
          <small>{BUFF_LABEL[k] ?? k}</small>
          <span>+{Math.round(v * 100)}%</span>
        </div>
      {/each}
    {:else}
      <div class="empty-msg small">Aún no hay buffs: coloca muebles para activarlos.</div>
    {/if}
  </div>

  <div class="sec-title">Salas</div>
  <div class="rooms">
    {#each state.rooms as room (room.id)}
      <button class="room-chip" class:active={room.id === activeRoomId} on:click={() => (activeRoomId = room.id)}>
        {room.unlocked ? '🔓' : '🔒'} {room.name}
      </button>
    {/each}
  </div>

  {#if activeRoom}
    <div class="room-desc">{activeRoom.description}</div>

    <div class="grid" style="grid-template-columns: repeat({activeRoom.gridWidth}, 1fr);">
      {#each Array.from({ length: activeRoom.gridWidth * activeRoom.gridHeight }) as _, i (i)}
        {@const x = i % activeRoom.gridWidth}
        {@const y = Math.floor(i / activeRoom.gridWidth)}
        {@const furn = occupant(x, y)}
        <div class="cell" class:filled={!!furn} title={furn ?? 'celda libre'}>
          {#if furn}{icon(furn)}{/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="sec-title">Muebles de {activeRoom?.name ?? ''}</div>
  <div class="shop">
    {#each furnitureByRoom as f (f.id)}
      <div class="shop-row">
        <span class="f-icon">{icon(f.id)}</span>
        <div class="f-info">
          <span class="f-name">{f.name}</span>
          <small>{f.description}</small>
        </div>
        <span class="f-price">{f.price} {f.currency === 'coins' ? '🪙' : '💎'}</span>
        <button class="place-btn" disabled={!canPlace(f)} on:click={() => place(f)}>
          {busy === f.id ? '…' : 'Colocar'}
        </button>
      </div>
    {:else}
      <div class="empty-msg small">Esta sala no tiene muebles en el catálogo.</div>
    {/each}
  </div>

  {#if activeRoom && activeRoom.items.length > 0}
    <div class="sec-title">Colocados aquí</div>
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

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}

<style>
  .empty-msg { font-size: 12px; color: #64748b; text-align: center; padding: 12px 0; }
  .empty-msg.small { font-size: 11px; padding: 6px 0; }
  .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; }
  .balance { display: flex; gap: 12px; font-size: 13px; font-weight: 700; padding: 6px 2px; }
  .err-inline { color: #fca5a5; font-size: 11px; margin-left: auto; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 10px 0 4px; }
  .buffs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .buff { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); }
  .buff small { font-size: 11px; color: #94a3b8; }
  .buff span { font-size: 13px; font-weight: 700; color: #4ade80; }
  .rooms { display: flex; flex-wrap: wrap; gap: 6px; }
  .room-chip { padding: 6px 10px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(15, 23, 42, 0.5); color: #cbd5e1; font-size: 12px; font-weight: 600; cursor: pointer; }
  .room-chip.active { border-color: #38bdf8; color: #38bdf8; background: rgba(56, 189, 248, 0.12); }
  .room-desc { font-size: 11px; color: #94a3b8; margin: 4px 0 6px; }
  .grid { display: grid; gap: 2px; margin-bottom: 4px; }
  .cell { aspect-ratio: 1; border-radius: 4px; background: rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .cell.filled { background: rgba(56, 189, 248, 0.18); }
  .shop { display: flex; flex-direction: column; gap: 6px; }
  .shop-row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 10px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); }
  .f-icon { font-size: 20px; }
  .f-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .f-name { font-size: 13px; font-weight: 600; }
  .f-info small { font-size: 10px; color: #94a3b8; }
  .f-price { font-size: 12px; font-weight: 700; white-space: nowrap; }
  .place-btn, .remove-btn { padding: 6px 10px; border: none; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; background: #38bdf8; color: #0f172a; }
  .place-btn:disabled, .remove-btn:disabled { opacity: 0.4; cursor: default; }
  .remove-btn { background: #f87171; color: #450a0a; }
  .placed { display: flex; flex-direction: column; gap: 4px; }
  .placed-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.4); font-size: 12px; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; background: #38bdf8; color: #0f172a; width: 100%; }
</style>
