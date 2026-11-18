<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { api, isTerminalError } from '../lib/api';
  import { petVoice } from '../lib/petVoice';
  import MinigamesTab from './MinigamesTab.svelte';
  import AiTab from './AiTab.svelte';
  import ArenaTab from './ArenaTab.svelte';
  import SeasonsTab from './SeasonsTab.svelte';
  import MissionsTab from './MissionsTab.svelte';
  import ChestsTab from './ChestsTab.svelte';
  import BondingTab from './BondingTab.svelte';
  import MindTab from './MindTab.svelte';
  import HabitatTab from './HabitatTab.svelte';
  import DesktopSkillsPanel from './DesktopSkillsPanel.svelte';
  import RaidTab from './RaidTab.svelte';
  import TournamentTab from './TournamentTab.svelte';
  import TrainingTab from './TrainingTab.svelte';
  import CookingTab from './CookingTab.svelte';
  import AdventureTab from './AdventureTab.svelte';
  import FriendsTab from './FriendsTab.svelte';
  import ClansTab from './ClansTab.svelte';
  import VisitTab from './VisitTab.svelte';
  import ProfileTab from '../features/profile/ProfileTab.svelte';
  import NotificationSettingsPanel from './NotificationSettingsPanel.svelte';
  import DesktopSettingsPanel from './DesktopSettingsPanel.svelte';
  import AboutPanel from './AboutPanel.svelte';
  import PockaiMark from './PockaiMark.svelte';
  import { updateState, updateLock, hasUpdate } from '../lib/updater';
  import UpdateLockPanel from './UpdateLockPanel.svelte';
  import MaintenanceLockPanel from './MaintenanceLockPanel.svelte';
  import { maintenanceLock } from '../lib/maintenance';
  import HandleField from './HandleField.svelte';
  import { PawPrint, Gamepad2, MessageCircle, Trophy, ShoppingBag, Settings, X, Users } from 'lucide-svelte';
  import HomeView from './views/HomeView.svelte';
  import HatchView from './views/HatchView.svelte';
  import ShopView from './views/ShopView.svelte';
  import AccountView from './views/AccountView.svelte';
  import AuthLayout from './auth/AuthLayout.svelte';
  import CodeInput from './auth/CodeInput.svelte';
  import { Button, CurrencyPill, Notice, Segmented } from './ui';
  import Onboarding from './Onboarding.svelte';
  import { completeOnboarding, onboardingDone } from '../lib/onboarding';
  import { friendlyError } from '../lib/ui/errors';

  export let user: any = null;
  export let pet: any = null;
  /** Todas las mascotas del jugador (para el selector de mascota activa). */
  export let pets: any[] = [];
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

  const dispatch = createEventDispatcher();

  // Errores de las acciones: nunca con alert()/confirm() nativos (en Tauri abren un diálogo modal
  // "tauri.localhost dice" que congela la ventana). Siempre salen como aviso en el panel, que es
  // donde está mirando el jugador; los de negocio además los dice la mascota en su bocadillo
  // cuando está en el escritorio (en casa no hay bocadillo).
  let panelError = '';
  let panelOk = '';
  let panelNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showPanelNotice(kind: 'error' | 'ok', message: string) {
    panelError = kind === 'error' ? message : '';
    panelOk = kind === 'ok' ? message : '';
    if (panelNoticeTimer) clearTimeout(panelNoticeTimer);
    panelNoticeTimer = setTimeout(() => ((panelError = ''), (panelOk = '')), kind === 'error' ? 6000 : 3000);
  }

  function reportError(err: unknown) {
    const message = friendlyError(err);
    showPanelNotice('error', message);
    if (pet && !pet.inHabitat && !isTerminalError(err)) dispatch('bubble', petVoice(message));
  }

  /** Acción en curso (`feed:apple`, `clean`, `buy:apple`…): bloquea su botón y evita dobles envíos. */
  let busyAction: string | null = null;
  /** La guía se cerró sin terminarla: no molesta más en esta sesión, pero volverá a salir. */
  let onboardingLater = false;
  async function runAction(key: string, fn: () => Promise<void>) {
    if (busyAction) return;
    busyAction = key;
    try {
      await fn();
    } catch (err) {
      reportError(err);
    } finally {
      busyAction = null;
    }
  }

  onDestroy(() => {
    endPanelDrag();
    if (panelNoticeTimer) clearTimeout(panelNoticeTimer);
    hatchTimers.forEach(clearTimeout);
    if (hatchClock) clearInterval(hatchClock);
    if (resendTimer) clearInterval(resendTimer);
  });

  // Navegación: 6 destinos con sub-secciones (docs/PANTALLAS.md §4.3).
  const NAV = [
    { id: 'pet', label: 'Mascota', icon: PawPrint, subs: [['home', 'Inicio'], ['hatch', 'Eclosión'], ['bonding', 'Vínculo'], ['mind', 'Mente'], ['habitat', 'Hábitat'], ['skills', 'Habilidades']] },
    { id: 'play', label: 'Jugar', icon: Gamepad2, subs: [['games', 'Minijuegos'], ['arena', 'Arena'], ['raid', 'Raid'], ['tournament', 'Torneo'], ['training', 'Entrenamiento'], ['cooking', 'Cocina'], ['adventure', 'Aventura']] },
    { id: 'chat', label: 'Chat', icon: MessageCircle, subs: [] },
    { id: 'social', label: 'Social', icon: Users, subs: [['profile', 'Mi Perfil'], ['friends', 'Amigos'], ['clans', 'Clanes'], ['visits', 'Visitas']] },
    { id: 'progress', label: 'Progreso', icon: Trophy, subs: [['missions', 'Misiones'], ['seasons', 'Temporada']] },
    { id: 'shop', label: 'Tienda', icon: ShoppingBag, subs: [['store', 'Tienda'], ['chests', 'Cofres']] },
    { id: 'settings', label: 'Ajustes', icon: Settings, subs: [['account', 'Cuenta'], ['notifications', 'Avisos'], ['desktop', 'Escritorio'], ['about', 'Acerca de']] },
  ];
  let dest: string = 'pet';
  let sub: string = 'home';
  /** Amigo elegido en Social › Amigos para abrir directamente su visita. */
  let visitFriend = '';
  /** Petición externa (p. ej. la campana de App.svelte) para abrir una sección concreta. */
  export let request: { dest: string; sub: string; n: number; prompt?: string } | null = null;
  // Mensaje para el chat que acompaña a la petición (p. ej. un archivo soltado sobre la mascota)
  // Se recuerda aquí (no en AiTab, que se desmonta al cambiar de sección) para enviarlo una sola vez
  let consumedPromptN = 0;
  $: chatPrompt = request?.prompt && request.n > consumedPromptN ? { text: request.prompt, n: request.n } : null;
  let lastRequest = 0;
  $: if (request && request.n !== lastRequest) {
    lastRequest = request.n;
    go(request.dest, request.sub);
  }
  /** Última sub-sección visitada de cada destino: al volver se retoma donde estabas. */
  const lastSub: Record<string, string> = {};
  /** Dónde estabas antes de abrir Ajustes, para volver ahí al cerrarlos. */
  let beforeSettings = { dest: 'pet', sub: 'home' };
  let contentEl: HTMLElement | null = null;

  function go(d: string, s?: string) {
    const entry = NAV.find((n) => n.id === d) ?? NAV[0];
    if (entry.id === 'settings' && dest !== 'settings') beforeSettings = { dest, sub };
    const wanted = s ?? lastSub[entry.id];
    leaveSub();
    dest = entry.id;
    sub = entry.subs.some(([v]) => v === wanted) ? (wanted as string) : (entry.subs[0]?.[0] ?? '');
    lastSub[dest] = sub;
    contentEl?.scrollTo({ top: 0 });
  }
  function setSub(s: string) {
    leaveSub();
    sub = s;
    lastSub[dest] = s;
    contentEl?.scrollTo({ top: 0 });
  }
  /** Limpia lo que solo tiene sentido mientras se mira una sub-sección. */
  function leaveSub() {
    if (dest === 'pet' && sub === 'hatch' && hatchingEggId === null) hatchedResult = null;
  }
  const toggleSettings = () => (dest === 'settings' ? go(beforeSettings.dest, beforeSettings.sub) : go('settings'));

  /** Huevos que ya se pueden eclosionar (los que siguen incubando no avisan). */
  $: readyEggs = eggs.filter((e) => !(new Date(e?.hatchesAt).getTime() > now)).length;

  /** Atajos: Esc cierra el panel (si no hay un diálogo abierto) y Ctrl+1…6 cambia de destino. */
  function onShortcut(e: KeyboardEvent) {
    if (!isOpen || e.defaultPrevented) return;
    if (e.key === 'Escape') {
      if (document.querySelector('[role="dialog"]')) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable]')) return (el as HTMLElement).blur();
      dispatch('close');
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !/^[1-6]$/.test(e.key)) return;
    if (!user || user.emailVerified === false || user.handle === null || $updateLock !== null || $maintenanceLock !== null) return;
    e.preventDefault();
    go(NAV.filter((n) => n.id !== 'settings')[Number(e.key) - 1].id);
  }
  $: current = NAV.find((n) => n.id === dest)!;
  /** Color de cada destino (--view-tint): tiñe contadores, vacíos, cabeceras y héroes de la sección. */
  const TINT: Record<string, string> = {
    pet: 'var(--theme-care)',
    play: 'var(--theme-arena)',
    chat: 'var(--theme-ai)',
    social: 'var(--theme-social)',
    progress: 'var(--theme-hot)',
    shop: 'var(--color-sunburst)',
    settings: 'var(--color-concrete-gray)',
  };

  // Auth inputs
  let isLoginMode = true;
  let authEmail = '';
  let authPassword = '';
  let authDisplayName = '';
  let authInviteCode = '';
  let authHandle = '';
  let authHandleValid = false;
  let inviteRequired = false;

  // ---- Elegir nickname (cuentas sin él: anteriores al nickname o creadas desde apps antiguas) ----
  let chooseHandle = '';
  let chooseHandleValid = false;
  let chooseHandleConfirm = false;
  let chooseHandleError = '';

  async function handleChooseHandle() {
    chooseHandleError = '';
    if (!chooseHandleValid) {
      chooseHandleError = 'Elige un nickname válido y libre';
      return;
    }
    // Es inmutable: se pide una confirmación explícita antes de guardarlo.
    if (!chooseHandleConfirm) {
      chooseHandleConfirm = true;
      return;
    }
    isLoading = true;
    try {
      await api.setMyHandle(chooseHandle);
      dispatch('authSuccess');
    } catch (err: any) {
      chooseHandleError = err?.message || 'No se pudo guardar el nickname';
      chooseHandleConfirm = false;
    } finally {
      isLoading = false;
    }
  }
  // Si cambia el texto tras pedir confirmación, se vuelve a pedir.
  $: chooseHandle, (chooseHandleConfirm = false);
  let authError = '';
  /** Aviso de éxito en la pantalla de acceso (p. ej. tras cambiar la contraseña). */
  let authNotice = '';
  let isLoading = false;

  // ---- Recuperar contraseña (sin sesión) ----
  let authView: 'login' | 'forgot' | 'reset' = 'login';
  let resetEmail = '';
  let resetCode = '';
  let resetPassword = '';
  let resetPassword2 = '';
  let showResetPassword = false;
  let resetError = '';
  let resetNotice = '';

  function openForgot() {
    resetEmail = authEmail.trim();
    resetCode = '';
    resetPassword = '';
    resetPassword2 = '';
    resetError = '';
    resetNotice = '';
    authView = 'forgot';
  }

  function backToLogin() {
    authView = 'login';
    isLoginMode = true;
    resetError = '';
    resetNotice = '';
  }

  async function handleResetRequest() {
    resetError = '';
    resetNotice = '';
    if (!resetEmail.trim()) {
      resetError = 'Escribe el correo de tu cuenta';
      return;
    }
    isLoading = true;
    try {
      await api.requestPasswordReset(resetEmail);
      authView = 'reset';
      startResendCooldown();
    } catch (err: any) {
      resetError = err?.message || 'No se pudo enviar el código';
    } finally {
      isLoading = false;
    }
  }

  let resending = false;
  async function handleResetResend() {
    if (resending) return;
    resetError = '';
    resetNotice = '';
    resending = true;
    try {
      await api.requestPasswordReset(resetEmail);
      resetNotice = 'Te hemos enviado un código nuevo. El anterior ya no sirve.';
      startResendCooldown();
    } catch (err: any) {
      resetError = friendlyError(err, 'No se pudo reenviar el código');
    } finally {
      resending = false;
    }
  }

  async function handleResetConfirm() {
    resetError = '';
    resetNotice = '';
    if (!/^[0-9]{6}$/.test(resetCode.trim())) {
      resetError = 'El código tiene 6 dígitos';
      return;
    }
    if (resetPassword.length < 8) {
      resetError = 'La contraseña debe tener al menos 8 caracteres';
      return;
    }
    if (resetPassword !== resetPassword2) {
      resetError = 'Las contraseñas no coinciden';
      return;
    }
    isLoading = true;
    try {
      await api.confirmPasswordReset(resetEmail, resetCode, resetPassword);
      authEmail = resetEmail;
      authPassword = '';
      resetPassword = '';
      resetPassword2 = '';
      authView = 'login';
      dispatch('authSuccess');
      authNotice = 'Contraseña cambiada. Se ha cerrado la sesión en tus otros dispositivos.';
    } catch (err: any) {
      resetError = err?.message || 'No se pudo cambiar la contraseña';
    } finally {
      isLoading = false;
    }
  }

  // ---- Verificación del correo (cuenta recién creada) ----
  let verifyCode = '';
  let verifyError = '';
  let verifyNotice = '';
  let resendIn = 0;
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  function startResendCooldown(seconds = 60) {
    resendIn = seconds;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendIn -= 1;
      if (resendIn <= 0 && resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);
  }

  async function handleVerifyCode() {
    verifyError = '';
    verifyNotice = '';
    if (!/^[0-9]{6}$/.test(verifyCode.trim())) {
      verifyError = 'El código tiene 6 dígitos';
      return;
    }
    isLoading = true;
    try {
      await api.verifyEmail(verifyCode);
      verifyCode = '';
      dispatch('authSuccess');
    } catch (err: any) {
      verifyError = err?.message || 'No se pudo verificar el código';
    } finally {
      isLoading = false;
    }
  }

  /** «Ya lo he verificado» (con el enlace de la web): se vuelve a consultar el perfil. */
  async function handleVerifyRecheck() {
    verifyError = '';
    verifyNotice = '';
    isLoading = true;
    try {
      const me = await api.getMe();
      if (me?.emailVerified) dispatch('authSuccess');
      else verifyNotice = 'Aún no consta como verificado. Abre el enlace del correo o escribe el código.';
    } catch {
      verifyError = 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.';
    } finally {
      isLoading = false;
    }
  }

  async function handleResendVerification() {
    if (resending) return;
    verifyError = '';
    verifyNotice = '';
    resending = true;
    try {
      await api.resendVerification();
      verifyNotice = 'Te hemos enviado un correo nuevo. El código anterior ya no sirve.';
      startResendCooldown();
    } catch (err: any) {
      verifyError = friendlyError(err, 'No se pudo reenviar el correo');
    } finally {
      resending = false;
    }
  }

  // Hatching animation state
  let hatchingEggId: string | null = null;
  let isShaking = false;
  let isCracking = false;
  let isHatchingOut = false;
  let hatchedResult: any = null;

  // Nombre opcional por huevo (objeto { [eggId]: name }) y reloj para el countdown de incubación.
  let eggNames: Record<string, string> = {};
  let now = Date.now();
  let hatchClock: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    // Tick por segundo para el countdown de incubación (solo afecta a la vista de eclosión).
    hatchClock = setInterval(() => (now = Date.now()), 1000);
  });

  async function handleAuth() {
    authError = '';
    isLoading = true;
    try {
      if (isLoginMode) {
        await api.login(authEmail, authPassword);
      } else {
        if (inviteRequired && !authInviteCode.trim()) {
          throw new Error('El registro requiere un código de invitación');
        }
        if (!authHandleValid) {
          throw new Error('Elige un nickname válido y libre');
        }
        await api.register(authEmail, authPassword, authDisplayName || undefined, authInviteCode || undefined, authHandle);
      }
      dispatch('authSuccess');
    } catch (err: any) {
      authError = err.message || 'Error durante la autenticación';
    } finally {
      isLoading = false;
    }
  }

  /** Al pasar a "Crear cuenta" se consulta si el registro exige invitación. */
  async function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    authError = '';
    if (isLoginMode) return;
    try {
      inviteRequired = (await api.getRegistrationConfig()).inviteRequired;
    } catch (err) {
      authError = friendlyError(err, 'No se pudo comprobar si el registro está abierto.');
    }
  }

  const petName = () => pet?.nickname || pet?.species?.name || 'Tu Pockai';

  function handleFeed(itemId: string) {
    if (!pet) return;
    const food = inventory.find((i) => i.itemId === itemId)?.item?.name;
    return runAction(`feed:${itemId}`, async () => {
      const updated = await api.feedPet(pet.id, itemId);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'eat');
      await refreshInventory();
      showPanelNotice('ok', food ? `${petName()} se ha comido: ${food}.` : `${petName()} ha comido.`);
    });
  }

  function handleClean() {
    if (!pet) return;
    return runAction('clean', async () => {
      const updated = await api.cleanPet(pet.id);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'clean');
      showPanelNotice('ok', `${petName()} está reluciente.`);
    });
  }

  function handleToggleSleep() {
    if (!pet) return;
    return runAction('sleep', async () => {
      const waking = pet.sleeping;
      const updated = waking ? await api.wakePet(pet.id) : await api.sleepPet(pet.id);
      dispatch('petUpdated', updated);
      if (waking) dispatch('actionTriggered', 'wake');
    });
  }

  function handleToggleHabitat(inHabitat: boolean) {
    if (!pet) return;
    return runAction('habitat', async () => {
      const updated = await api.setPetInHabitat(pet.id, inHabitat);
      dispatch('petUpdated', updated);
      dispatch('bubble', inHabitat ? '¡Me quedo a descansar en mi casita!' : '¡De vuelta a explorar el escritorio!');
      if (inHabitat) showPanelNotice('ok', `${petName()} está en casa.`);
    });
  }

  /** Soltar a la mascota sobre el panel la manda a casa. Un archivo o un texto arrastrado no. */
  async function handlePanelDrop(e: DragEvent) {
    e.preventDefault();
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (types.some((t) => t === 'Files' || t.startsWith('text/'))) return;
    if (!pet || pet.inHabitat) return;
    await handleToggleHabitat(true);
  }

  async function handleHatch(eggId: string, nickname?: string) {
    // Vacío/espacios → undefined: el backend asigna un nombre aleatorio.
    const name = (nickname ?? '').trim();
    if (hatchingEggId !== null) return;
    hatchingEggId = eggId;
    hatchedResult = null;
    isShaking = true;
    try {
      // La petición va en paralelo al temblor: si falla, el huevo no llega a «romperse».
      const [newPet] = await Promise.all([api.hatchEgg(eggId, name || undefined), wait(1500)]);
      isCracking = true;
      await wait(1300);
      isShaking = false;
      isCracking = false;
      isHatchingOut = true;
      await wait(900);
      hatchedResult = newPet;
      dispatch('petHatched', newPet);
      dispatch('actionTriggered', 'hatched');
      dispatch('refreshEggs');
      delete eggNames[eggId]; // al terminar, limpia el input de ese huevo
    } catch (err: any) {
      reportError(err);
    } finally {
      isShaking = false;
      isCracking = false;
      isHatchingOut = false;
      hatchingEggId = null;
    }
  }

  /** Esperas de la animación de eclosión, canceladas si el panel se desmonta. */
  const hatchTimers = new Set<ReturnType<typeof setTimeout>>();
  function wait(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        hatchTimers.delete(t);
        resolve();
      }, ms);
      hatchTimers.add(t);
    });
  }

  function handleBuyEgg() {
    return runAction('buy:egg', async () => {
      await api.buyEgg();
      dispatch('refreshEggs');
      dispatch('refreshUser');
      showPanelNotice('ok', 'Huevo comprado. Ya está incubando.');
    });
  }

  function handleBuyItem(itemId: string) {
    const name = shopItems.find((i) => i.id === itemId)?.name;
    return runAction(`buy:${itemId}`, async () => {
      await api.buyShopItem(itemId, 1);
      dispatch('refreshUser');
      await refreshInventory();
      showPanelNotice('ok', name ? `Comprado: ${name}.` : 'Compra hecha.');
    });
  }

  async function refreshInventory() {
    const inv = await api.getInventory();
    inventory = inv;
  }
</script>


<svelte:window on:keydown={onShortcut} />

{#if isOpen}
  <div
    class="panel-card"
    role="region"
    aria-label="Panel de Control"
    bind:this={panelEl}
    style="--view-tint: {TINT[dest] ?? 'var(--theme-social)'};{panelPos ? ` left: ${panelPos.x}px; top: ${panelPos.y}px; right: auto;` : ''}"
    on:dragover|preventDefault
    on:drop={handlePanelDrop}
  >
    <div class="panel-header" on:mousedown={startPanelDrag} role="presentation">
      <div class="header-title">
        <span class="logo"><PockaiMark size={30} /><span class="display">Pockai</span></span>
        {#if user}
          <div class="user-pill">
            <CurrencyPill kind="coins" amount={user.coins} />
            <CurrencyPill kind="gems" amount={user.gems} />
          </div>
        {/if}
      </div>
      {#if $updateLock === null && $maintenanceLock === null}
        <div class="header-actions">
          {#if user && user.emailVerified !== false}
            <button
              class="btn btn--ghost btn--icon settings-btn"
              class:active={dest === 'settings'}
              aria-label={hasUpdate($updateState) ? 'Ajustes: hay una versión nueva' : dest === 'settings' ? 'Cerrar ajustes' : 'Ajustes'}
              aria-current={dest === 'settings' ? 'page' : undefined}
              title={dest === 'settings' ? 'Cerrar ajustes' : 'Ajustes'}
              on:click={toggleSettings}
            >
              <Settings size={18} />
              {#if hasUpdate($updateState)}<span class="dot-badge" aria-hidden="true"></span>{/if}
            </button>
          {/if}
          <button class="btn btn--ghost btn--icon close-btn" aria-label="Cerrar panel" title="Cerrar panel (Esc)" on:click={() => dispatch('close')}><X size={18} /></button>
        </div>
      {/if}
    </div>

    {#if $updateLock !== null}
      <!-- Actualización obligatoria: el panel solo muestra el bloqueo hasta que se instale -->
      <UpdateLockPanel />
    {:else if $maintenanceLock !== null}
      <!-- Mantenimiento del servidor: solo el aviso hasta que termine -->
      <MaintenanceLockPanel />
    {:else if !user && authView !== 'login'}
      <!-- Recuperar contraseña: 1) correo → código; 2) código + contraseña nueva -->
      <AuthLayout eyebrow="Recuperar contraseña" title={authView === 'forgot' ? '¿Has olvidado tu contraseña?' : 'Nueva contraseña'}>
        <svelte:fragment slot="subtitle">
          {#if authView === 'forgot'}
            Te enviaremos un código de 6 dígitos para crear una contraseña nueva.
          {:else}
            Si existe una cuenta con <strong>{resetEmail}</strong>, te hemos enviado un código. Caduca en 15 minutos.
          {/if}
        </svelte:fragment>

        {#if authView === 'forgot'}
          <form class="card auth-form" on:submit|preventDefault={handleResetRequest}>
            {#if resetError}<Notice tone="error">{resetError}</Notice>{/if}
            <div class="form-group">
              <label for="reset-email">Correo electrónico</label>
              <input class="input" id="reset-email" type="email" autocomplete="email" required bind:value={resetEmail} placeholder="entrenador@pockai.app" />
            </div>
            <Button type="submit" variant="primary" size="lg" block loading={isLoading}>Enviar código</Button>
          </form>
        {:else}
          <form class="card auth-form" on:submit|preventDefault={handleResetConfirm}>
            {#if resetError}<Notice tone="error">{resetError}</Notice>{/if}
            {#if resetNotice}<Notice tone="info">{resetNotice}</Notice>{/if}
            <CodeInput id="reset-code" bind:value={resetCode} />
            <div class="form-group">
              <label for="reset-pass">Contraseña nueva</label>
              {#if showResetPassword}
                <input class="input" id="reset-pass" type="text" autocomplete="new-password" minlength="8" required bind:value={resetPassword} placeholder="Mínimo 8 caracteres" />
              {:else}
                <input class="input" id="reset-pass" type="password" autocomplete="new-password" minlength="8" required bind:value={resetPassword} placeholder="Mínimo 8 caracteres" />
              {/if}
            </div>
            <div class="form-group">
              <label for="reset-pass2">Repite la contraseña</label>
              {#if showResetPassword}
                <input class="input" id="reset-pass2" type="text" autocomplete="new-password" required bind:value={resetPassword2} />
              {:else}
                <input class="input" id="reset-pass2" type="password" autocomplete="new-password" required bind:value={resetPassword2} />
              {/if}
            </div>
            <label class="show-pass"><input type="checkbox" bind:checked={showResetPassword} /> Mostrar contraseña</label>
            <Button type="submit" variant="primary" size="lg" block loading={isLoading}>Cambiar contraseña</Button>
          </form>

          <button type="button" class="auth-link" on:click={handleResetResend} disabled={resendIn > 0 || resending}>
            {#if resendIn > 0}Puedes pedir otro código en {resendIn} s{:else}¿No te ha llegado? <strong>Reenviar código</strong>{/if}
          </button>
        {/if}

        <button type="button" class="auth-link" on:click={backToLogin}>Volver a iniciar sesión</button>
      </AuthLayout>
    {:else if !user}
      <AuthLayout eyebrow="Pockai" title={isLoginMode ? 'Iniciar sesión' : 'Crear cuenta'}>
        <svelte:fragment slot="subtitle">Conecta con tu mascota virtual</svelte:fragment>

        <form class="card auth-form" on:submit|preventDefault={handleAuth}>
          {#if authNotice}<Notice tone="ok">{authNotice}</Notice>{/if}
          {#if authError}<Notice tone="error">{authError}</Notice>{/if}

          <div class="form-group">
            <label for="auth-email">Correo electrónico</label>
            <input class="input" id="auth-email" type="email" autocomplete="email" required bind:value={authEmail} placeholder="entrenador@pockai.app" />
          </div>

          {#if !isLoginMode}
            <HandleField id="auth-handle" bind:value={authHandle} bind:valid={authHandleValid} />
            <div class="form-group">
              <label for="auth-name">Nombre de jugador</label>
              <input class="input" id="auth-name" type="text" autocomplete="nickname" bind:value={authDisplayName} placeholder="Red" />
              <small class="form-hint">El nombre sí podrás cambiarlo cuando quieras.</small>
            </div>
          {/if}

          <div class="form-group">
            <label for="auth-pass">Contraseña</label>
            <input class="input" id="auth-pass" type="password" autocomplete={isLoginMode ? 'current-password' : 'new-password'} required bind:value={authPassword} placeholder="••••••••" />
            {#if isLoginMode}
              <button type="button" class="forgot-link" on:click={openForgot}>¿Has olvidado tu contraseña?</button>
            {/if}
          </div>

          {#if !isLoginMode}
            <div class="form-group">
              <label for="auth-invite">Código de invitación{inviteRequired ? '' : ' (opcional)'}</label>
              <input
                class="input"
                id="auth-invite"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                maxlength="32"
                required={inviteRequired}
                bind:value={authInviteCode}
                placeholder="ABCD-EF23"
              />
              {#if inviteRequired}
                <small class="form-hint">El registro está limitado: necesitas un código de invitación.</small>
              {/if}
            </div>
          {/if}

          <Button type="submit" variant="primary" size="lg" block loading={isLoading}>
            {isLoginMode ? 'Entrar' : 'Registrarse'}
          </Button>
        </form>

        <button type="button" class="auth-link" on:click={toggleAuthMode}>
          {#if isLoginMode}¿No tienes cuenta? <strong>Regístrate</strong>{:else}¿Ya tienes cuenta? <strong>Inicia sesión</strong>{/if}
        </button>

        <!-- Sin sesión no hay Ajustes: el estado de la actualización se muestra aquí (aviso automático o bandeja). -->
        {#if $updateState.status !== 'idle'}
          <AboutPanel />
        {/if}
      </AuthLayout>
    {:else if user.emailVerified === false}
      <!-- Cuenta sin verificar: no se puede jugar hasta confirmar el correo -->
      <AuthLayout eyebrow="Un último paso" title="Verifica tu correo">
        <svelte:fragment slot="subtitle">
          Te hemos enviado un código a <strong>{user.email}</strong>. Escríbelo aquí o pulsa el botón del correo.
        </svelte:fragment>

        <form class="card auth-form" on:submit|preventDefault={handleVerifyCode}>
          {#if verifyError}<Notice tone="error">{verifyError}</Notice>{/if}
          {#if verifyNotice}<Notice tone="info">{verifyNotice}</Notice>{/if}
          <CodeInput id="verify-code" label="Código de verificación" bind:value={verifyCode} />
          <Button type="submit" variant="primary" size="lg" block loading={isLoading}>Verificar</Button>
          <Button block disabled={isLoading} on:click={handleVerifyRecheck}>Ya lo he verificado con el enlace</Button>
        </form>

        <button type="button" class="auth-link" on:click={handleResendVerification} disabled={resendIn > 0 || resending}>
          {#if resendIn > 0}Puedes reenviarlo en {resendIn} s{:else}¿No te ha llegado? <strong>Reenviar correo</strong>{/if}
        </button>
        <button type="button" class="auth-link" on:click={() => { api.logout(); dispatch('logout'); }}>Usar otra cuenta</button>
      </AuthLayout>
    {:else if user.handle === null}
      <!-- Cuenta sin nickname: hay que elegirlo antes de jugar (es único y no se podrá cambiar) -->
      <AuthLayout eyebrow="Un último paso" title="Elige tu nickname">
        <svelte:fragment slot="subtitle">
          Es tu @ en Pockai: con él te añadirán como amigo, te invitarán a clanes y te mandarán pockais de visita.
          <strong>Es único y no se podrá cambiar.</strong>
        </svelte:fragment>

        <form class="card auth-form" on:submit|preventDefault={handleChooseHandle}>
          {#if chooseHandleError}<Notice tone="error">{chooseHandleError}</Notice>{/if}
          <HandleField id="choose-handle" bind:value={chooseHandle} bind:valid={chooseHandleValid} />
          {#if chooseHandleConfirm}
            <Notice tone="warning">¿Seguro que quieres ser <strong>@{chooseHandle}</strong>? No podrás cambiarlo nunca.</Notice>
          {/if}
          <Button type="submit" variant="primary" size="lg" block loading={isLoading} disabled={!chooseHandleValid}>
            {chooseHandleConfirm ? `Sí, quiero ser @${chooseHandle}` : 'Continuar'}
          </Button>
        </form>

        <button type="button" class="auth-link" on:click={() => { api.logout(); dispatch('logout'); }}>Usar otra cuenta</button>
      </AuthLayout>
    {:else}
      <!-- Guía de primer uso: una vez, cuando ya hay mascota y no se está en plena eclosión -->
      {#if pet && !$onboardingDone && !onboardingLater && !(dest === 'pet' && sub === 'hatch')}
        <Onboarding on:done={() => completeOnboarding()} on:later={() => (onboardingLater = true)} on:go={(e) => go(e.detail.dest, e.detail.sub)} />
      {/if}

      <!-- Destinos principales -->
      <nav class="nav-tabs" aria-label="Secciones">
        <!-- Ajustes no va en la barra: es el engranaje de la cabecera, junto a la X -->
        {#each NAV.filter((n) => n.id !== 'settings') as n, i (n.id)}
          <button
            class:active={dest === n.id}
            style="--tab-tint: {TINT[n.id]}"
            aria-current={dest === n.id ? 'page' : undefined}
            title="{n.label} (Ctrl+{i + 1})"
            on:click={() => go(n.id)}
          >
            <svelte:component this={n.icon} size={18} />
            <span>{n.label}</span>
            {#if n.id === 'pet' && readyEggs > 0}
              <span class="tab-badge" aria-label="{readyEggs} {readyEggs === 1 ? 'huevo listo' : 'huevos listos'}">{readyEggs}</span>
            {/if}
          </button>
        {/each}
      </nav>

      <!-- Sub-secciones -->
      {#if current.subs.length > 0}
        <Segmented
          variant="pills"
          class="sub-tabs"
          label={current.label}
          value={sub}
          options={current.subs.map(([value, label]) => ({ value, label, badge: value === 'hatch' && readyEggs > 0 ? readyEggs : undefined }))}
          on:change={(e) => setSub(e.detail)}
        />
      {/if}

      {#if panelError}
        <div class="panel-error">
          <Notice tone="error" dismissible on:dismiss={() => (panelError = '')}>{panelError}</Notice>
        </div>
      {:else if panelOk}
        <div class="panel-error">
          <Notice tone="ok">{panelOk}</Notice>
        </div>
      {/if}

      <div class="tab-content" role="tabpanel" aria-label={current.subs.find(([v]) => v === sub)?.[1] ?? current.label} bind:this={contentEl}>
        {#if dest === 'pet' && sub === 'home'}
          <HomeView
            {pet}
            {pets}
            {inventory}
            busy={busyAction}
            on:selectPet
            on:clean={handleClean}
            on:toggleSleep={handleToggleSleep}
            on:toggleHabitat={(e) => handleToggleHabitat(e.detail)}
            on:feed={(e) => handleFeed(e.detail)}
            on:go={(e) => go(e.detail.dest, e.detail.sub)}
          />

        {:else if dest === 'pet' && sub === 'hatch'}
          <HatchView
            {eggs}
            bind:eggNames
            {now}
            {hatchingEggId}
            {isShaking}
            {isCracking}
            {isHatchingOut}
            {hatchedResult}
            activePetId={pet?.id ?? null}
            coins={user.coins}
            buying={busyAction === 'buy:egg'}
            on:hatch={(e) => handleHatch(e.detail.id, e.detail.name)}
            on:buyEgg={handleBuyEgg}
            on:selectPet
            on:dismissResult={() => (hatchedResult = null)}
          />

        {:else if dest === 'pet' && sub === 'bonding'}
          <BondingTab pet={pet} />

        {:else if dest === 'pet' && sub === 'mind'}
          <MindTab {pet} />

        {:else if dest === 'pet' && sub === 'habitat'}
          <HabitatTab {pet} {user} on:refreshUser on:petUpdated={(e) => dispatch('petUpdated', e.detail)} />

        {:else if dest === 'pet' && sub === 'skills'}
          <DesktopSkillsPanel {pet} />

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

        {:else if dest === 'play' && sub === 'training'}
          <TrainingTab {pet} on:refreshPet on:refreshUser />

        {:else if dest === 'play' && sub === 'cooking'}
          <CookingTab {pet} on:refreshPet on:refreshUser />

        {:else if dest === 'play' && sub === 'adventure'}
          <AdventureTab {pet} on:refreshPet on:refreshUser />

        {:else if dest === 'chat'}
          <AiTab
            {pet}
            pendingPrompt={chatPrompt}
            on:promptConsumed={(e) => (consumedPromptN = Math.max(consumedPromptN, e.detail))}
            on:bubble
            on:behavior
            on:refreshPet
          />

        {:else if dest === 'social' && sub === 'profile'}
          <ProfileTab />

        {:else if dest === 'social' && sub === 'friends'}
          <FriendsTab on:visit={(e) => { visitFriend = e.detail; go('social', 'visits'); }} />

        {:else if dest === 'social' && sub === 'clans'}
          <ClansTab />

        {:else if dest === 'social' && sub === 'visits'}
          <VisitTab initialFriend={visitFriend} on:refreshUser on:goFriends={() => go('social', 'friends')} />

        {:else if dest === 'progress' && sub === 'missions'}
          <MissionsTab on:refreshUser />

        {:else if dest === 'progress' && sub === 'seasons'}
          <SeasonsTab on:refreshUser />

        {:else if dest === 'shop' && sub === 'store'}
          <ShopView {shopItems} {inventory} coins={user.coins} busyItem={busyAction?.startsWith('buy:') ? busyAction.slice(4) : null} on:buy={(e) => handleBuyItem(e.detail)} />

        {:else if dest === 'shop' && sub === 'chests'}
          <ChestsTab on:refreshUser />

        {:else if dest === 'settings' && sub === 'account'}
          <AccountView {user} on:logout={() => { api.logout(); dispatch('logout'); }} />

        {:else if dest === 'settings' && sub === 'notifications'}
          <NotificationSettingsPanel />

        {:else if dest === 'settings' && sub === 'desktop'}
          <DesktopSettingsPanel />

        {:else if dest === 'settings' && sub === 'about'}
          <AboutPanel />
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
    z-index: var(--z-panel);
    pointer-events: auto;
    transition: box-shadow var(--dur-1) ease, outline-color var(--dur-1) ease;
    outline: 3px solid transparent;
    outline-offset: -3px;
  }

  /* La mascota se está arrastrando encima: el panel (su casa) se marca como destino */
  :global(body[data-pet-over-panel]) .panel-card {
    outline-color: color-mix(in srgb, var(--success) 85%, transparent);
    box-shadow: var(--shadow-4), 0 0 28px color-mix(in srgb, var(--success) 45%, transparent);
  }

  .panel-header {
    cursor: grab;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
    background: color-mix(in srgb, var(--surface) 45%, transparent);
    border-bottom: 1px solid var(--line-soft);
  }
  .panel-header:active {
    cursor: grabbing;
  }
  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .logo .display {
    font-family: var(--font-display);
    font-size: var(--text-title);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    line-height: 1;
  }
  .user-pill {
    display: flex;
    gap: var(--space-2);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .settings-btn {
    position: relative;
    border: 1px solid transparent;
  }
  .settings-btn :global(svg) {
    transition: rotate var(--dur-2) var(--ease-out);
  }
  .settings-btn:hover :global(svg) {
    rotate: 60deg;
  }
  .settings-btn.active,
  .settings-btn.active:hover {
    background: var(--view-tint);
    color: var(--on-color);
    border-color: var(--on-color);
    box-shadow: 2px 2px 0 var(--on-color);
  }
  .dot-badge {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
    border: 1px solid var(--on-color);
  }
  .close-btn {
    transition: background var(--dur-1), rotate var(--dur-1);
  }
  .close-btn:hover {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    rotate: 90deg;
  }

  .nav-tabs {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--line-soft);
  }
  .nav-tabs button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: var(--space-2) 0 var(--space-2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-2xl);
    color: var(--ink-muted);
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-1), color var(--dur-1), box-shadow var(--dur-1), translate var(--dur-1);
  }
  .nav-tabs button :global(svg) {
    transition: translate var(--dur-1);
  }
  .nav-tabs button:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--tab-tint) 22%, transparent);
  }
  .nav-tabs button:hover :global(svg) {
    translate: 0 -1px;
  }
  .nav-tabs button.active {
    color: var(--on-color);
    background: var(--tab-tint);
    border-color: var(--on-color);
    box-shadow: 2px 3px 0 var(--on-color);
    translate: -1px -1px;
  }
  .nav-tabs button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .tab-badge {
    position: absolute;
    top: -4px;
    right: 4px;
    min-width: 16px;
    padding: 0 var(--space-1);
    border: 1px solid var(--on-color);
    border-radius: var(--radius-pills);
    background: var(--danger);
    color: var(--on-dark);
    font-size: var(--text-caption);
    line-height: 14px;
    text-align: center;
  }

  .panel-card :global(.sub-tabs) {
    flex-shrink: 0; /* con contenido largo el flex la recortaba */
    padding: var(--space-2) var(--space-3) 2px;
    /* Una sola fila desplazable: Segmented difumina el borde cuando hay más pastillas a ese
       lado y mantiene la activa a la vista, así la altura no cambia entre destinos. */
    padding-bottom: var(--space-1);
  }

  .panel-error {
    margin: var(--space-2) var(--space-3) 0;
  }

  .tab-content {
    padding: var(--space-4) var(--space-4) var(--space-4);
    overflow-y: auto;
    user-select: text;
  }
</style>
