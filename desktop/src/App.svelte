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
  import DesktopBall from './components/DesktopBall.svelte';
  import { stepBallPhysics, kickBall, type BallState } from './lib/toys/toyPhysics';
  import { LOCAL_ACTIONS, ReactionDeduper, reactionForAction } from './lib/animation/eventMap';
  import { isPetActionEvent, type PetAction } from './lib/animation/petActions';
  import ControlPanel from './components/ControlPanel.svelte';
  import FileDropModal from './components/FileDropModal.svelte';
  import type { AnalyzedFile } from './lib/fileAnalyzer';
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
  let droppedFile: AnalyzedFile | null = null;
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

  // Pelotita de juego interactiva en pantalla
  let showBall = false;
  let ballState: BallState = {
    x: 350,
    y: 120,
    vx: 0,
    vy: 0,
    radius: 16,
    isRolling: false,
    bounces: 0,
  };
  let ballRaf: number | null = null;
  let lastBallTime = performance.now();

  function runBallLoop(now: number) {
    if (!showBall) {
      ballRaf = null;
      return;
    }
    const dt = Math.min(0.04, (now - lastBallTime) / 1000);
    lastBallTime = now;
    const bounds = {
      width: window.innerWidth || 800,
      height: window.innerHeight || 600,
    };
    ballState = stepBallPhysics(ballState, bounds, dt);
    ballRaf = requestAnimationFrame(runBallLoop);
  }

  function toggleBall() {
    showBall = !showBall;
    if (showBall) {
      ballState = {
        x: Math.min(window.innerWidth - 80, Math.max(80, (window.innerWidth || 800) / 2)),
        y: 120,
        vx: (Math.random() - 0.5) * 220,
        vy: -180,
        radius: 16,
        isRolling: true,
        bounces: 0,
      };
      lastBallTime = performance.now();
      if (!ballRaf) ballRaf = requestAnimationFrame(runBallLoop);
      showBubble('¡Una pelotita! ⚽ ¡Lánzamela con el ratón!');
    } else {
      if (ballRaf) cancelAnimationFrame(ballRaf);
      ballRaf = null;
    }
  }

  function handleBallKick(vx: number, vy: number) {
    ballState = kickBall(ballState, vx, vy);
    if (!ballRaf && showBall) {
      lastBallTime = performance.now();
      ballRaf = requestAnimationFrame(runBallLoop);
    }
  }
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
        // Qué le acaba de pasar a la mascota (comer, subir de nivel, ganar…) → animación
        socket.on('pet:action', (ev: unknown) => {
          if (!isPetActionEvent(ev) || !currentPet) return;
          if (ev.petId && ev.petId !== currentPet.id) return;
          reactToAction(currentPet.id, ev.action, ev.context);
        });
        // Otro jugador ha retado a tu mascota en la arena (pelea asíncrona)
        socket.on('battle:defended', (b: any) => {
          // Resultado desde el punto de vista de la mascota defensora (la del usuario)
          const outcome = b.draw ? 'empató' : b.won ? 'ganó' : 'perdió';
          const delta = b.eloDelta ? ` (${b.eloDelta > 0 ? '+' : ''}${b.eloDelta} ELO)` : '';
          const text = `${b.attackerName} retó a ${b.defenderPetName}: tu mascota ${outcome}${delta}`;
          // La animación y el bocadillo llegan con `pet:action` (battle_defended)
          notifyNow('Te han retado en la arena', text);
        });

        // Bienvenida: si el jugador vuelve tras una ausencia, el backend emite `pet:action
        // welcome_back`. Se pide una vez por sesión, con el socket ya conectado para recibirlo.
        if (socket.connected) checkWelcomeBack();
        else socket.once('connect', checkWelcomeBack);

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

  let welcomeChecked = false;

  /**
   * Comprueba la bienvenida una sola vez por sesión. El diario se pide antes que el estado,
   * porque `status` refresca `lastLoginAt` y después la ausencia ya no se podría medir.
   * El servidor mete el socket en la sala del usuario de forma asíncrona tras `connect`;
   * la breve espera evita que `welcome_back` se emita antes de que el socket esté en la sala.
   */
  function checkWelcomeBack() {
    if (welcomeChecked) return;
    welcomeChecked = true;
    setTimeout(async () => {
      try {
        const diary = await api.getReengagementDiary().catch(() => null);
        const status = await api.getReengagementStatus();
        if (!status.active) return;
        const lines = (diary?.entries ?? []).map((e) => `${e.icon} ${e.text}`);
        const body = [status.plan?.message, ...lines].filter(Boolean).join('\n');
        if (body) notifyNow(`${status.nickname} te ha echado de menos`, body);
      } catch (err) {
        console.warn('No se pudo comprobar la bienvenida:', err);
      }
    }, 1000);
  }

  // Una misma acción puede llegar dos veces (UI local + `pet:action` del backend): se anima una
  const reactionDeduper = new ReactionDeduper(1500);

  function reactToAction(petId: string, action: PetAction, context?: Record<string, unknown>) {
    if (!reactionDeduper.shouldPlay(petId, action)) return;
    const reaction = reactionForAction({ action, context });
    if (!reaction) return;
    petViewRef?.react?.(reaction);
    if (reaction.bubble) showBubble(reaction.bubble);
  }

  /** Acción disparada desde el panel (comer, bañar, despertar, minijuego, eclosión). */
  function handlePetAction(local: string) {
    const action = LOCAL_ACTIONS[local];
    if (action && currentPet) {
      reactToAction(currentPet.id, action);
    } else {
      petViewRef?.play?.(local);
    }
  }

  function clearSessionState() {
    closeSocket();
    welcomeChecked = false;
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

  function handleFileDropped(e: Event) {
    const ce = e as CustomEvent<AnalyzedFile>;
    droppedFile = ce.detail;
  }

  async function handleMoveToHabitat(e: Event) {
    const ce = e as CustomEvent<{ petId: string }>;
    const petId = ce.detail?.petId;
    if (!currentPet || currentPet.id !== petId) return;
    try {
      const updated = await api.setPetInHabitat(petId, true);
      currentPet = updated;
      const idx = pets.findIndex((p) => p.id === petId);
      if (idx !== -1) pets[idx] = updated;
      showBubble('¡A descansar a mi casita!');
    } catch (err: any) {
      console.error('Error enviando al hábitat:', err);
    }
  }

  async function handleViewportDrop(e: DragEvent) {
    const data = e.dataTransfer?.getData('application/petai-pet');
    if (data === 'exit-habitat' && currentPet && currentPet.inHabitat) {
      try {
        const updated = await api.setPetInHabitat(currentPet.id, false);
        currentPet = updated;
        const idx = pets.findIndex((p) => p.id === currentPet.id);
        if (idx !== -1) pets[idx] = updated;
        showBubble('¡De vuelta a explorar el escritorio!');
      } catch (err: any) {
        console.error('Error sacando del hábitat:', err);
      }
    }
  }

  onMount(() => {
    window.addEventListener('petai:file_dropped', handleFileDropped);
    window.addEventListener('petai:move_to_habitat', handleMoveToHabitat);
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
    if (ballRaf) cancelAnimationFrame(ballRaf);
    window.removeEventListener('petai:file_dropped', handleFileDropped);
    window.removeEventListener('petai:move_to_habitat', handleMoveToHabitat);
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

<main
  class="app-viewport"
  on:dragover|preventDefault
  on:drop={handleViewportDrop}
>
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

  <!-- Pelotita interactiva de escritorio -->
  <button
    class="btn glass ball-toggle-pill"
    on:click={toggleBall}
    title={showBall ? 'Guardar pelota de juego' : 'Sacar pelota de juego'}
  >
    <span>⚽</span>
  </button>

  {#if showBall}
    <DesktopBall
      ball={ballState}
      on:throw={(e) => handleBallKick(e.detail.vx, e.detail.vy)}
      on:kick={(e) => handleBallKick(e.detail.vx, e.detail.vy)}
    />
  {/if}

  <!-- Mascota Interactiva Flotante (oculta si está en su Hábitat/casa) -->
  {#if currentPet && !currentPet.inHabitat}
    <PetView
      bind:this={petViewRef}
      pet={currentPet}
      bubble={bubbleText}
      environmental={environmental}
      ball={showBall ? ballState : null}
      onBallKick={handleBallKick}
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

  {#if droppedFile}
    <FileDropModal
      file={droppedFile}
      on:close={() => (droppedFile = null)}
      on:sendPrompt={(e) => {
        const { prompt, file } = e.detail;
        droppedFile = null;
        panelRequest = { dest: 'chat', sub: '', n: ++requestN };
        isPanelOpen = true;
        showBubble(`Examinando ${file.name} con la IA...`);
      }}
    />
  {/if}
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
  .notif-toggle-pill,
  .ball-toggle-pill {
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
  .ball-toggle-pill {
    right: 228px;
    font-size: 14px;
    padding: 0 10px;
    min-width: 40px;
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
