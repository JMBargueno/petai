<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import { eggLibrary } from '../lib/sprites';
  import MinigamesTab from './MinigamesTab.svelte';
  import AiTab from './AiTab.svelte';
  import ArenaTab from './ArenaTab.svelte';
  import SeasonsTab from './SeasonsTab.svelte';
  import MissionsTab from './MissionsTab.svelte';
  import ChestsTab from './ChestsTab.svelte';
  import BondingTab from './BondingTab.svelte';
  import HabitatTab from './HabitatTab.svelte';
import RaidTab from './RaidTab.svelte';
import TournamentTab from './TournamentTab.svelte';
  import NotificationSettingsPanel from './NotificationSettingsPanel.svelte';
  import { PawPrint, Gamepad2, MessageCircle, Trophy, ShoppingBag, Settings, Coins, Gem, X, Drumstick, Sparkles, Zap, Droplets, Moon, Sun, Egg, LogOut } from 'lucide-svelte';

  export let user: any = null;
  export let pet: any = null;
  export let eggs: any[] = [];
  export let inventory: any[] = [];
  export let shopItems: any[] = [];
  export let isOpen: boolean = true;

  // Arrastre del panel desde su cabecera (la posición se conserva al cerrar/abrir)
  let panelEl: HTMLElement | null = null;
  let panelPos: { x: number; y: number } | null = null;
  let panelDragging = false;
  let panelGrab = { x: 0, y: 0 };

  function startPanelDrag(e: MouseEvent) {
    if (e.button !== 0 || !panelEl || (e.target as HTMLElement).closest('button')) return;
    const r = panelEl.getBoundingClientRect();
    panelPos = { x: r.left, y: r.top };
    panelGrab = { x: e.clientX - r.left, y: e.clientY - r.top };
    panelDragging = true;
    // El click-through captura todo el viewport mientras se arrastra
    document.body.dataset.dragging = '1';
    window.addEventListener('mousemove', onPanelDrag);
    window.addEventListener('mouseup', endPanelDrag);
    e.preventDefault();
  }

  function onPanelDrag(e: MouseEvent) {
    if (!panelDragging || !panelEl) return;
    const maxX = window.innerWidth - panelEl.offsetWidth;
    const maxY = window.innerHeight - 48; // deja la cabecera siempre visible
    panelPos = {
      x: Math.min(Math.max(0, e.clientX - panelGrab.x), Math.max(0, maxX)),
      y: Math.min(Math.max(0, e.clientY - panelGrab.y), Math.max(0, maxY)),
    };
  }

  function endPanelDrag() {
    panelDragging = false;
    delete document.body.dataset.dragging;
    window.removeEventListener('mousemove', onPanelDrag);
    window.removeEventListener('mouseup', endPanelDrag);
  }

  onDestroy(endPanelDrag);

  const dispatch = createEventDispatcher();

  // Navegación: 6 destinos con sub-secciones (docs/PANTALLAS.md §4.3).
  const NAV = [
    { id: 'pet', label: 'Mascota', icon: PawPrint, subs: [['home', 'Inicio'], ['hatch', 'Eclosión'], ['bonding', 'Vínculo'], ['habitat', 'Hábitat']] },
    { id: 'play', label: 'Jugar', icon: Gamepad2, subs: [['games', 'Minijuegos'], ['arena', 'Arena'], ['raid', 'Raid'], ['tournament', 'Torneo']] },
    { id: 'chat', label: 'Chat', icon: MessageCircle, subs: [] },
    { id: 'progress', label: 'Progreso', icon: Trophy, subs: [['missions', 'Misiones'], ['seasons', 'Temporada']] },
    { id: 'shop', label: 'Tienda', icon: ShoppingBag, subs: [['store', 'Tienda'], ['chests', 'Cofres']] },
    { id: 'settings', label: 'Ajustes', icon: Settings, subs: [['account', 'Cuenta'], ['notifications', 'Avisos']] },
  ];
  let dest: string = 'pet';
  let sub: string = 'home';
  /** Petición externa (p. ej. la campana de App.svelte) para abrir una sección concreta. */
  export let request: { dest: string; sub: string; n: number } | null = null;
  let lastRequest = 0;
  $: if (request && request.n !== lastRequest) {
    lastRequest = request.n;
    go(request.dest, request.sub);
  }
  function go(d: string, s?: string) {
    dest = d;
    const entry = NAV.find((n) => n.id === d)!;
    sub = s ?? (entry.subs[0]?.[0] ?? '');
  }
  $: current = NAV.find((n) => n.id === dest)!;

  // Auth inputs
  let isLoginMode = true;
  let authEmail = '';
  let authPassword = '';
  let authDisplayName = '';
  let authError = '';
  let isLoading = false;

  // Hatching animation state
  let hatchingEggId: string | null = null;
  let isShaking = false;
  let isCracking = false;
  let hatchedResult: any = null;

  async function handleAuth() {
    authError = '';
    isLoading = true;
    try {
      if (isLoginMode) {
        await api.login(authEmail, authPassword);
      } else {
        await api.register(authEmail, authPassword, authDisplayName || undefined);
      }
      dispatch('authSuccess');
    } catch (err: any) {
      authError = err.message || 'Error durante la autenticación';
    } finally {
      isLoading = false;
    }
  }

  async function handleFeed(itemId: string) {
    if (!pet) return;
    try {
      const updated = await api.feedPet(pet.id, itemId);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'eat');
      refreshInventory();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleClean() {
    if (!pet) return;
    try {
      const updated = await api.cleanPet(pet.id);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'happy');
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleToggleSleep() {
    if (!pet) return;
    try {
      const updated = pet.sleeping
        ? await api.wakePet(pet.id)
        : await api.sleepPet(pet.id);
      dispatch('petUpdated', updated);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleHatch(eggId: string) {
    hatchingEggId = eggId;
    isShaking = true;

    setTimeout(() => {
      isCracking = true;
    }, 1500);

    setTimeout(async () => {
      try {
        const newPet = await api.hatchEgg(eggId);
        hatchedResult = newPet;
        dispatch('petUpdated', newPet);
        dispatch('refreshEggs');
      } catch (err: any) {
        alert(err.message);
      } finally {
        isShaking = false;
        isCracking = false;
        hatchingEggId = null;
      }
    }, 2800);
  }

  async function handleBuyEgg() {
    try {
      await api.buyEgg();
      dispatch('refreshEggs');
      dispatch('refreshUser');
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleBuyItem(itemId: string) {
    try {
      await api.buyShopItem(itemId, 1);
      dispatch('refreshUser');
      refreshInventory();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function refreshInventory() {
    const inv = await api.getInventory();
    inventory = inv;
  }
</script>

{#if isOpen}
  <div
    class="panel-card"
    bind:this={panelEl}
    style={panelPos ? `left: ${panelPos.x}px; top: ${panelPos.y}px; right: auto;` : ''}
  >
    <div class="panel-header" on:mousedown={startPanelDrag} role="presentation">
      <div class="header-title">
        <span class="logo"><span class="logo__mark">P</span><span class="display">Pockai</span></span>
        {#if user}
          <div class="user-pill">
            <span title="Monedas"><Coins size={14} /> {user.coins}</span>
            <span title="Gemas"><Gem size={14} /> {user.gems}</span>
          </div>
        {/if}
      </div>
      <button class="btn btn--ghost btn--icon" aria-label="Cerrar panel" on:click={() => dispatch('close')}><X size={18} /></button>
    </div>

    {#if !user}
      <div class="auth-section">
        <span class="eyebrow">Pockai</span>
        <h3 class="display auth-title">{isLoginMode ? 'Iniciar sesión' : 'Crear cuenta'}</h3>
        <p class="subtitle">Conecta con tu mascota virtual</p>

        {#if authError}
          <div class="error-msg">{authError}</div>
        {/if}

        <div class="form-group">
          <label for="auth-email">Correo electrónico</label>
          <input class="input" id="auth-email" type="email" bind:value={authEmail} placeholder="entrenador@pockai.app" />
        </div>

        {#if !isLoginMode}
          <div class="form-group">
            <label for="auth-name">Nombre de jugador</label>
            <input class="input" id="auth-name" type="text" bind:value={authDisplayName} placeholder="Red" />
          </div>
        {/if}

        <div class="form-group">
          <label for="auth-pass">Contraseña</label>
          <input class="input" id="auth-pass" type="password" bind:value={authPassword} placeholder="••••••••" />
        </div>

        <button class="btn btn--primary block" on:click={handleAuth} disabled={isLoading}>
          {isLoading ? 'Cargando…' : isLoginMode ? 'Entrar' : 'Registrarse'}
        </button>

        <button class="btn btn--ghost block" on:click={() => (isLoginMode = !isLoginMode)}>
          {isLoginMode ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    {:else}
      <!-- Destinos principales -->
      <nav class="nav-tabs" aria-label="Secciones">
        {#each NAV as n (n.id)}
          <button class:active={dest === n.id} aria-current={dest === n.id ? 'page' : undefined} on:click={() => go(n.id)}>
            <svelte:component this={n.icon} size={18} />
            <span>{n.label}</span>
            {#if n.id === 'pet' && eggs.length > 0}<span class="tab-badge">{eggs.length}</span>{/if}
          </button>
        {/each}
      </nav>

      <!-- Sub-secciones -->
      {#if current.subs.length > 0}
        <div class="sub-tabs" role="tablist">
          {#each current.subs as s (s[0])}
            <button role="tab" aria-selected={sub === s[0]} class:active={sub === s[0]} on:click={() => (sub = s[0])}>{s[1]}</button>
          {/each}
        </div>
      {/if}

      <div class="tab-content">
        {#if dest === 'pet' && sub === 'home'}
          {#if pet}
            <div class="pet-summary">
              <div class="stat-header">
                <div>
                  <span class="pet-title">{pet.nickname || pet.species?.name}</span>
                  <span class="pet-species-tag">{pet.species?.element} · {pet.rarity}</span>
                </div>
                <span class="chip level-tag">Nivel {pet.level}</span>
              </div>

              <div class="vitals-grid">
                <div class="vital-item">
                  <div class="vital-label"><span><Drumstick size={14} /> Hambre</span><span>{Math.round(pet.hunger)}%</span></div>
                  <div class="meter" style="--meter-color: var(--color-ember)"><i style="width: {pet.hunger}%;"></i></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span><Sparkles size={14} /> Felicidad</span><span>{Math.round(pet.happiness)}%</span></div>
                  <div class="meter" style="--meter-color: var(--color-sunburst)"><i style="width: {pet.happiness}%;"></i></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span><Zap size={14} /> Energía</span><span>{Math.round(pet.energy)}%</span></div>
                  <div class="meter" style="--meter-color: var(--color-electric-blue)"><i style="width: {pet.energy}%;"></i></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span><Droplets size={14} /> Higiene</span><span>{Math.round(pet.hygiene)}%</span></div>
                  <div class="meter" style="--meter-color: var(--color-mint-pop)"><i style="width: {pet.hygiene}%;"></i></div>
                </div>
              </div>

              <div class="actions-row">
                <button class="btn" on:click={handleClean}><Droplets size={16} /> Bañar</button>
                <button class="btn" on:click={handleToggleSleep}>
                  {#if pet.sleeping}<Sun size={16} /> Despertar{:else}<Moon size={16} /> Dormir{/if}
                </button>
              </div>

              <div class="food-selector">
                <span class="label-caps muted">Alimentar desde inventario</span>
                <div class="food-chips">
                  {#each inventory as item}
                    <button class="chip food-chip" on:click={() => handleFeed(item.itemId)}>
                      {item.item.name} <span class="chip-qty">×{item.qty}</span>
                    </button>
                  {:else}
                    <p class="empty-msg">No tienes alimentos. Ve a la tienda a comprar comida.</p>
                  {/each}
                </div>
              </div>
            </div>
          {:else}
            <div class="empty-pet">
              <Egg size={40} />
              <p>No tienes una mascota activa.</p>
              <button class="btn btn--primary" on:click={() => go('pet', 'hatch')}>Ir a eclosionar un huevo</button>
            </div>
          {/if}

        {:else if dest === 'pet' && sub === 'hatch'}
          <div class="hatch-section">
            <span class="label-caps muted">Tus huevos en incubación</span>
            {#each eggs as egg}
              <div class="card egg-card">
                <div class="egg-preview {isShaking && hatchingEggId === egg.id ? 'shake' : ''}">
                  {#if isCracking && hatchingEggId === egg.id}
                    {@html eggLibrary.cracked}
                  {:else}
                    {@html eggLibrary.closed}
                  {/if}
                </div>
                <div class="egg-info">
                  <span class="egg-type">Huevo {egg.eggType}</span>
                  <button class="btn btn--primary btn--sm" disabled={hatchingEggId === egg.id} on:click={() => handleHatch(egg.id)}>
                    {hatchingEggId === egg.id ? '¡Eclosionando!' : 'Eclosionar'}
                  </button>
                </div>
              </div>
            {:else}
              <p class="empty-msg">No tienes huevos listos.</p>
            {/each}

            <div class="buy-egg-box">
              <button class="btn block" on:click={handleBuyEgg}>Comprar nuevo huevo (50 <Coins size={14} />)</button>
            </div>

            {#if hatchedResult}
              <div class="hatched-announcement">
                ¡Ha nacido un <strong>{hatchedResult.species?.name}</strong>!
                <span class="chip rarity-pill {hatchedResult.rarity}">{hatchedResult.rarity}</span>
              </div>
            {/if}
          </div>

        {:else if dest === 'pet' && sub === 'bonding'}
          <BondingTab pet={pet} />

        {:else if dest === 'pet' && sub === 'habitat'}
          <HabitatTab {pet} {user} on:refreshUser />

        {:else if dest === 'play' && sub === 'games'}
          <MinigamesTab
            {pet}
            on:petUpdated={(e) => {
              dispatch('petUpdated', e.detail);
              dispatch('actionTriggered', 'happy');
            }}
            on:refreshUser
          />

        {:else if dest === 'play' && sub === 'arena'}
          <ArenaTab
            {pet}
            on:petUpdated={(e) => dispatch('petUpdated', e.detail)}
            on:refreshUser
            on:refreshPet
          />

        {:else if dest === 'play' && sub === 'raid'}
          <RaidTab {pet} on:refreshPet on:refreshUser />

        {:else if dest === 'play' && sub === 'tournament'}
          <TournamentTab {pet} on:refreshUser />

        {:else if dest === 'chat'}
          <AiTab {pet} on:bubble on:refreshPet />

        {:else if dest === 'progress' && sub === 'missions'}
          <MissionsTab on:refreshUser />

        {:else if dest === 'progress' && sub === 'seasons'}
          <SeasonsTab on:refreshUser />

        {:else if dest === 'shop' && sub === 'store'}
          <div class="shop-grid">
            {#each shopItems as item}
              <div class="card shop-card">
                <span class="item-name">{item.name}</span>
                <span class="item-desc">{item.description}</span>
                <div class="shop-footer">
                  <span class="price"><Coins size={14} /> {item.priceCoins}</span>
                  <button class="btn btn--primary btn--sm" on:click={() => handleBuyItem(item.id)}>Comprar</button>
                </div>
              </div>
            {/each}
          </div>

        {:else if dest === 'shop' && sub === 'chests'}
          <ChestsTab on:refreshUser />

        {:else if dest === 'settings' && sub === 'account'}
          <div class="card account-section">
            <p><strong>Jugador:</strong> {user.displayName || user.email}</p>
            <p><strong>Monedas:</strong> <Coins size={14} /> {user.coins}</p>
            <p><strong>Gemas:</strong> <Gem size={14} /> {user.gems}</p>
            <button class="btn btn--danger" on:click={() => { api.logout(); dispatch('logout'); }}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>

        {:else if dest === 'settings' && sub === 'notifications'}
          <NotificationSettingsPanel />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel-card {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 420px;
    max-height: 90vh;
    background: var(--surface-glass);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: var(--outline);
    border-radius: var(--radius-3xl);
    color: var(--ink);
    box-shadow: var(--shadow-4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 100;
    pointer-events: auto;
  }

  .panel-header {
    cursor: grab;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line-soft);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .logo .display {
    font-size: 18px;
  }
  .logo__mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 10px;
    background: var(--grad-accent);
    color: var(--on-dark);
    font-family: var(--font-display);
    font-size: 14px;
    rotate: -6deg;
    box-shadow: var(--shadow-1), inset 0 1px 0 rgb(255 255 255 / 0.35);
  }

  .user-pill {
    display: flex;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
  }
  .user-pill span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border: var(--outline);
    border-radius: var(--radius-pills);
    background: var(--surface);
  }

  .nav-tabs {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 2px;
    padding: 6px;
    border-bottom: 1px solid var(--line-soft);
  }
  .nav-tabs button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-2xl);
    color: var(--ink-muted);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-1), color var(--dur-1);
  }
  .nav-tabs button:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  .nav-tabs button.active {
    color: var(--accent-ink);
    background: var(--surface);
    border-color: var(--line);
  }

  .tab-badge {
    position: absolute;
    top: 2px;
    right: 8px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: var(--radius-pills);
    background: var(--danger);
    color: var(--on-color);
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }

  .sub-tabs {
    display: flex;
    gap: 6px;
    padding: 8px 12px 0;
    overflow-x: auto;
  }
  .sub-tabs button {
    padding: 4px 12px;
    border: var(--outline);
    border-radius: var(--radius-pills);
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .sub-tabs button.active {
    background: var(--ink);
    color: var(--bg);
  }

  .tab-content {
    padding: 16px;
    overflow-y: auto;
    user-select: text;
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .pet-title {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: 20px;
    display: block;
  }
  .pet-species-tag {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-muted);
  }
  .level-tag {
    background: var(--color-sunburst);
    color: var(--on-color);
    border-color: var(--color-carbon);
  }

  .vitals-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
  }
  .vital-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--ink-muted);
  }
  .vital-label span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .actions-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .actions-row .btn {
    flex: 1;
  }

  .food-selector {
    background: var(--surface-2);
    border-radius: var(--radius-2xl);
    padding: 12px;
  }
  .food-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .food-chip {
    cursor: pointer;
    background: var(--color-mint-pop);
    color: var(--on-color);
    border-color: var(--color-carbon);
  }
  .chip-qty {
    font-weight: 800;
  }

  .empty-pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 0;
    color: var(--ink-muted);
  }

  .hatch-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .egg-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
  }
  .egg-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .egg-type {
    font-weight: 700;
  }
  .egg-preview {
    width: 64px;
    height: 64px;
  }
  .shake {
    animation: eggShake 0.4s infinite ease-in-out;
  }
  @keyframes eggShake {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-8deg); }
    75% { transform: rotate(8deg); }
  }
  .hatched-announcement {
    padding: 12px;
    background: var(--color-mint-pop);
    color: var(--on-color);
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-cards);
    box-shadow: var(--shadow-pop);
    text-align: center;
    font-size: 14px;
  }
  .rarity-pill {
    text-transform: uppercase;
    color: var(--on-color);
  }
  .rarity-pill.common, .rarity-pill.normal { background: var(--rarity-common); }
  .rarity-pill.rare { background: var(--rarity-rare); }
  .rarity-pill.super-rare, .rarity-pill.epic { background: var(--rarity-super-rare); }
  .rarity-pill.legendary { background: var(--rarity-legendary); }
  .rarity-pill.mythic { background: var(--rarity-mythic); }

  .shop-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .shop-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
  }
  .item-name {
    font-weight: 700;
    font-size: 14px;
  }
  .item-desc {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .shop-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
  }
  .price {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 800;
  }

  .auth-section {
    padding: 20px;
  }
  .auth-title {
    margin: 10px 0 4px;
    font-size: 28px;
  }
  .subtitle {
    font-size: 13px;
    color: var(--ink-muted);
    margin: 0 0 14px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .form-group label {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-muted);
  }
  .block {
    width: 100%;
    margin-top: 6px;
  }

  .account-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .account-section p {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  .error-msg {
    background: color-mix(in srgb, var(--danger) 18%, var(--surface));
    border: 1px solid var(--danger);
    color: var(--danger-ink);
    padding: 8px 12px;
    border-radius: var(--radius-2xl);
    font-size: 12px;
    margin-bottom: 10px;
  }
  .empty-msg {
    font-size: 12px;
    color: var(--ink-muted);
    text-align: center;
    padding: 12px 0;
    margin: 0;
  }
</style>
