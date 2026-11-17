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
  import { AsyncState, EmptyState, Notice, SectionHeader, Segmented } from './ui';
  import { startHabitatExitDrag } from '../lib/habitatExitDrag';
  import { Home, ExternalLink } from 'lucide-svelte';

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

  // Paseo del Pockai dentro del diorama: camina (anim walk) y se para (idle) a ratos
  const WALK_MS = 1600;
  let petRoomX = 45; // % horizontal, entre 14% y 80%
  let petRoomDir = 1;
  let petWalking = false;
  let walkStopTimer: ReturnType<typeof setTimeout> | null = null;

  // Resaltado del diorama cuando se arrastra algo encima
  let dragDepth = 0;
  $: isDropTarget = dragDepth > 0 && !isInHabitat;

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

  // Huecos de la sala con profundidad: fila del fondo (más pequeña, detrás del Pockai)
  // y fila delantera (más grande, delante). Se rellenan alternando para que quede equilibrado.
  const SLOTS: { x: number; back: boolean }[] = [
    { x: 14, back: true }, { x: 86, back: true }, { x: 34, back: true }, { x: 66, back: true },
    { x: 11, back: false }, { x: 89, back: false }, { x: 50, back: true }, { x: 24, back: false },
    { x: 76, back: false },
  ];
  function slot(idx: number) {
    const s = SLOTS[idx % SLOTS.length];
    const lap = Math.floor(idx / SLOTS.length);
    return { x: Math.min(94, s.x + lap * 5), back: s.back };
  }

  function icon(id: string): string {
    return FURN_ICON[id] ?? '🪑';
  }

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
  $: isSleeping = !!pet?.sleeping;
  $: petName = pet?.nickname || pet?.species?.name || 'Tu Pockai';
  $: if (petId && !loading) load();
  onMount(() => {
    load();
    const walkTimer = setInterval(() => {
      if (!isInHabitat || isSleeping || petWalking) return;
      if (Math.random() < 0.5) {
        const step = 10 + Math.random() * 16;
        let next = petRoomX + step * petRoomDir;
        if (next > 80 || next < 14) {
          petRoomDir = -petRoomDir;
          next = petRoomX + step * petRoomDir;
        }
        petRoomX = Math.min(80, Math.max(14, next));
        petWalking = true;
        walkStopTimer = setTimeout(() => (petWalking = false), WALK_MS);
      }
    }, 2600);
    return () => {
      clearInterval(walkTimer);
      if (walkStopTimer) clearTimeout(walkStopTimer);
    };
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

  function handleExitDragStart(e: MouseEvent) {
    if (habitatBusy) return;
    const host = e.currentTarget as HTMLElement;
    startHabitatExitDrag(e, host.querySelector<HTMLElement>('.pet-mini-avatar'));
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
  <AsyncState loading={loading && !state} error={state ? '' : error} rows={3} height={64} />
{:else if state && catalog}
  {#if error}
    <Notice tone="error">{error}</Notice>
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
      <button class="btn btn--sm" disabled={habitatBusy} on:click={() => toggleHabitat(false)}>
        <ExternalLink size={14} /> Sacar
      </button>
    {:else}
      <button class="btn btn--sm btn--primary" disabled={habitatBusy} on:click={() => toggleHabitat(true)}>
        <Home size={14} /> Llevar a casa
      </button>
    {/if}
  </div>

  <!-- Selector de salas -->
  <Segmented
    variant="pills"
    label="Salas"
    value={activeRoomId ?? ''}
    options={state.rooms.map((r) => ({ value: r.id, label: r.name, icon: r.unlocked ? 'home' : 'lock' }))}
    on:change={(e) => (activeRoomId = e.detail)}
  />

  <!-- DIORAMA DE LA SALA -->
  {#if activeRoom}
    <div
      class="diorama-stage stage--{activeRoom.id}"
      class:night={isInHabitat && isSleeping}
      class:drop-target={isDropTarget}
      role="region"
      aria-label="Sala {activeRoom.name}"
      on:dragenter={() => dragDepth++}
      on:dragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
      on:dragover|preventDefault
      on:drop|preventDefault={handleStageDrop}
    >
      <!-- Pared: zócalo, ventana y luz -->
      <div class="diorama-light" aria-hidden="true"></div>
      <div class="diorama-window" aria-hidden="true"><div class="window-sky"></div></div>
      <div class="diorama-baseboard" aria-hidden="true"></div>
      <!-- Suelo -->
      <div class="diorama-floor" aria-hidden="true"></div>

      <!-- Muebles colocados (fondo y delante) -->
      {#each activeRoom.items as it, idx (it.id)}
        {@const s = slot(idx)}
        <div
          class="furniture-prop"
          class:back={s.back}
          style="left: {s.x}%;"
          title={furnName(it.furnitureId)}
        >
          <span class="furn-sprite">{icon(it.furnitureId)}</span>
        </div>
      {/each}

      <!-- El Pockai en la sala -->
      {#if isInHabitat}
        <div
          class="pet-in-room"
          style="left: {petRoomX}%; --walk-ms: {WALK_MS}ms;"
          title="Arrastra para sacarlo al escritorio"
          role="button"
          tabindex="-1"
          on:mousedown={handleExitDragStart}
        >
          <span class="pet-shadow" aria-hidden="true"></span>
          <div class="pet-facing" style="transform: scaleX({petRoomDir});">
            <PetMiniAvatar
              {pet}
              size={80}
              anim={petWalking ? 'walk' : 'idle'}
              interactive={false}
            />
          </div>
          {#if isSleeping}<span class="pet-zzz" aria-hidden="true">z</span>{/if}
        </div>
      {:else}
        <div class="pet-absent-overlay">
          <span class="absent-text">🐾 {petName} está fuera explorando tu pantalla</span>
          <button class="btn btn--sm btn--primary" disabled={habitatBusy} on:click={() => toggleHabitat(true)}>
            <Home size={14} /> Llamar a casa
          </button>
          <small class="absent-hint">o arrástralo hasta aquí</small>
        </div>
      {/if}

      {#if !activeRoom.unlocked}
        <div class="room-locked-badge"><Ico n="lock" /> Sala bloqueada</div>
      {/if}
    </div>
  {/if}

  <!-- Buffs activos -->
  <SectionHeader title="Buffs activos" icon="energy" count={buffs ? `${buffs.itemCount} muebles` : null} />
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
      <div class="shop-row">
        <span class="f-icon">{icon(f.id)}</span>
        <div class="f-info">
          <span class="f-name">{f.name}</span>
          <small>{f.description}</small>
        </div>
        <span class="f-price" class:short={!canAfford(f)}>{f.price} <Ico n={f.currency === 'coins' ? 'coin' : 'gem'} /></span>
        <button class="btn btn--sm btn--primary" disabled={!canPlace(f)} on:click={() => place(f)}>
          {busy === f.id ? '…' : 'Colocar'}
        </button>
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
        <div class="placed-row">
          <span>{icon(it.furnitureId)} {furnName(it.furnitureId)}</span>
          <button class="btn btn--sm btn--ghost remove-btn" disabled={!!busy} on:click={() => remove(it.furnitureId)}>
            {busy === it.furnitureId ? '…' : 'Quitar'}
          </button>
        </div>
      {/each}
    </div>
  {/if}
{/if}
</div>

<style>

  /* Tarjeta de estado */
  .habitat-status-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: var(--surface);
    color: var(--ink);
    border: var(--outline);
    border-radius: var(--radius-cards);
    padding: 10px 12px;
    box-shadow: var(--shadow-1);
    transition: background var(--dur-2) var(--ease-out);
  }
  .habitat-status-card.in-house {
    background: color-mix(in srgb, var(--success) 14%, var(--surface));
    box-shadow: var(--shadow-pop);
  }
  .status-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .status-icon-circle {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
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
    font-size: 11px;
    font-weight: 800;
    padding: 1px 8px;
    border-radius: var(--radius-pills);
    border: 1px solid var(--color-carbon);
    background: var(--color-sunburst);
    color: var(--on-color);
  }
  .in-house .status-badge { background: var(--color-mint-pop); }
  .status-subtitle { font-size: 11.5px; color: var(--ink-muted); margin: 0; line-height: 1.3; }

  /* --- DIORAMA ---
     Isla de tono: paleta fija por sala, igual en claro y oscuro. */
  .diorama-stage {
    color-scheme: light;
    --wall-top: #fff3d6;
    --wall-bottom: #ffe0a8;
    --wall-stripe: rgb(160 110 60 / 0.08);
    --floor-top: #c98a4b;
    --floor-bottom: #a26431;
    --plank: rgb(0 0 0 / 0.12);
    --trim: #8a5a2b;
    --sky-top: #8fd0ff;
    --sky-bottom: #dceeff;
    --light: rgb(255 240 190 / 0.75);
    --floor-h: 66px;

    position: relative;
    width: 100%;
    height: 220px;
    border-radius: var(--radius-cards);
    overflow: hidden;
    border: 1.5px solid var(--color-carbon);
    box-shadow: var(--shadow-pop);
    background:
      repeating-linear-gradient(90deg, transparent 0 26px, var(--wall-stripe) 26px 28px),
      linear-gradient(180deg, var(--wall-top) 0%, var(--wall-bottom) 100%);
    transition: outline-color var(--dur-1), box-shadow var(--dur-1);
    outline: 3px solid transparent;
    outline-offset: 2px;
  }
  .diorama-stage.drop-target {
    outline-color: var(--color-mint-pop);
    box-shadow: var(--shadow-pop), 0 0 24px rgb(85 219 156 / 0.55);
  }

  .stage--jardin {
    --wall-top: #bfe8ff;
    --wall-bottom: #e2f6ff;
    --wall-stripe: transparent;
    --floor-top: #6cc56a;
    --floor-bottom: #3f9a45;
    --plank: rgb(0 60 0 / 0.1);
    --trim: #2f7a35;
    --light: rgb(255 255 220 / 0.85);
  }
  .stage--santuario {
    --wall-top: #f4e7d1;
    --wall-bottom: #e2cfae;
    --wall-stripe: rgb(120 80 30 / 0.1);
    --floor-top: #b8834a;
    --floor-bottom: #7e5426;
    --trim: #c0392b;
    --light: rgb(255 210 150 / 0.7);
  }
  .stage--citafinal {
    --wall-top: #e9ccff;
    --wall-bottom: #cdb4ff;
    --wall-stripe: rgb(92 74 222 / 0.1);
    --floor-top: #6d5bff;
    --floor-bottom: #3d2fa8;
    --plank: rgb(255 255 255 / 0.12);
    --trim: #5c4ade;
    --sky-top: #3a2f7a;
    --sky-bottom: #b3a8ff;
    --light: rgb(200 240 255 / 0.7);
  }
  /* De noche, si duerme */
  .diorama-stage.night {
    --wall-top: #3b3570;
    --wall-bottom: #2a2552;
    --wall-stripe: rgb(0 0 0 / 0.12);
    --floor-top: #5a3f27;
    --floor-bottom: #3f2b19;
    --sky-top: #1b1846;
    --sky-bottom: #3a2f7a;
    --light: rgb(150 140 255 / 0.35);
  }

  .diorama-light {
    position: absolute;
    inset: 0;
    background: radial-gradient(60% 55% at 78% 22%, var(--light), transparent 70%);
    pointer-events: none;
  }
  .diorama-window {
    position: absolute;
    top: 16px;
    right: 22px;
    width: 54px;
    height: 58px;
    border: 4px solid #fffaf0;
    outline: 1.5px solid var(--color-carbon);
    border-radius: 12px 12px 6px 6px;
    overflow: hidden;
  }
  .window-sky {
    width: 100%;
    height: 100%;
    background:
      linear-gradient(90deg, transparent calc(50% - 2px), #fffaf0 calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)),
      linear-gradient(0deg, transparent calc(50% - 2px), #fffaf0 calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)),
      linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 100%);
  }
  .night .window-sky {
    background:
      linear-gradient(90deg, transparent calc(50% - 2px), #fffaf0 calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)),
      linear-gradient(0deg, transparent calc(50% - 2px), #fffaf0 calc(50% - 2px) calc(50% + 2px), transparent calc(50% + 2px)),
      radial-gradient(circle at 70% 30%, #fff6c8 0 6px, transparent 7px),
      linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 100%);
  }
  .diorama-baseboard {
    position: absolute;
    left: 0;
    right: 0;
    bottom: var(--floor-h);
    height: 8px;
    background: var(--trim);
    border-top: 1.5px solid rgb(11 10 20 / 0.35);
  }
  .diorama-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--floor-h);
    border-top: 1.5px solid var(--color-carbon);
    background:
      linear-gradient(180deg, rgb(0 0 0 / 0.14), transparent 40%),
      repeating-linear-gradient(90deg, transparent 0 44px, var(--plank) 44px 46px),
      linear-gradient(180deg, var(--floor-top) 0%, var(--floor-bottom) 100%);
  }

  /* Muebles con profundidad */
  .furniture-prop {
    position: absolute;
    bottom: 6px;
    z-index: 6;
    transform: translateX(-50%);
    pointer-events: auto;
    filter: drop-shadow(0 5px 3px rgb(0 0 0 / 0.3));
  }
  .furniture-prop.back {
    bottom: calc(var(--floor-h) - 22px);
    z-index: 2;
    filter: drop-shadow(0 3px 2px rgb(0 0 0 / 0.22)) saturate(0.9);
  }
  .furn-sprite { font-size: 34px; line-height: 1; }
  .back .furn-sprite { font-size: 26px; }

  /* Pockai */
  .pet-in-room {
    position: absolute;
    bottom: 14px;
    z-index: 4;
    transform: translateX(-50%);
    transition: left var(--walk-ms, 1.6s) linear;
    cursor: grab;
  }
  .pet-in-room:active { cursor: grabbing; }
  .pet-facing {
    position: relative;
    z-index: 1;
    transition: transform var(--dur-2) var(--ease-out);
  }
  .pet-shadow {
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 56px;
    height: 11px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: rgb(11 10 20 / 0.3);
    filter: blur(1px);
  }
  .pet-zzz {
    position: absolute;
    top: 0;
    right: -4px;
    z-index: 2;
    font-family: var(--font-display);
    font-size: 16px;
    color: #e9ccff;
    animation: zzz 2.6s ease-in-out infinite;
  }
  @keyframes zzz {
    0% { transform: translateY(6px); opacity: 0; }
    30% { opacity: 1; }
    100% { transform: translate(6px, -16px); opacity: 0; }
  }

  .pet-absent-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    text-align: center;
    background: rgb(11 10 20 / 0.38);
    backdrop-filter: blur(2px);
  }
  .absent-text {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-carbon);
    background: rgb(255 255 255 / 0.9);
    border: 1px solid var(--color-carbon);
    padding: 4px 12px;
    border-radius: var(--radius-pills);
  }
  .absent-hint { font-size: 10.5px; color: rgb(255 255 255 / 0.85); font-weight: 600; }
  .drop-target .pet-absent-overlay { background: rgb(85 219 156 / 0.35); }

  .room-locked-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 11;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: var(--color-carbon);
    background: var(--color-soft-mist);
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    padding: 2px 9px;
  }

  /* Buffs y compras */
  .buffs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  .buffs :global(.ui-empty) { grid-column: 1 / -1; }
  .buff {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
  }
  .buff small { font-size: 11px; color: var(--ink-muted); }
  .buff span { font-size: 13px; font-weight: 800; color: var(--success-ink); }

  .shop, .placed { display: flex; flex-direction: column; gap: 6px; }
  .shop-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
  }
  .f-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    font-size: 20px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .f-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .f-name { font-size: 13px; font-weight: 700; color: var(--ink); }
  .f-info small { font-size: 10.5px; color: var(--ink-muted); }
  .f-price { font-size: 12px; font-weight: 800; white-space: nowrap; color: var(--ink); }
  .f-price.short { color: var(--danger-ink); }
  .placed-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 6px 4px 10px;
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    font-size: 12px;
    color: var(--ink);
  }
  .remove-btn { color: var(--danger-ink); }
</style>
