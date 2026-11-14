<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, getAccessToken, onSessionExpired } from './lib/api';
  import { initSocket, closeSocket } from './lib/socket';
  import { startClickThrough } from './lib/clickthrough';
  import { notifyPetNeeds, notifyNow } from './lib/notifications';
  import {
    fetchStatus,
    startHeartbeat,
    requestOptInCoordinates,
    saveCoordinates,
    type EnvironmentalStatus,
    type EnvironmentalChangedEvent,
  } from './lib/environmental';
  import PetView from './components/PetView.svelte';
  import ControlPanel from './components/ControlPanel.svelte';

  let user: any = null;
  let pets: any[] = [];
  let currentPet: any = null;
  let eggs: any[] = [];
  let inventory: any[] = [];
  let shopItems: any[] = [];
  let isPanelOpen = true;
  let bubbleText = '';
  let bubbleTimer: any = null;
  // Estado ambiental (feature 005): hora del día, clima, actividad y festividad del usuario.
  let environmental: EnvironmentalStatus | null = null;
  let stopHeartbeat: () => void = () => {};

  function showBubble(text: string) {
    bubbleText = text.length > 160 ? text.slice(0, 157) + '…' : text;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubbleText = ''), 10_000);
  }

  async function refreshPet() {
    try {
      const fresh = await api.getPets();
      pets = fresh;
      currentPet = fresh.find((p: any) => p.id === currentPet?.id) ?? currentPet;
    } catch {
      /* se actualizará con el siguiente ciclo */
    }
  }

  let petViewRef: any = null;

  async function loadInitialData() {
    try {
      const catalog = await api.getCatalog();
      shopItems = catalog.foods || [];

      if (getAccessToken()) {
        user = await api.getMe();
        // El servidor usa la zona horaria del usuario (ciclo de sueño, recordatorios):
        // si sigue en el valor por defecto (UTC), se ajusta a la del equipo.
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (user.timezone === 'UTC' && localTz && localTz !== 'UTC') {
          try {
            user = await api.updateMe({ timezone: localTz });
          } catch {
            /* no crítico: se reintenta en el próximo inicio */
          }
        }
        pets = await api.getPets();
        currentPet = pets.length > 0 ? pets[0] : null;
        eggs = await api.getEggs();
        inventory = await api.getInventory();

        checkReminders();

        // Conectar WebSocket en tiempo real
        const socket = initSocket();
        socket.on('pet:update', (updatedPet: any) => {
          if (currentPet && currentPet.id === updatedPet.id) {
            currentPet = updatedPet;
            notifyPetNeeds(updatedPet);
          }
          const index = pets.findIndex((p) => p.id === updatedPet.id);
          if (index !== -1) {
            pets[index] = updatedPet;
          }
        });
        // Otro jugador ha retado a tu mascota en la arena (pelea asíncrona)
        socket.on('battle:defended', (b: any) => {
          // Resultado desde el punto de vista de la mascota defensora (la del usuario)
          const outcome = b.draw ? 'empató' : b.won ? 'ganó' : 'perdió';
          const delta = b.eloDelta ? ` (${b.eloDelta > 0 ? '+' : ''}${b.eloDelta} ELO)` : '';
          const text = `⚔️ ${b.attackerName} retó a ${b.defenderPetName}: tu mascota ${outcome}${delta}`;
          showBubble(text);
          notifyNow('Te han retado en la arena', text);
        });

        // Feature ambiental: hora del día, clima, inactividad y festividades
        socket.on('environmental:changed', (ev: EnvironmentalChangedEvent) => handleEnvironmentalChanged(ev));
        setupCoordinates(); // geolocalización opt-in → clima real
        loadEnvironmental(); // estado inicial
        stopHeartbeat = startHeartbeat(); // heartbeat cada 60 s
      }
    } catch (err) {
      // Si la sesión ya no es válida, la capa de API la cierra (onSessionExpired). Un fallo de
      // red no borra los tokens: se podrá entrar sin credenciales en el próximo arranque.
      console.warn('Sesión no iniciada o servidor no disponible:', err);
      user = null;
    }
  }

  function handlePetAction(action: 'eat' | 'happy') {
    if (petViewRef && petViewRef.triggerAnim) {
      petViewRef.triggerAnim(action);
    }
  }

  function clearSessionState() {
    closeSocket();
    stopHeartbeat();
    user = null;
    currentPet = null;
    pets = [];
    eggs = [];
    inventory = [];
    environmental = null;
  }

  // ---------- Ambiental (feature 005) ----------
  /** Recarga el estado ambiental completo. */
  async function loadEnvironmental() {
    if (!getAccessToken()) return;
    try {
      environmental = await fetchStatus();
    } catch {
      /* sin conexión o sesión: se reintenta con el heartbeat */
    }
  }

  /** Geolocalización opt-in (privacidad): si el usuario acepta, se guardan las coordenadas. */
  async function setupCoordinates() {
    if (!getAccessToken()) return;
    const coords = await requestOptInCoordinates();
    if (!coords) return; // denegado o no disponible → se sigue sin clima (degradación elegante)
    try {
      await saveCoordinates(coords);
    } catch {
      /* no crítico: se reintenta en el próximo arranque */
    }
  }

  /** Aplica un evento `environmental:changed` del WebSocket al estado local. */
  function handleEnvironmentalChanged(ev: EnvironmentalChangedEvent) {
    if (!environmental) {
      loadEnvironmental();
      return;
    }
    if (ev.type === 'weather') {
      const d = ev.data as { condition: any; temperature: number | null; weatherCode: number | null };
      environmental = {
        ...environmental,
        weather: {
          ...environmental.weather,
          condition: d.condition,
          temperature: d.temperature,
          weatherCode: d.weatherCode,
        },
      };
    } else if (ev.type === 'timeOfDay') {
      environmental = { ...environmental, timeOfDay: (ev.data as { timeOfDay: any }).timeOfDay };
    } else if (ev.type === 'activity') {
      const mode = (ev.data as { mode: any }).mode;
      environmental = {
        ...environmental,
        activity: { ...environmental.activity, mode, active: mode === 'active' },
      };
    } else if (ev.type === 'festival') {
      environmental = { ...environmental, festival: ev.data };
    }
  }

  let stopClickThrough: () => void = () => {};
  let stopSessionExpired: () => void = () => {};
  let needsPoll: any = null;

  // Las constantes vitales solo se recalculan al consultar al servidor (tick perezoso):
  // se consulta cada minuto para poder avisar cuando la mascota necesita atención.
  // Recordatorios creados por la mascota (con confirmación): al vencer se avisa y se marcan entregados
  async function checkReminders() {
    if (!getAccessToken()) return;
    try {
      const due = await api.getDueReminders();
      for (const r of due) {
        showBubble(`⏰ ${r.text}`);
        await notifyNow('Recordatorio', r.text);
        await api.markReminderDelivered(r.id);
      }
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }

  async function pollPet() {
    checkReminders();
    if (!getAccessToken() || !currentPet) return;
    try {
      const fresh = await api.getPets();
      const pet = fresh.find((p: any) => p.id === currentPet.id);
      if (pet) {
        currentPet = pet;
        pets = fresh;
        notifyPetNeeds(pet);
      }
    } catch {
      /* sin conexión o sesión caducada: se reintenta en el siguiente ciclo */
    }
  }

  onMount(() => {
    stopClickThrough = startClickThrough();
    // Refresh token rechazado (caducado o revocado): vuelta a la pantalla de acceso
    stopSessionExpired = onSessionExpired(() => {
      clearSessionState();
      isPanelOpen = true;
    });
    needsPoll = setInterval(pollPet, 60_000);
    loadInitialData();
  });

  onDestroy(() => {
    clearInterval(needsPoll);
    clearTimeout(bubbleTimer);
    stopHeartbeat();
    stopClickThrough();
    stopSessionExpired();
    closeSocket();
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
      bubble={bubbleText}
      environmental={environmental}
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
    on:bubble={(e) => showBubble(e.detail)}
    on:refreshPet={refreshPet}
    on:logout={clearSessionState}
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
