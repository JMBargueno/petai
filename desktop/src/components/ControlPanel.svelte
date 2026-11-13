<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import { eggLibrary } from '../lib/sprites';
  import MinigamesTab from './MinigamesTab.svelte';

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

  let activeTab: 'pet' | 'hatch' | 'games' | 'shop' | 'account' = 'pet';

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
        <span class="logo">🐾 PetAI</span>
        {#if user}
          <div class="user-pill">
            <span>🪙 {user.coins}</span>
            <span>💎 {user.gems}</span>
          </div>
        {/if}
      </div>
      <button class="close-btn" on:click={() => dispatch('close')}>✕</button>
    </div>

    {#if !user}
      <!-- Formulario de Inicio de Sesión / Registro -->
      <div class="auth-section">
        <h3>{isLoginMode ? 'Iniciar Sesión' : 'Crear Cuenta'}</h3>
        <p class="subtitle">Conecta con tu mascota virtual autoritativa</p>

        {#if authError}
          <div class="error-msg">{authError}</div>
        {/if}

        <div class="form-group">
          <label for="auth-email">Correo Electrónico</label>
          <input id="auth-email" type="email" bind:value={authEmail} placeholder="entrenador@petai.local" />
        </div>

        {#if !isLoginMode}
          <div class="form-group">
            <label for="auth-name">Nombre de Jugador</label>
            <input id="auth-name" type="text" bind:value={authDisplayName} placeholder="Red" />
          </div>
        {/if}

        <div class="form-group">
          <label for="auth-pass">Contraseña</label>
          <input id="auth-pass" type="password" bind:value={authPassword} placeholder="••••••••" />
        </div>

        <button class="primary-btn" on:click={handleAuth} disabled={isLoading}>
          {isLoading ? 'Cargando...' : isLoginMode ? 'Entrar' : 'Registrarse'}
        </button>

        <button class="link-btn" on:click={() => (isLoginMode = !isLoginMode)}>
          {isLoginMode ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    {:else}
      <!-- Navegación de Pestañas -->
      <div class="nav-tabs">
        <button class:active={activeTab === 'pet'} on:click={() => (activeTab = 'pet')}>Mascota</button>
        <button class:active={activeTab === 'hatch'} on:click={() => (activeTab = 'hatch')}>
          Eclosión {#if eggs.length > 0}<span class="tab-badge">{eggs.length}</span>{/if}
        </button>
        <button class:active={activeTab === 'games'} on:click={() => (activeTab = 'games')}>Juegos</button>
        <button class:active={activeTab === 'shop'} on:click={() => (activeTab = 'shop')}>Tienda</button>
        <button class:active={activeTab === 'account'} on:click={() => (activeTab = 'account')}>Cuenta</button>
      </div>

      <div class="tab-content">
        <!-- Pestaña 1: Mascota & Vitalidad -->
        {#if activeTab === 'pet'}
          {#if pet}
            <div class="pet-summary">
              <div class="stat-header">
                <div>
                  <span class="pet-title">{pet.nickname || pet.species?.name}</span>
                  <span class="pet-species-tag">{pet.species?.element?.toUpperCase()} · {pet.rarity?.toUpperCase()}</span>
                </div>
                <span class="level-tag">Nivel {pet.level}</span>
              </div>

              <!-- Barras de vitalidad -->
              <div class="vitals-grid">
                <div class="vital-item">
                  <div class="vital-label"><span>🍖 Hambre</span><span>{Math.round(pet.hunger)}%</span></div>
                  <div class="progress-bar"><div class="fill hunger" style="width: {pet.hunger}%;"></div></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span>✨ Felicidad</span><span>{Math.round(pet.happiness)}%</span></div>
                  <div class="progress-bar"><div class="fill happiness" style="width: {pet.happiness}%;"></div></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span>⚡ Energía</span><span>{Math.round(pet.energy)}%</span></div>
                  <div class="progress-bar"><div class="fill energy" style="width: {pet.energy}%;"></div></div>
                </div>
                <div class="vital-item">
                  <div class="vital-label"><span>🫧 Higiene</span><span>{Math.round(pet.hygiene)}%</span></div>
                  <div class="progress-bar"><div class="fill hygiene" style="width: {pet.hygiene}%;"></div></div>
                </div>
              </div>

              <!-- Acciones de cuidado -->
              <div class="actions-row">
                <button class="action-btn" on:click={handleClean}>🫧 Bañar</button>
                <button class="action-btn" on:click={handleToggleSleep}>
                  {pet.sleeping ? '☀️ Despertar' : '🌙 Dormir'}
                </button>
              </div>

              <!-- Menú de alimentación rápida con inventario -->
              <div class="food-selector">
                <span class="section-label">Alimentar desde inventario:</span>
                <div class="food-chips">
                  {#each inventory as item}
                    <button class="food-chip" on:click={() => handleFeed(item.itemId)}>
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
              <p>No tienes una mascota activa.</p>
              <button class="primary-btn" on:click={() => (activeTab = 'hatch')}>Ir a Eclosionar Huevo</button>
            </div>
          {/if}

        <!-- Pestaña 2: Eclosión -->
        {:else if activeTab === 'hatch'}
          <div class="hatch-section">
            <h4>Tus Huevos en Incubación</h4>
            {#each eggs as egg}
              <div class="egg-card">
                <div class="egg-preview {isShaking && hatchingEggId === egg.id ? 'shake' : ''}">
                  {#if isCracking && hatchingEggId === egg.id}
                    {@html eggLibrary.cracked}
                  {:else}
                    {@html eggLibrary.closed}
                  {/if}
                </div>
                <div class="egg-info">
                  <span class="egg-type">Huevo {egg.eggType}</span>
                  <button
                    class="hatch-btn"
                    disabled={hatchingEggId === egg.id}
                    on:click={() => handleHatch(egg.id)}
                  >
                    {hatchingEggId === egg.id ? '¡Eclosionando!' : 'Eclosionar'}
                  </button>
                </div>
              </div>
            {:else}
              <p class="empty-msg">No tienes huevos listos.</p>
            {/each}

            <div class="buy-egg-box">
              <button class="secondary-btn" on:click={handleBuyEgg}>
                Comprar nuevo huevo (50 🪙)
              </button>
            </div>

            {#if hatchedResult}
              <div class="hatched-announcement">
                🎉 ¡Ha nacido un <strong>{hatchedResult.species?.name}</strong>!
                <span class="rarity-pill {hatchedResult.rarity}">{hatchedResult.rarity}</span>
              </div>
            {/if}
          </div>

        <!-- Pestaña 3: Tienda -->
        {:else if activeTab === 'shop'}
          <div class="shop-grid">
            {#each shopItems as item}
              <div class="shop-card">
                <span class="item-name">{item.name}</span>
                <span class="item-desc">{item.description}</span>
                <div class="shop-footer">
                  <span class="price">🪙 {item.priceCoins}</span>
                  <button class="buy-btn" on:click={() => handleBuyItem(item.id)}>Comprar</button>
                </div>
              </div>
            {/each}
          </div>

        <!-- Pestaña: Minijuegos -->
        {:else if activeTab === 'games'}
          <MinigamesTab
            {pet}
            on:petUpdated={(e) => {
              dispatch('petUpdated', e.detail);
              dispatch('actionTriggered', 'happy');
            }}
            on:refreshUser
          />

        <!-- Pestaña 4: Cuenta -->
        {:else if activeTab === 'account'}
          <div class="account-section">
            <p><strong>Jugador:</strong> {user.displayName || user.email}</p>
            <p><strong>Monedas:</strong> 🪙 {user.coins}</p>
            <p><strong>Gemas:</strong> 💎 {user.gems}</p>
            <button class="danger-btn" on:click={() => { api.logout(); dispatch('logout'); }}>
              Cerrar Sesión
            </button>
          </div>
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
    width: 380px;
    max-height: 90vh;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    color: #f8fafc;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
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
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    font-weight: 700;
    font-size: 16px;
  }

  .user-pill {
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 8px;
    border-radius: 20px;
    font-size: 12px;
    display: flex;
    gap: 8px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
  }

  .nav-tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .nav-tabs button {
    flex: 1;
    padding: 10px 0;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .nav-tabs button.active {
    color: #38bdf8;
    border-bottom: 2px solid #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .tab-badge {
    background: #ef4444;
    color: white;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10px;
    margin-left: 4px;
  }

  .tab-content {
    padding: 16px;
    overflow-y: auto;
  }

  /* Vitals */
  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .pet-title {
    font-size: 18px;
    font-weight: 700;
    display: block;
  }

  .pet-species-tag {
    font-size: 11px;
    color: #94a3b8;
  }

  .level-tag {
    background: #f59e0b;
    color: #000;
    font-weight: 700;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 8px;
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
    margin-bottom: 4px;
    color: #cbd5e1;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  .fill.hunger { background: #f97316; }
  .fill.happiness { background: #ec4899; }
  .fill.energy { background: #eab308; }
  .fill.hygiene { background: #06b6d4; }

  .actions-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }

  .action-btn {
    flex: 1;
    padding: 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background 0.2s;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .food-selector {
    background: rgba(0, 0, 0, 0.25);
    border-radius: 10px;
    padding: 10px;
  }

  .section-label {
    font-size: 12px;
    color: #94a3b8;
    display: block;
    margin-bottom: 6px;
  }

  .food-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .food-chip {
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #e0f2fe;
    padding: 4px 8px;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
  }

  .chip-qty {
    color: #38bdf8;
    font-weight: 700;
  }

  /* Hatching */
  .egg-card {
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(255, 255, 255, 0.04);
    padding: 12px;
    border-radius: 12px;
    margin-bottom: 10px;
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

  .hatch-btn {
    background: #38bdf8;
    color: #000;
    border: none;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }

  .hatched-announcement {
    margin-top: 14px;
    padding: 12px;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid #22c55e;
    border-radius: 10px;
    text-align: center;
    font-size: 14px;
  }

  /* Tienda */
  .shop-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .shop-card {
    background: rgba(255, 255, 255, 0.04);
    padding: 10px 12px;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .item-name {
    font-weight: 600;
    font-size: 14px;
  }

  .item-desc {
    font-size: 11px;
    color: #94a3b8;
  }

  .shop-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
  }

  .price {
    font-weight: 700;
    color: #fbbf24;
  }

  .buy-btn {
    background: #38bdf8;
    color: #000;
    border: none;
    font-weight: 600;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
  }

  /* Form / Auth */
  .auth-section {
    padding: 10px;
  }

  .subtitle {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .form-group label {
    font-size: 12px;
    color: #cbd5e1;
  }

  .form-group input {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 8px 12px;
    border-radius: 8px;
    color: white;
  }

  .primary-btn {
    width: 100%;
    padding: 10px;
    background: #38bdf8;
    color: #000;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 6px;
  }

  .secondary-btn {
    width: 100%;
    padding: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .link-btn {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 12px;
    cursor: pointer;
    margin-top: 10px;
    width: 100%;
    text-align: center;
  }

  .danger-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 10px;
  }

  .error-msg {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
    padding: 8px;
    border-radius: 6px;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .empty-msg {
    font-size: 12px;
    color: #64748b;
    text-align: center;
    padding: 12px 0;
  }
</style>
