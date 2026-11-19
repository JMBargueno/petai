<script lang="ts">
  import { Button } from './components/ui';
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, getAccessToken, onEmailUnverified, onHandleRequired, onSessionExpired } from './lib/api';
  import { initSocket, closeSocket } from './lib/socket';
  import { startClickThrough } from './lib/clickthrough';
  import { EXIT_HABITAT_EVENT, type ExitHabitatDetail } from './lib/habitatExitDrag';
  import { initSummonShortcut } from './lib/summonShortcut';
  import { setActiveSkillsPet } from './lib/stores/desktopSkillsStore';
  import { notifyPetNeeds, notifyNow } from './lib/notifications';
  import { speak, clearSpeech, MAX_AI_CHUNKS, type SpeakOptions } from './lib/speech-queue';
  import {
    fetchStatus,
    startHeartbeat,
    requestOptInCoordinates,
    saveCoordinates,
    environmentalStatus,
    STATUS_REFRESH_MS,
    type EnvironmentalStatus,
    type EnvironmentalChangedEvent,
  } from './lib/environmental';
  import PetView from './components/PetView.svelte';
  import DesktopBall from './components/DesktopBall.svelte';
  import {
    advanceBallPhysics,
    kickBall,
    throwBall,
    BALL_MAX_THROW_SPEED,
    type BallState,
  } from './lib/toys/toyPhysics';
  import {
    LOCAL_ACTIONS,
    ReactionDeduper,
    reactionForAction,
    reactionForBehavior,
    reactionForClanGoal,
    reactionForSiblingHatch,
  } from './lib/animation/eventMap';
  import { isPetActionEvent, type PetAction } from './lib/animation/petActions';
  import ControlPanel from './components/ControlPanel.svelte';
  import HabitatWidget from './components/HabitatWidget.svelte';
  import EtherObjectLayer from './components/EtherObjectLayer.svelte';
  import { habitatMode } from './lib/habitatMode';
  import FileDropModal from './components/FileDropModal.svelte';
  import AchievementToast from './features/achievements/AchievementToast.svelte';
  import RewardToast from './features/rewards/RewardToast.svelte';
  import { celebrateReward, rewardToCelebrate } from './lib/rewards';
  import type { RewardReceived } from './lib/api';
  import type { AchievementUnlockedPayload } from './features/achievements/achievements.api';
  import type { AnalyzedFile } from './lib/fileAnalyzer';
  import { PawPrint, Bell, X, Volleyball } from 'lucide-svelte';
  import { initNotificationHandler, stopNotificationHandler } from './lib/notification-handler';
  import { unreadCount } from './lib/notification-inbox';
  import { clearVisitors, sceneReceived, setVisitors, visitorJoined, visitorLeft, visitorsStore } from './lib/visitors';
  import { clearVisitorTalk, visitorInteracted, type VisitorInteractionEvent } from './lib/visitDialog';
  import { pushClanMessage, upsertClanGoal, dropClanMessage, bumpClanRoster, emitClanHabitatEvent } from './lib/clan-store';
  import type { HabitatVisitor, HabitatSceneEvent, ClanMessage, ClanGoal, ClanXpEvent } from './lib/api';
  import { loadActivePetId, pickActivePet, saveActivePetId } from './lib/activePet';
  import { updateState, updateLock, startAutoCheck, checkForUpdates } from './lib/updater';
  import { maintenanceLock } from './lib/maintenance';
  import { startContextDigest } from './lib/contextDigest';
  import { activeVisit } from './lib/activeVisit';
  import { configureTravel, endTravel, resetTravel, restoreFromHistory } from './lib/visitTravel';
  import { getSoundEngine, setPanelOpen } from './lib/audio';
  import { installUiSounds } from './lib/uiSounds';

  // Visita en vivo: el servidor la cierra a los 15 min sin avisar al visitante. A esa hora el
  // Pockai vuelve por su portal y se cierra también aquí (si ya estaba cerrada, el error no importa).
  configureTravel({
    onExpire: () => {
      api.endHabitatVisit().catch(() => {});
      activeVisit.set('');
      endTravel();
    },
  });

  let user: any = null;
  let pets: any[] = [];
  let currentPet: any = null;
  let eggs: any[] = [];
  let inventory: any[] = [];
  let shopItems: any[] = [];
  let isPanelOpen = true;
  let droppedFile: AnalyzedFile | null = null;
  /** Último logro desbloqueado (aviso con la insignia). */
  let unlockedAchievement: AchievementUnlockedPayload | null = null;
  // Petición de navegación al panel (la campana abre Ajustes › Avisos)
  let panelRequest: { dest: string; sub: string; n: number; prompt?: string } | null = null;
  let requestN = 0;
  /** Cambia la mascota activa (la que pasea por el escritorio) y lo recuerda en este equipo. */
  function selectPet(id: string) {
    const next = pets.find((p) => p.id === id);
    if (!next || next.id === currentPet?.id) return;
    currentPet = next;
    saveActivePetId(next.id);
  }

  /**
   * El servidor también guarda cuál es la mascota activa (la que te representa en el hábitat del
   * clan y en las visitas). Se sincroniza cada vez que cambia, sin bloquear ni avisar si falla.
   * Solo si es una elección guardada en este equipo: uno recién instalado (sin elección) mostraría
   * la primera mascota y pisaría la que el jugador eligió en otro.
   */
  // Las habilidades de escritorio son de cada mascota: se cargan al cambiar la activa (no al
  // refrescarse sus datos, que pisaría un cambio hecho aquí que el servidor aún no ha guardado).
  let skillsPetId: string | null = null;
  $: if ((currentPet?.id ?? null) !== skillsPetId) {
    skillsPetId = currentPet?.id ?? null;
    setActiveSkillsPet(skillsPetId, currentPet?.desktopSkills);
  }

  let syncedActivePetId: string | null = null;
  $: if (user && currentPet?.id && currentPet.id !== syncedActivePetId && currentPet.id === loadActivePetId()) {
    const id = currentPet.id;
    syncedActivePetId = id;
    api.activatePet(id).catch(() => {
      if (syncedActivePetId === id) syncedActivePetId = null; // se reintenta en el próximo cambio
    });
  }
  $: if (!user) syncedActivePetId = null;

  function openNotifications() {
    panelRequest = { dest: 'settings', sub: 'notifications', n: ++requestN };
    isPanelOpen = true;
  }
  function openAbout() {
    panelRequest = { dest: 'settings', sub: 'about', n: ++requestN };
    isPanelOpen = true;
  }

  // Actualización obligatoria: se bloquea el panel (muestra solo el aviso) y se oculta la mascota
  // y los controles flotantes hasta que se instale. Aviso nativo una sola vez por versión.
  $: updateLocked = $updateLock !== null;
  // Mantenimiento del servidor: mismo bloqueo (panel con el aviso, sin mascota).
  $: maintenanceLocked = $maintenanceLock !== null;
  $: locked = updateLocked || maintenanceLocked;
  $: if (locked) isPanelOpen = true;

  // Modo hábitat (lib/habitatMode): solo la sala, grande, en el escritorio; sin panel ni dock.
  $: showHabitatWidget = $habitatMode.on && !!user && !!currentPet && !locked;
  let habitatWidgetShown = false;
  $: onHabitatWidget(showHabitatWidget);
  function onHabitatWidget(on: boolean) {
    if (on === habitatWidgetShown) return;
    habitatWidgetShown = on;
    if (!on) return;
    isPanelOpen = false;
    // Si estaba paseando por el escritorio, entra en casa (por el altar, como con «Llevar a casa»)
    if (currentPet && !currentPet.inHabitat) void sendPetHome(currentPet.id);
  }
  async function sendPetHome(petId: string) {
    try {
      const updated = await api.setPetInHabitat(petId, true);
      if (currentPet?.id !== petId) return;
      currentPet = updated;
      const idx = pets.findIndex((p) => p.id === petId);
      if (idx !== -1) pets[idx] = updated;
    } catch (err: any) {
      console.error('Error llevando a casa al entrar en el modo hábitat:', err);
    }
  }
  // Cualquier cosa que abra el panel (clic en la mascota, avisos, atajo…) sale del modo
  let panelWasOpen = isPanelOpen;
  $: onPanelOpen(isPanelOpen);
  function onPanelOpen(open: boolean) {
    if (open && !panelWasOpen && habitatWidgetShown) habitatMode.exit();
    panelWasOpen = open;
  }
  function exitHabitatMode() {
    habitatMode.exit();
    isPanelOpen = true;
  }
  // Sonido: con el panel cerrado la mascota «vive en el escritorio» (lib/audio.ts).
  $: setPanelOpen(isPanelOpen);
  // Al terminar el mantenimiento se recarga: sesión, socket y datos vuelven a empezar limpios.
  let wasInMaintenance = false;
  $: {
    if (wasInMaintenance && !maintenanceLocked) window.location.reload();
    wasInMaintenance = maintenanceLocked;
  }
  let announcedVersion = '';
  $: if ($updateLock !== null && $updateLock !== announcedVersion) {
    announcedVersion = $updateLock;
    notifyNow(
      'Nueva versión de Pockai',
      `Actualiza Pockai a la versión ${announcedVersion} desde el panel para seguir jugando.`,
      { key: 'update-available' },
    );
  }

  /** Comprobación pedida desde la bandeja: la mascota cuenta el resultado. */
  async function checkUpdatesFromTray() {
    openAbout();
    await checkForUpdates();
    const s = $updateState;
    if (s.status === 'upToDate') showBubble('¡Ya estoy en la última versión!');
    else if (s.status === 'error') showBubble(s.message);
  }

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
  let ballAccumulator = 0;
  // Mientras se sujeta con el ratón la pelota no simula (ni cae ni acumula velocidad)
  let ballGrabbed = false;

  function runBallLoop(now: number) {
    if (!showBall) {
      ballRaf = null;
      return;
    }
    const frameDt = (now - lastBallTime) / 1000;
    lastBallTime = now;
    if (!ballGrabbed) {
      const bounds = {
        width: window.innerWidth || 800,
        height: window.innerHeight || 600,
      };
      const r = advanceBallPhysics(ballState, bounds, frameDt, {}, ballAccumulator);
      ballAccumulator = r.accumulator;
      if (r.ball !== ballState) ballState = r.ball;
    }
    ballRaf = requestAnimationFrame(runBallLoop);
  }

  function ensureBallLoop() {
    if (!ballRaf && showBall) {
      lastBallTime = performance.now();
      ballAccumulator = 0;
      ballRaf = requestAnimationFrame(runBallLoop);
    }
  }

  function handleBallGrab() {
    ballGrabbed = true;
    ballState = { ...ballState, vx: 0, vy: 0, isRolling: false };
  }

  function handleBallDrag(x: number, y: number) {
    const size = ballState.radius * 2;
    ballState = {
      ...ballState,
      x: Math.min(Math.max(0, x), (window.innerWidth || 800) - size),
      y: Math.min(Math.max(0, y), (window.innerHeight || 600) - size),
    };
  }

  /** Soltar tras arrastrar: la velocidad del gesto sustituye a la que tuviera. */
  function handleBallThrow(vx: number, vy: number) {
    ballGrabbed = false;
    ballState = throwBall(ballState, vx, vy, BALL_MAX_THROW_SPEED);
    ballAccumulator = 0;
    lastBallTime = performance.now();
    ensureBallLoop();
  }

  /** Golpe de la mascota: la colisión ya calcula la velocidad resultante. */
  function handleBallHit(vx: number, vy: number) {
    if (ballGrabbed) return;
    ballState = throwBall(ballState, vx, vy);
    ensureBallLoop();
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
      ballGrabbed = false;
      ensureBallLoop();
      showBubble('¡Una pelotita! ⚽ ¡Lánzamela con el ratón!');
    } else {
      if (ballRaf) cancelAnimationFrame(ballRaf);
      ballRaf = null;
    }
  }

  /** Clic simple sobre la pelota: impulso que se suma a su velocidad. */
  function handleBallKick(vx: number, vy: number) {
    ballState = kickBall(ballState, vx, vy);
    ensureBallLoop();
  }
  // Estado ambiental (feature 005): hora del día, clima, actividad y festividad del usuario.
  let environmental: EnvironmentalStatus | null = null;
  let stopHeartbeat: () => void = () => {};
  let stopEnvRefresh: () => void = () => {};
  // Las salas del hábitat leen el clima y el sol de este store.
  $: environmentalStatus.set(environmental);
  let stopContextDigest: () => void = () => {};

  /** Única vía de habla: todo lo que dice la mascota pasa por la cola de `speech-queue`. */
  function showBubble(text: string, opts?: SpeakOptions) {
    speak(text, opts);
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
        // Cuenta sin verificar: solo se muestra la pantalla de verificación del panel (sin mascota,
        // socket ni datos de juego: la API los rechaza con 403 hasta verificar el correo).
        if (user?.emailVerified === false) {
          isPanelOpen = true;
          return;
        }
        // Cuenta sin nickname (anterior a él o creada desde una app antigua): primero se elige.
        if (user && user.handle === null) {
          isPanelOpen = true;
          return;
        }
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
        currentPet = pickActivePet(pets, loadActivePetId());
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
          // La animación y el bocadillo llegan con `pet:action` (battle_defended): solo nativa si está oculta
          notifyNow('Te han retado en la arena', text, { speech: false });
        });

        // Amigos de visita en el hábitat (feature 021): su mascota se dibuja junto a la mía.
        socket.on('habitat:visitor_joined', (v: HabitatVisitor | null) => {
          if (!v?.visitorId) return;
          visitorJoined(v);
          // Reacción reutilizando la acción del backend `friend_visit` (ya existe en eventMap)
          if (currentPet) reactToAction(currentPet.id, 'friend_visit', { visitorName: v.visitorName });
        });
        socket.on('habitat:visitor_left', (ev: { visitorId?: string } | null) => {
          if (ev?.visitorId) {
            visitorLeft(ev.visitorId);
            clearVisitorTalk(ev.visitorId);
          }
        });
        // Lo que el visitante hace con tu Pockai (saludarle, traerle un premio…) y cómo responde
        socket.on('habitat:visitor_interaction', (ev: VisitorInteractionEvent | null) => visitorInteracted(ev));
        // Qué hacen tu Pockai y el visitante: lo decide el servidor y se representa en la sala
        socket.on('habitat:scene', (ev: HabitatSceneEvent | null) => sceneReceived(ev));
        // Estado inicial: quién visita ahora mismo (por si la app arrancó con visitas en curso)
        api.getHabitatVisitors()
          .then((r) => setVisitors(r?.visitors ?? []))
          .catch(() => {/* sin conexión o endpoint aún no disponible: se reintenta con los eventos */});
        // ¿Arrancó con mi Pockai de visita? Sigue fuera (sin portal) hasta que vuelva.
        api.getCoopHistory()
          .then((h) => restoreFromHistory(h?.visits ?? []))
          .catch(() => {/* sin historial: la pestaña de Visitas lo recupera al abrirla */});

        // Chat y objetivos de clan (feature 021): se reflejan en vivo en la pestaña de clanes.
        socket.on('clan:message', (m: ClanMessage | null) => {
          if (m?.id && m?.clanId) pushClanMessage(m);
        });
        socket.on('clan:goal_progress', (g: ClanGoal | null) => {
          if (g?.id && g?.clanId) upsertClanGoal(g);
        });
        socket.on('clan:goal_completed', (g: ClanGoal | null) => {
          if (!g?.id || !g?.clanId) return;
          upsertClanGoal(g);
          emitClanHabitatEvent({ kind: 'goal', clanId: g.clanId, title: g.title });
          // La trenza del Juramento se tensa sobre la mascota (si está en el escritorio)
          celebrateClanGoal(g.title);
          notifyNow('Objetivo de clan cumplido', `«${g.title}» llegó a ${g.progress}/${g.target}.`, {
            speech: `¡Objetivo de clan cumplido! «${g.title}» llegó a ${g.progress}/${g.target}. 🎉`,
          });
        });
        // Rangos del Nexo: borrados en el chat y cambios de roster (la pestaña recarga el clan).
        socket.on('clan:message_deleted', (ev: { id?: string } | null) => {
          if (ev?.id) dropClanMessage(ev.id);
        });
        // Hábitat del Nexo: la XP del clan sube (y a veces el escenario cambia de nivel).
        socket.on('clan:xp', (ev: ClanXpEvent | null) => {
          if (ev?.clanId && typeof ev.xp === 'number') emitClanHabitatEvent({ kind: 'xp', ...ev });
        });
        socket.on('clan:role_changed', () => bumpClanRoster());
        socket.on('clan:member_kicked', () => bumpClanRoster());
        socket.on('clan:disbanded', () => bumpClanRoster());

        // Bienvenida: si el jugador vuelve tras una ausencia, el backend emite `pet:action
        // welcome_back`. Se pide una vez por sesión, con el socket ya conectado para recibirlo.
        if (socket.connected) checkWelcomeBack();
        else socket.once('connect', checkWelcomeBack);

        // Feature ambiental: hora del día, clima, inactividad y festividades
        socket.on('environmental:changed', (ev: EnvironmentalChangedEvent) => handleEnvironmentalChanged(ev));

        // Logro desbloqueado → aviso con la insignia (la recompensa ya está acreditada: refresca saldo).
        socket.on('achievement:unlocked', (p: AchievementUnlockedPayload | null) => {
          if (!p) return;
          unlockedAchievement = p;
          api.getMe().then((u) => (user = u)).catch(() => {});
        });

        // Recompensa recibida (voucher canjeado o regalo del equipo): la mascota ya lo celebra con
        // `pet:action gift_received`; aquí el desglose y el saldo al día. Se deduplica por redemptionId.
        socket.on('reward:received', (p: RewardReceived | null) => {
          if (!p) return;
          celebrateReward(p);
          api.getMe().then((u) => (user = u)).catch(() => {});
        });

        // Aviso en tiempo real de nueva versión disponible
        socket.on('desktop:update_available', () => {
          checkForUpdates();
        });

        setupCoordinates(); // geolocalización opt-in → clima real
        loadEnvironmental(); // estado inicial
        stopHeartbeat = startHeartbeat(); // heartbeat cada 60 s
        // El clima cambia a lo largo del día: sin este refresco solo se leía al arrancar.
        stopEnvRefresh();
        const envTimer = setInterval(loadEnvironmental, STATUS_REFRESH_MS);
        stopEnvRefresh = () => clearInterval(envTimer);
        stopContextDigest();
        // Hábitos de escritorio: contador local y resumen diario al servidor (lib/contextDigest.ts)
        stopContextDigest = startContextDigest(() => currentPet?.id ?? null, api.sendContextDigest);
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

  /** Reacción del Pockai al terminar un turno de chat (`behavior` del evento `done`, spec 36). */
  function reactToBehavior(behavior: unknown) {
    const reaction = reactionForBehavior(behavior);
    if (reaction) petViewRef?.react?.(reaction);
  }

  /**
   * Eclosión desde el panel. La recién nacida se añade a la colección y solo pasa a ser la activa si
   * no había ninguna: entonces es ella la que nace en el escritorio (revelación a sus pies). Si no,
   * la mascota activa lo presencia y la revelación se alza a su lado, en el Flujo de la recién nacida.
   * (Antes la animación de nacer la hacía la activa, como si fuera ella la nueva.)
   */
  async function celebrateHatch(newborn: any) {
    if (!newborn?.id) return;
    pets = [...pets.filter((p) => p.id !== newborn.id), newborn];
    if (!currentPet) {
      selectPet(newborn.id);
      await tick();
      reactToAction(newborn.id, 'hatched', {
        rarity: newborn.rarity,
        shiny: newborn.shiny,
        ...(newborn.pityGuarantee ? { pity: newborn.pityGuarantee } : {}),
      });
      return;
    }
    if (!reactionDeduper.shouldPlay(newborn.id, 'hatched')) return;
    const reaction = reactionForSiblingHatch(newborn);
    petViewRef?.react?.(reaction);
    if (reaction.bubble) showBubble(reaction.bubble);
  }

  function celebrateClanGoal(title?: string | null) {
    const reaction = reactionForClanGoal(title);
    petViewRef?.react?.(reaction);
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
    stopEnvRefresh();
    stopContextDigest();
    user = null;
    currentPet = null;
    pets = [];
    eggs = [];
    inventory = [];
    environmental = null;
    clearVisitors();
    clearSpeech();
    activeVisit.set('');
    resetTravel();
    petEntrance = null;
    homeAnim = false;
    lastHabitat = null;
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
  let stopEmailUnverified: () => void = () => {};

  /** La API dice que el correo no está verificado: se para el juego y se pide la verificación. */
  function lockUnverified() {
    const current = user;
    if (current?.emailVerified === false) return;
    clearSessionState();
    user = current ? { ...current, emailVerified: false } : null;
    isPanelOpen = true;
  }

  let stopHandleRequired: () => void = () => {};

  /** La API exige nickname (403 HANDLE_REQUIRED): se para el juego y se muestra "Elige tu nickname". */
  function lockNoHandle() {
    const current = user;
    if (current && current.handle === null) return;
    clearSessionState();
    user = current ? { ...current, handle: null } : null;
    isPanelOpen = true;
  }
  let stopAutoUpdate: () => void = () => {};
  let stopTrayUpdates: () => void = () => {};
  let stopSummonShortcut: () => void = () => {};
  let needsPoll: any = null;

  // Las constantes vitales solo se recalculan al consultar al servidor (tick perezoso):
  // se consulta cada minuto para poder avisar cuando la mascota necesita atención.
  // Recordatorios creados por la mascota (con confirmación): al vencer se avisa y se marcan entregados
  async function checkReminders() {
    if (!getAccessToken()) return;
    try {
      const due = await api.getDueReminders();
      for (const r of due) {
        await notifyNow('Recordatorio', r.text, { speech: `⏰ ${r.text}`, priority: 'high' });
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
      // Ya se ha metido en el panel arrastrándola: no hace falta además el altar
      skipAltarOnce = true;
      const updated = await api.setPetInHabitat(petId, true);
      currentPet = updated;
      const idx = pets.findIndex((p) => p.id === petId);
      if (idx !== -1) pets[idx] = updated;
      showBubble('¡A descansar a mi casita!');
    } catch (err: any) {
      skipAltarOnce = false;
      console.error('Error enviando al hábitat:', err);
    }
  }

  // ---------- Altar del Santuario (skill pockai-effect-architect) ----------
  /** PetView sigue montada mientras entra en casa por el altar (botón «A casa» del panel). */
  let homeAnim = false;
  /** Al salir de casa, PetView aparece por el altar. */
  let petEntrance: 'altar' | null = null;
  /** El arrastre al panel ya tiene su animación: esa entrada no usa el altar. */
  let skipAltarOnce = false;
  let lastHabitat: { id: string; inHabitat: boolean } | null = null;
  $: watchHabitat(currentPet?.id ?? null, !!currentPet?.inHabitat);
  function watchHabitat(id: string | null, inHabitat: boolean) {
    const prev = lastHabitat;
    lastHabitat = id ? { id, inHabitat } : null;
    // Primera carga o cambio de mascota: sin altar
    if (!prev || !id || prev.id !== id) {
      petEntrance = null;
      return;
    }
    if (prev.inHabitat === inHabitat) return;
    if (inHabitat) {
      petEntrance = null;
      if (skipAltarOnce) {
        skipAltarOnce = false;
        return;
      }
      homeAnim = true;
      void tick().then(async () => {
        try {
          await petViewRef?.enterAltar?.();
          // La sacaron otra vez mientras entraba: sigue montada, así que sale por el altar ahora
          if (currentPet && !currentPet.inHabitat) petViewRef?.emergeFromAltar?.();
        } finally {
          homeAnim = false;
        }
      });
    } else {
      // PetView solo la lee al montarse: después se olvida (si no, cualquier montaje posterior,
      // como volver a entrar en sesión, saldría también del altar)
      petEntrance = 'altar';
      void tick().then(() => (petEntrance = null));
    }
  }

  // Punto donde se soltó al sacarlo del Hábitat: PetView aparece ahí al montarse
  let petSpawnAt: { x: number; y: number } | null = null;
  // Al volver a casa (por cualquier vía) se olvida: la próxima salida con «Sacar» usa la posición por defecto
  $: if (currentPet?.inHabitat === true) petSpawnAt = null;

  async function handleExitHabitat(e: Event) {
    const ce = e as CustomEvent<ExitHabitatDetail>;
    if (currentPet && currentPet.inHabitat) {
      try {
        petSpawnAt = ce.detail ?? null;
        const updated = await api.setPetInHabitat(currentPet.id, false);
        currentPet = updated;
        const idx = pets.findIndex((p) => p.id === currentPet.id);
        if (idx !== -1) pets[idx] = updated;
        showBubble('¡De vuelta a explorar el escritorio!');
      } catch (err: any) {
        petSpawnAt = null;
        console.error('Error sacando del hábitat:', err);
      }
    }
  }

  onMount(() => {
    getSoundEngine();
    installUiSounds();
    // Solo en desarrollo (y en la demo): lanzar momentos a mano para probar los efectos del
    // escritorio sin backend (skill pockai-effect-architect, integration-checklist.md).
    if (import.meta.env.DEV) {
      (window as any).__pockaiFx = {
        react: (action: PetAction, context?: Record<string, unknown>) => currentPet && reactToAction(currentPet.id, action, context),
        // Como el backend: primero el aviso `evolved` y, un instante después, la etapa nueva
        evolve: (stage: string) => {
          if (!currentPet) return;
          reactToAction(currentPet.id, 'evolved', { stage });
          setTimeout(() => currentPet && (currentPet = { ...currentPet, stage }), 50);
        },
        // Eclosión de otra de la colección: rareza, shiny y garantía de la Promesa del Telar
        hatch: (rarity = 'legendary', shiny = false, pity: string | null = null) => {
          const newborn = {
            id: 'demo-' + Date.now(),
            nickname: 'Brote',
            rarity,
            shiny,
            pityGuarantee: pity,
            species: { id: 'axolunar', name: 'Axolunar', element: 'water' },
          };
          void celebrateHatch(newborn);
        },
        // Entrar en casa y salir como con el botón del panel (con el altar)
        home: (inHabitat: boolean) => currentPet && (currentPet = { ...currentPet, inHabitat }),
        achievement: (tier = 'legendary') => currentPet && reactToAction(currentPet.id, 'achievement', { name: 'Demostración', tier }),
        battle: (outcome: 'won' | 'lost' | 'draw' = 'won') =>
          currentPet && reactToAction(currentPet.id, 'battle_defended', { won: outcome === 'won', draw: outcome === 'draw', attackerName: 'Rival' }),
        clanGoal: () => celebrateClanGoal('Visitas de la semana'),
        agent: (tool = 'open_url') => petViewRef?.playMinor?.('manitas-espirituales', { tool }),
        intelligence: (n: number) => currentPet && (currentPet = { ...currentPet, intelligence: n }),
        // Cualquier campo de la mascota activa (p. ej. { shiny: true } para ver el destello del Prisma)
        patchPet: (p: Record<string, unknown>) => currentPet && (currentPet = { ...currentPet, ...p }),
        weather: (condition: string) =>
          (environmental = { ...(environmental ?? {}), weather: { condition, temperature: 12, weatherCode: 0 } } as any),
        gift: (kind: 'gift' | 'care' = 'gift') => currentPet && reactToAction(currentPet.id, kind === 'gift' ? 'gift_received' : 'care_received'),
        // Eclosión vista en el escritorio: el huevo tiembla, se agrieta con el Flujo de quien nace y estalla
        eggHatch: (element = 'water') => {
          petViewRef?.hatchEgg?.('shake');
          setTimeout(() => petViewRef?.hatchEgg?.('crack', { species: { element } }), 1500);
        },
        dailyMissions: () => currentPet && reactToAction(currentPet.id, 'mission_completed', { dailyCompleted: true }),
        chest: (type = 'mythic', bestTier = 'legendary') => currentPet && reactToAction(currentPet.id, 'chest_opened', { type, bestTier }),
        ritual: () => currentPet && reactToAction(currentPet.id, 'ritual_completed', { type: 'feed' }),
        raidVictory: (element = 'fire') =>
          currentPet && reactToAction(currentPet.id, 'raid_victory', { theme: 'Inferno Dragon', element, gems: 120 }),
        visitorJoin: (v: HabitatVisitor) => visitorJoined(v),
        visitorLeave: (visitorId: string) => visitorLeft(visitorId),
        summon: (x?: number, y?: number) => window.dispatchEvent(new CustomEvent('petai:summon', { detail: { x, y } })),
      };
    }
    window.addEventListener('petai:file_dropped', handleFileDropped);
    window.addEventListener('petai:move_to_habitat', handleMoveToHabitat);
    window.addEventListener(EXIT_HABITAT_EVENT, handleExitHabitat);
    stopClickThrough = startClickThrough();
    // Refresh token rechazado (caducado o revocado): vuelta a la pantalla de acceso
    stopSessionExpired = onSessionExpired(() => {
      clearSessionState();
      isPanelOpen = true;
    });
    stopEmailUnverified = onEmailUnverified(lockUnverified);
    stopHandleRequired = onHandleRequired(lockNoHandle);
    needsPoll = setInterval(pollPet, 60_000);
    loadInitialData();
    stopAutoUpdate = startAutoCheck();
    // Atajo global de «Invocación rápida» (configurable desde Habilidades)
    stopSummonShortcut = initSummonShortcut();
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
    window.removeEventListener(EXIT_HABITAT_EVENT, handleExitHabitat);
    clearInterval(needsPoll);
    clearSpeech();
    stopHeartbeat();
    stopEnvRefresh();
    stopClickThrough();
    stopSessionExpired();
    stopEmailUnverified();
    stopHandleRequired();
    stopAutoUpdate();
    stopTrayUpdates();
    stopSummonShortcut();
    stopNotificationHandler();
    closeSocket();
  });
</script>

<main
  class="app-viewport"
  on:dragover|preventDefault
>
  {#if !locked}
  {#if !showHabitatWidget}
  <div class="dock">
  <!-- Pelotita interactiva de escritorio -->
  <button
    class="btn glass btn--icon"
    on:click={toggleBall}
    title={showBall ? 'Guardar la pelota' : 'Sacar la pelota'}
    aria-label={showBall ? 'Guardar la pelota' : 'Sacar la pelota'}
    aria-pressed={showBall}
  >
    <Volleyball size={16} />
  </button>

  <!-- Avisos de la mascota (feature 007 / US3) con badge de no leídas -->
  <button
    class="btn glass"
    class:btn--icon={$unreadCount === 0}
    on:click={openNotifications}
    title="Avisos"
    aria-label={$unreadCount > 0 ? `Avisos: ${$unreadCount} sin leer` : 'Avisos'}
  >
    <Bell size={16} />
    {#if $unreadCount > 0}<span class="notif-badge">{$unreadCount}</span>{/if}
  </button>

  <!-- Botón flotante para alternar panel de control -->
  <Button class="glass" on:click={() => (isPanelOpen = !isPanelOpen)}
    title="Abrir/Cerrar Panel de Control"
    aria-expanded={isPanelOpen}
  >
    {#if isPanelOpen}<X size={16} /> Ocultar panel{:else}<PawPrint size={16} /> Abrir panel{/if}
  </Button>
  </div>
  {/if}

  {#if showHabitatWidget}
    <HabitatWidget
      pet={currentPet}
      on:exit={exitHabitatMode}
      on:petUpdated={(e) => {
        currentPet = e.detail;
        const idx = pets.findIndex((p) => p.id === currentPet.id);
        if (idx !== -1) pets[idx] = currentPet;
      }}
    />
  {/if}

  {#if showBall}
    <DesktopBall
      ball={ballState}
      on:grab={handleBallGrab}
      on:drag={(e) => handleBallDrag(e.detail.x, e.detail.y)}
      on:throw={(e) => handleBallThrow(e.detail.vx, e.detail.vy)}
      on:kick={(e) => handleBallKick(e.detail.vx, e.detail.vy)}
    />
  {/if}

  <!-- Objetos que el Pockai saca del Éter (el reloj del pomodoro): se arrastran por la pantalla -->
  <EtherObjectLayer />

  <!-- Mascota Interactiva Flotante (oculta si está en su Hábitat/casa) -->
  {#if currentPet && (!currentPet.inHabitat || homeAnim)}
    <PetView
      bind:this={petViewRef}
      pet={currentPet}
      spawnAt={petSpawnAt}
      entrance={petEntrance}
      environmental={environmental}
      visitors={$visitorsStore}
      ball={showBall && !ballGrabbed ? ballState : null}
      onBallKick={handleBallHit}
      onPetClick={() => {
        isPanelOpen = true;
        panelRequest = { dest: 'pet', sub: 'home', n: ++requestN };
      }}
    />
  {/if}
  {/if}

  <!-- Panel de Control y Cuidados -->
  <ControlPanel
    isOpen={isPanelOpen}
    request={panelRequest}
    user={user}
    pet={currentPet}
    {pets}
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
    on:petHatched={(e) => celebrateHatch(e.detail)}
    on:hatchProgress={(e) => petViewRef?.hatchEgg?.(e.detail.stage, e.detail.newborn)}
    on:selectPet={(e) => selectPet(e.detail)}
    on:actionTriggered={(e) => handlePetAction(e.detail)}
    on:bubble={(e) =>
      showBubble(e.detail, { maxChunks: MAX_AI_CHUNKS, overflowNote: '… (sigue en el chat)', onShow: () => petViewRef?.play?.('talk') })}
    on:behavior={(e) => reactToBehavior(e.detail)}
    on:agentAction={(e) => petViewRef?.playMinor?.('manitas-espirituales', { tool: e.detail })}
    on:refreshPet={refreshPet}
    on:logout={clearSessionState}
  />

  <AchievementToast payload={unlockedAchievement} onDismiss={() => (unlockedAchievement = null)} />
  <RewardToast payload={$rewardToCelebrate} onDismiss={() => rewardToCelebrate.set(null)} />

  {#if droppedFile && !locked}
    <FileDropModal
      file={droppedFile}
      on:close={() => (droppedFile = null)}
      on:sendPrompt={(e) => {
        const { prompt, file } = e.detail;
        droppedFile = null;
        panelRequest = { dest: 'chat', sub: '', n: ++requestN, prompt };
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

  .dock {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    right: 16px;
    position: fixed;
    bottom: 16px;
    z-index: var(--z-dock);
    /* .app-viewport es pointer-events:none (se hereda); el dock debe ser interactivo y
       así el click-through lo cuenta como zona clicable. */
    pointer-events: auto;
  }
  .dock :global(.btn) {
    box-shadow: var(--shadow-2);
  }

  .notif-badge {
    min-width: 18px;
    padding: 0 var(--space-1);
    background: var(--danger);
    color: var(--on-color);
    border-radius: var(--radius-pills);
    font-size: var(--text-caption);
    line-height: 18px;
    text-align: center;
  }
</style>
