<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { api, isTerminalError } from '../lib/api';
  import { sfx } from '../lib/audio';
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
  import WardrobeTab from './WardrobeTab.svelte';
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
  import SoundSettingsPanel from './SoundSettingsPanel.svelte';
  import AboutPanel from './AboutPanel.svelte';
  import { updateState, updateLock, hasUpdate } from '../lib/updater';
  import UpdateLockPanel from './UpdateLockPanel.svelte';
  import MaintenanceLockPanel from './MaintenanceLockPanel.svelte';
  import { maintenanceLock } from '../lib/maintenance';
  import { X } from 'lucide-svelte';
  import HomeView from './views/HomeView.svelte';
  import { AccountView, AuthView, BackpackView, ChooseHandleView, HatchView, Ico, PockaiMark, ShopView, VerifyEmailView, type AuthApi } from '@pockai/ui';
  import { DESKTOP_NAV_BAR, NAV_LABELS, NAV_SUBS, type NavDest } from '@pockai/ui';
  import RedeemVoucherCard from './views/RedeemVoucherCard.svelte';
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

  /** `sound`: el del aviso por defecto, otro (p. ej. `ui.purchase`) o `null` para callar. */
  function showPanelNotice(kind: 'error' | 'ok', message: string, sound: string | null = kind === 'ok' ? 'ui.notice_ok' : 'ui.error') {
    if (sound) sfx(sound);
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
  });

  // Navegación: los destinos y sus sub-secciones vienen de @pockai/ui (nav.ts), los mismos que el móvil.
  // La barra superior son seis destinos (DESKTOP_NAV_BAR); Ajustes va aparte, en el engranaje.
  // Los iconos son del set propio de @pockai/ui (`ui:<clave>`), como en el resto de la interfaz.
  const NAV_ICONS: Record<NavDest, string> = {
    pet: 'ui:pet',
    play: 'ui:play',
    chat: 'ui:chat',
    social: 'ui:social',
    progress: 'ui:progress',
    shop: 'ui:shop',
    settings: 'ui:settings',
  };
  const NAV_IDS: NavDest[] = [...DESKTOP_NAV_BAR, 'settings'];
  const NAV = NAV_IDS.map((id) => ({
    id,
    label: NAV_LABELS[id],
    icon: NAV_ICONS[id],
    subs: Object.entries(NAV_SUBS[id]) as [string, string][],
  }));
  let dest: NavDest = 'pet';
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
  /**
   * Estado que solo tiene sentido mientras se mira una sub-sección, por «destino/sub». Al salir de
   * ella se limpia. Para otro caso se añade una entrada aquí, sin tocar `leaveSub`.
   */
  const RESET_ON_LEAVE: Record<string, () => void> = {
    'pet/hatch': () => {
      if (hatchingEggId === null) hatchedResult = null;
    },
  };
  function leaveSub() {
    RESET_ON_LEAVE[`${dest}/${sub}`]?.();
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

  // Acceso, verificación del correo y nickname: vistas de @pockai/ui con la API del escritorio.
  const authApi: AuthApi = {
    login: (email, password) => api.login(email, password),
    register: ({ email, password, displayName, inviteCode, handle }) => api.register(email, password, displayName, inviteCode, handle),
    registrationConfig: () => api.getRegistrationConfig(),
    requestPasswordReset: (email) => api.requestPasswordReset(email),
    confirmPasswordReset: (email, code, newPassword) => api.confirmPasswordReset(email, code, newPassword),
    checkHandle: (handle) => api.checkHandleAvailable(handle),
    verifyEmail: (code) => api.verifyEmail(code),
    resendVerification: () => api.resendVerification(),
    isEmailVerified: async () => Boolean(((await api.getMe()) as { emailVerified?: boolean } | null)?.emailVerified),
    setHandle: (handle) => api.setMyHandle(handle),
    errorText: (err, fallback) => friendlyError(err, fallback),
  };
  /** Tras cambiar la contraseña la app entra sola; el aviso queda por si vuelve al acceso. */
  let authNotice = '';
  function onAuthSuccess(kind: 'login' | 'register' | 'reset' | void) {
    if (kind === 'reset') authNotice = 'Contraseña cambiada. Se ha cerrado la sesión en tus otros dispositivos.';
    dispatch('authSuccess');
  }
  function useOtherAccount() {
    api.logout();
    dispatch('logout');
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

  const petName = () => pet?.nickname || pet?.species?.name || 'Tu Pockai';

  function handleFeed(itemId: string) {
    if (!pet) return;
    const food = inventory.find((i) => i.itemId === itemId)?.item?.name;
    return runAction(`feed:${itemId}`, async () => {
      const updated = await api.feedPet(pet.id, itemId);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'eat');
      await refreshInventory();
      showPanelNotice('ok', food ? `${petName()} se ha comido: ${food}.` : `${petName()} ha comido.`, null);
    });
  }

  /** Mochila (spec 41): usa cualquier objeto; el servidor decide qué hace según su tipo. */
  function handleUseItem(itemId: string) {
    if (!pet) return;
    const row = inventory.find((i) => i.itemId === itemId);
    const name = row?.item?.name;
    const kind = row?.item?.kind;
    const before = pet.level;
    return runAction(`use:${itemId}`, async () => {
      const updated = await api.usePetItem(pet.id, itemId);
      dispatch('petUpdated', updated);
      if (kind === 'food') dispatch('actionTriggered', 'eat');
      await refreshInventory();
      const msg =
        kind === 'level_up' && updated?.level > before
          ? `¡${petName()} sube al nivel ${updated.level}!`
          : kind === 'medicine'
            ? `${petName()} se siente mucho mejor.`
            : kind === 'evolution'
              ? `¡${petName()} ha alcanzado su forma final!`
              : name
                ? `Has usado: ${name}.`
                : 'Objeto usado.';
      showPanelNotice('ok', msg, null);
    });
  }

  function handleClean() {
    if (!pet) return;
    return runAction('clean', async () => {
      const updated = await api.cleanPet(pet.id);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'clean');
      showPanelNotice('ok', `${petName()} está reluciente.`, null);
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
      // El huevo también tiembla en el escritorio, junto a la mascota (efecto huevo-grietas)
      dispatch('hatchProgress', { stage: 'shake' });
      // La petición va en paralelo al temblor: si falla, el huevo no llega a «romperse».
      const [newPet] = await Promise.all([api.hatchEgg(eggId, name || undefined), wait(1500)]);
      isCracking = true;
      // Ya se sabe quién nace: sus grietas brillan con el Flujo de la recién nacida
      dispatch('hatchProgress', { stage: 'crack', newborn: newPet });
      await wait(1300);
      isShaking = false;
      isCracking = false;
      isHatchingOut = true;
      await wait(900);
      hatchedResult = newPet;
      dispatch('petHatched', newPet);
      dispatch('refreshEggs');
      delete eggNames[eggId]; // al terminar, limpia el input de ese huevo
    } catch (err: any) {
      dispatch('hatchProgress', { stage: 'abort' });
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
      showPanelNotice('ok', 'Huevo comprado. Ya está incubando.', 'ui.purchase');
    });
  }

  function handleBuyItem(itemId: string) {
    const name = shopItems.find((i) => i.id === itemId)?.name;
    return runAction(`buy:${itemId}`, async () => {
      await api.buyShopItem(itemId, 1);
      dispatch('refreshUser');
      await refreshInventory();
      showPanelNotice('ok', name ? `Comprado: ${name}.` : 'Compra hecha.', 'ui.purchase');
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
            <CurrencyPill kind="coins" amount={user.coins} sound />
            <CurrencyPill kind="gems" amount={user.gems} sound />
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
              <Ico n="ui:settings" active={dest === 'settings'} size={22} />
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
    {:else if !user}
      <AuthView {authApi} notice={authNotice} on:success={(e) => onAuthSuccess(e.detail)}>
        <!-- Sin sesión no hay Ajustes: el estado de la actualización se muestra aquí (aviso automático o bandeja). -->
        {#if $updateState.status !== 'idle'}
          <AboutPanel />
        {/if}
      </AuthView>
    {:else if user.emailVerified === false}
      <!-- Cuenta sin verificar: no se puede jugar hasta confirmar el correo -->
      <VerifyEmailView {authApi} email={user.email} on:success={() => onAuthSuccess()} on:logout={useOtherAccount} />
    {:else if user.handle === null}
      <!-- Cuenta sin nickname: hay que elegirlo antes de jugar (es único y no se podrá cambiar) -->
      <ChooseHandleView {authApi} on:success={() => onAuthSuccess()} on:logout={useOtherAccount} />
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
            <Ico n={n.icon} active={dest === n.id} size={22} />
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
          options={current.subs.map(([value, label]) => ({ value, label, icon: 'ui:' + value, badge: value === 'hatch' && readyEggs > 0 ? readyEggs : undefined }))}
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

        {:else if dest === 'pet' && sub === 'backpack'}
          <BackpackView
            {pet}
            {inventory}
            busy={busyAction}
            on:use={(e) => handleUseItem(e.detail)}
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
            switchLabel={(name) => `Sacar a ${name} al escritorio`}
          />

        {:else if dest === 'pet' && sub === 'bonding'}
          <BondingTab pet={pet} />

        {:else if dest === 'pet' && sub === 'mind'}
          <MindTab {pet} />

        {:else if dest === 'pet' && sub === 'wardrobe'}
          <WardrobeTab {pet} {user} on:refreshUser on:petUpdated={(e) => dispatch('petUpdated', e.detail)} />

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
            on:agentAction
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
          <SeasonsTab coins={user.coins} gems={user.gems} on:refreshUser />

        {:else if dest === 'shop' && sub === 'store'}
          <ShopView {shopItems} {inventory} coins={user.coins} busyItem={busyAction?.startsWith('buy:') ? busyAction.slice(4) : null} on:buy={(e) => handleBuyItem(e.detail)} />

        {:else if dest === 'shop' && sub === 'chests'}
          <ChestsTab on:refreshUser />

        {:else if dest === 'settings' && sub === 'account'}
          <AccountView {user} on:logout={() => { api.logout(); dispatch('logout'); }}>
            <RedeemVoucherCard slot="redeem" />
          </AccountView>

        {:else if dest === 'settings' && sub === 'notifications'}
          <NotificationSettingsPanel />

        {:else if dest === 'settings' && sub === 'sound'}
          <SoundSettingsPanel />
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
