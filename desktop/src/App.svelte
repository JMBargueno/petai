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
  import { PawPrint, Bell, X } from 'lucide-svelte';
  import { initNotificationHandler, stopNotificationHandler } from './lib/notification-handler';
  import { unreadCount } from './lib/notification-inbox';
  import { updateState, startAutoCheck, checkForUpdates } from './lib/updater';

  let user: any = null;
  let pets: any[] = [];
  let currentPet: any = null;
  let eggs: any[] = [];
  let inventory: any[] = [];
  let shopItems: any[] = [];
  let isPanelOpen = true;
  // Petición de navegación al panel (la campana abre Ajustes › Avisos)
  let panelRequest: { dest: string; sub: string; n: number } | null = null;
  let requestN = 0;
  function openNotifications() {
    panelRequest = { dest: 'settings', sub: 'notifications', n: ++requestN };
    isPanelOpen = true;
  }
  function openAbout() {
    panelRequest = { dest: 'settings', sub: 'about', n: ++requestN };
    isPanelOpen = true;
  }

  // Actualizaciones: la mascota avisa una sola vez por versión nueva.
  let announcedVersion = '';
  $: if ($updateState.status === 'available' && $updateState.version !== announcedVersion) {
    announcedVersion = $updateState.version;
    const text = `¡Ha salido mi versión ${announcedVersion}! Actualízame en Ajustes › Acerca de.`;
    showBubble(text);
    notifyNow('Nueva versión de Pockai', text);
  }

  /** Comprobación pedida desde la bandeja: la mascota cuenta el resultado. */
  async function checkUpdatesFromTray() {
    openAbout();
    await checkForUpdates();
    const s = $updateState;
    if (s.status === 'upToDate') showBubble('¡Ya estoy en la última versión!');
    else if (s.status === 'error') showBubble(s.message);
  }

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

  // Badge de la bandeja/tray (feature 007 / US3): refleja los avisos no leídos en el título de la app.
  $: if (typeof document !== 'undefined') {
    document.title = $unreadCount > 0 ? `(${$unreadCount}) Pockai` : 'Pockai';
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
        // Notificaciones con personalidad (feature 007): suscribe al evento `pet:notification`
        // y lo entrega como nativa de Tauri (o al inbox offline si no es posible).
        initNotificationHandler(socket);
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
          const text = `${b.attackerName} retó a ${b.defenderPetName}: tu mascota ${outcome}${delta}`;
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
  let stopAutoUpdate: () => void = () => {};
  let stopTrayUpdates: () => void = () => {};
  let needsPoll: any = null;

  // Las constantes vitales solo se recalculan al consultar al servidor (tick perezoso):
  // se consulta cada minuto para poder avisar cuando la mascota necesita atención.
  // Recordatorios creados por la mascota (con confirmación): al vencer se avisa y se marcan entregados
  async function checkReminders() {
    if (!getAccessToken()) return;
    try {
      const due = await api.getDueReminders();
      for (const r of due) {
        showBubble(r.text);
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
    stopAutoUpdate = startAutoCheck();
    if ('__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/event')
        .then(({ listen }) => listen('check-updates', () => void checkUpdatesFromTray()))
        .then((unlisten) => (stopTrayUpdates = unlisten))
        .catch(() => {});
    }
  });

  onDestroy(() => {
    clearInterval(needsPoll);
    clearTimeout(bubbleTimer);
    stopHeartbeat();
    stopClickThrough();
    stopSessionExpired();
    stopAutoUpdate();
    stopTrayUpdates();
    stopNotificationHandler();
    closeSocket();
  });
</script>

<main class="app-viewport">
  <!-- Botón flotante para alternar panel de control -->
  <button
    class="btn glass toggle-panel-pill"
    on:click={() => (isPanelOpen = !isPanelOpen)}
    title="Abrir/Cerrar Panel de Control"
  >
    {#if isPanelOpen}<X size={16} /> Ocultar panel{:else}<PawPrint size={16} /> Abrir panel{/if}
  </button>

  <!-- Avisos de la mascota (feature 007 / US3) con badge de no leídas -->
  <button
    class="btn glass notif-toggle-pill"
    on:click={openNotifications}
    title="Ajustes de notificaciones"
    aria-label="Avisos"
  >
    <Bell size={16} />
    {#if $unreadCount > 0}<span class="notif-badge">{$unreadCount}</span>{/if}
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
    request={panelRequest}
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

  .toggle-panel-pill,
  .notif-toggle-pill {
    position: fixed;
    bottom: 16px;
    z-index: 90;
    box-shadow: var(--shadow-2);
  }
  .toggle-panel-pill {
    right: 16px;
  }
  .notif-toggle-pill {
    right: 170px;
  }

  .notif-badge {
    min-width: 18px;
    padding: 0 5px;
    background: var(--danger);
    color: var(--on-color);
    border-radius: var(--radius-pills);
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }
</style>
