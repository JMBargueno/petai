<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, getAccessToken } from './lib/api';
  import { initSocket, getSocket } from './lib/socket';
  import { startClickThrough } from './lib/clickthrough';
  import PetView from './components/PetView.svelte';
  import ControlPanel from './components/ControlPanel.svelte';

  let user: any = null;
  let pets: any[] = [];
  let currentPet: any = null;
  let eggs: any[] = [];
  let inventory: any[] = [];
  let shopItems: any[] = [];
  let isPanelOpen = true;

  let petViewRef: any = null;

  async function loadInitialData() {
    try {
      const catalog = await api.getCatalog();
      shopItems = catalog.foods || [];

      if (getAccessToken()) {
        user = await api.getMe();
        pets = await api.getPets();
        currentPet = pets.length > 0 ? pets[0] : null;
        eggs = await api.getEggs();
        inventory = await api.getInventory();

        // Conectar WebSocket en tiempo real
        const socket = initSocket();
        socket.on('pet:update', (updatedPet: any) => {
          if (currentPet && currentPet.id === updatedPet.id) {
            currentPet = updatedPet;
          }
          const index = pets.findIndex((p) => p.id === updatedPet.id);
          if (index !== -1) {
            pets[index] = updatedPet;
          }
        });
      }
    } catch (err) {
      console.warn('Sesión no iniciada o token expirado:', err);
      api.logout();
      user = null;
    }
  }

  function handlePetAction(action: 'eat' | 'happy') {
    if (petViewRef && petViewRef.triggerAnim) {
      petViewRef.triggerAnim(action);
    }
  }

  let stopClickThrough: () => void = () => {};

  onMount(() => {
    stopClickThrough = startClickThrough();
    loadInitialData();
  });

  onDestroy(() => {
    stopClickThrough();
    const socket = getSocket();
    if (socket) socket.disconnect();
  });
</script>

<main class="app-viewport">
  <!-- Botón flotante para alternar panel de control -->
  <button
    class="toggle-panel-pill"
    on:click={() => (isPanelOpen = !isPanelOpen)}
    title="Abrir/Cerrar Panel de Control"
  >
    {isPanelOpen ? '✕ Ocultar Panel' : '🐾 Abrir Panel'}
  </button>

  <!-- Mascota Interactiva Flotante -->
  {#if currentPet}
    <PetView
      bind:this={petViewRef}
      pet={currentPet}
      onPetClick={() => (isPanelOpen = true)}
    />
  {/if}

  <!-- Panel de Control y Cuidados -->
  <ControlPanel
    isOpen={isPanelOpen}
    user={user}
    pet={currentPet}
    eggs={eggs}
    inventory={inventory}
    shopItems={shopItems}
    on:close={() => (isPanelOpen = false)}
    on:authSuccess={loadInitialData}
    on:refreshUser={async () => (user = await api.getMe())}
    on:refreshEggs={async () => (eggs = await api.getEggs())}
    on:petUpdated={(e) => {
      currentPet = e.detail;
      const idx = pets.findIndex((p) => p.id === currentPet.id);
      if (idx !== -1) pets[idx] = currentPet;
      else pets = [currentPet, ...pets];
    }}
    on:actionTriggered={(e) => handlePetAction(e.detail)}
    on:logout={() => {
      user = null;
      currentPet = null;
      pets = [];
      eggs = [];
      inventory = [];
    }}
  />
</main>

<style>
  .app-viewport {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: transparent;
    overflow: hidden;
    pointer-events: none;
  }

  .toggle-panel-pill {
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #38bdf8;
    padding: 8px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
    z-index: 90;
    transition: all 0.2s;
  }

  .toggle-panel-pill:hover {
    background: rgba(30, 41, 59, 0.95);
    transform: translateY(-2px);
  }
</style>
