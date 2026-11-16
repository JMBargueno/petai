<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { api, isTerminalError } from '../lib/api';
  import { petVoice } from '../lib/petVoice';
  import EggSprite from './EggSprite.svelte';
  import MinigamesTab from './MinigamesTab.svelte';
  import AiTab from './AiTab.svelte';
  import ArenaTab from './ArenaTab.svelte';
  import SeasonsTab from './SeasonsTab.svelte';
  import MissionsTab from './MissionsTab.svelte';
  import ChestsTab from './ChestsTab.svelte';
  import BondingTab from './BondingTab.svelte';
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
  import NotificationSettingsPanel from './NotificationSettingsPanel.svelte';
  import AboutPanel from './AboutPanel.svelte';
  import PockaiMark from './PockaiMark.svelte';
  import { updateState, hasUpdate } from '../lib/updater';
  import { PawPrint, Gamepad2, MessageCircle, Trophy, ShoppingBag, Settings, Coins, Gem, X, Drumstick, Sparkles, Zap, Droplets, Moon, Sun, Egg, LogOut, AlertCircle, Users } from 'lucide-svelte';

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

  const dispatch = createEventDispatcher();

  // Errores de las acciones: nunca con alert()/confirm() nativos (en Tauri abren un diálogo modal
  // "tauri.localhost dice" que congela la ventana). Los de negocio los dice la mascota en su
  // bocadillo; los terminales (sin conexión, servidor caído, sesión) van a un aviso en el panel.
  let panelError = '';
  let panelErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function showPanelError(message: string) {
    panelError = message;
    if (panelErrorTimer) clearTimeout(panelErrorTimer);
    panelErrorTimer = setTimeout(() => (panelError = ''), 6000);
  }

  function reportError(err: unknown) {
    const message = err instanceof Error && err.message ? err.message : 'Algo ha fallado';
    if (pet && !isTerminalError(err)) {
      dispatch('bubble', petVoice(message));
    } else {
      // fetch lanza TypeError cuando no hay red o el servidor no responde
      showPanelError(err instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : message);
    }
  }

  onDestroy(() => {
    endPanelDrag();
    if (panelErrorTimer) clearTimeout(panelErrorTimer);
    if (hatchClock) clearInterval(hatchClock);
  });

  // Navegación: 6 destinos con sub-secciones (docs/PANTALLAS.md §4.3).
  const NAV = [
    { id: 'pet', label: 'Mascota', icon: PawPrint, subs: [['home', 'Inicio'], ['hatch', 'Eclosión'], ['bonding', 'Vínculo'], ['habitat', 'Hábitat'], ['skills', 'Habilidades']] },
    { id: 'play', label: 'Jugar', icon: Gamepad2, subs: [['games', 'Minijuegos'], ['arena', 'Arena'], ['raid', 'Raid'], ['tournament', 'Torneo'], ['training', 'Entrenamiento'], ['cooking', 'Cocina'], ['adventure', 'Aventura']] },
    { id: 'chat', label: 'Chat', icon: MessageCircle, subs: [] },
    { id: 'social', label: 'Social', icon: Users, subs: [['friends', 'Amigos'], ['clans', 'Clanes'], ['visits', 'Visitas']] },
    { id: 'progress', label: 'Progreso', icon: Trophy, subs: [['missions', 'Misiones'], ['seasons', 'Temporada']] },
    { id: 'shop', label: 'Tienda', icon: ShoppingBag, subs: [['store', 'Tienda'], ['chests', 'Cofres']] },
    { id: 'settings', label: 'Ajustes', icon: Settings, subs: [['account', 'Cuenta'], ['notifications', 'Avisos'], ['about', 'Acerca de']] },
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
  let authInviteCode = '';
  let inviteRequired = false;
  let authError = '';
  let isLoading = false;

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

  /** Un huevo está listo cuando su hatchesAt ya venció (o si no lo trae, se considera listo). */
  function eggReady(egg: any): boolean {
    const t = new Date(egg?.hatchesAt)?.getTime?.();
    return t === undefined || Number.isNaN(t) || t <= now;
  }

  /** Texto de cuenta atrás para un huevo aún en incubación (vacío si ya está listo). */
  function eggCountdown(egg: any): string {
    const t = new Date(egg?.hatchesAt)?.getTime?.();
    if (t === undefined || Number.isNaN(t)) return '';
    const s = Math.max(0, Math.ceil((t - now) / 1000));
    if (s <= 0) return '';
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

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
        await api.register(authEmail, authPassword, authDisplayName || undefined, authInviteCode || undefined);
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
    if (!isLoginMode) inviteRequired = (await api.getRegistrationConfig()).inviteRequired;
  }

  async function handleFeed(itemId: string) {
    if (!pet) return;
    try {
      const updated = await api.feedPet(pet.id, itemId);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'eat');
      refreshInventory();
    } catch (err: any) {
      reportError(err);
    }
  }

  async function handleClean() {
    if (!pet) return;
    try {
      const updated = await api.cleanPet(pet.id);
      dispatch('petUpdated', updated);
      dispatch('actionTriggered', 'clean');
    } catch (err: any) {
      reportError(err);
    }
  }

  async function handleToggleSleep() {
    if (!pet) return;
    try {
      const waking = pet.sleeping;
      const updated = waking ? await api.wakePet(pet.id) : await api.sleepPet(pet.id);
      dispatch('petUpdated', updated);
      if (waking) dispatch('actionTriggered', 'wake');
    } catch (err: any) {
      reportError(err);
    }
  }

  async function handleHatch(eggId: string, nickname?: string) {
    // Vacío/espacios → undefined: el backend asigna un nombre aleatorio.
    const name = (nickname ?? '').trim();
    hatchingEggId = eggId;
    isShaking = true;

    setTimeout(() => {
      isCracking = true;
    }, 1500);

    setTimeout(async () => {
      try {
        const newPet = await api.hatchEgg(eggId, name || undefined);
        // Animación de eclosión antes de quitar el huevo de la lista
        isShaking = false;
        isCracking = false;
        isHatchingOut = true;
        await new Promise((r) => setTimeout(r, 900));
        hatchedResult = newPet;
        dispatch('petUpdated', newPet);
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
    }, 2800);
  }

  async function handleBuyEgg() {
    try {
      await api.buyEgg();
      dispatch('refreshEggs');
      dispatch('refreshUser');
    } catch (err: any) {
      reportError(err);
    }
  }

  async function handleBuyItem(itemId: string) {
    try {
      await api.buyShopItem(itemId, 1);
      dispatch('refreshUser');
      refreshInventory();
    } catch (err: any) {
      reportError(err);
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
        <span class="logo"><PockaiMark size={30} /><span class="display">Pockai</span></span>
        {#if user}
          <div class="user-pill">
            <span class="pill-coins" title="Monedas"><Coins size={14} /> {user.coins}</span>
            <span class="pill-gems" title="Gemas"><Gem size={14} /> {user.gems}</span>
          </div>
        {/if}
      </div>
      <button class="btn btn--ghost btn--icon close-btn" aria-label="Cerrar panel" on:click={() => dispatch('close')}><X size={18} /></button>
    </div>

    {#if !user}
      <div class="auth-section">
        <div class="auth-hero">
          <div class="auth-halo"><PockaiMark size={72} /></div>
          <span class="eyebrow">Pockai</span>
          <h3 class="display auth-title">{isLoginMode ? 'Iniciar sesión' : 'Crear cuenta'}</h3>
          <p class="subtitle">Conecta con tu mascota virtual</p>
        </div>

        <form class="card auth-form" on:submit|preventDefault={handleAuth}>
        {#if authError}
          <div class="error-msg auth-error" role="alert"><AlertCircle size={16} /> <span>{authError}</span></div>
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
              <small class="subtitle">El registro está limitado: necesitas un código de invitación.</small>
            {/if}
          </div>
        {/if}

        <button type="submit" class="btn btn--primary block auth-submit" disabled={isLoading}>
          {isLoading ? 'Cargando…' : isLoginMode ? 'Entrar' : 'Registrarse'}
        </button>
        </form>

        <button type="button" class="auth-toggle" on:click={toggleAuthMode}>
          {#if isLoginMode}¿No tienes cuenta? <strong>Regístrate</strong>{:else}¿Ya tienes cuenta? <strong>Inicia sesión</strong>{/if}
        </button>

        <!-- Sin sesión no hay Ajustes: el estado de la actualización se muestra aquí (aviso automático o bandeja). -->
        {#if $updateState.status !== 'idle'}
          <AboutPanel />
        {/if}
      </div>
    {:else}
      <!-- Destinos principales -->
      <nav class="nav-tabs" aria-label="Secciones">
        {#each NAV as n (n.id)}
          <button class:active={dest === n.id} aria-current={dest === n.id ? 'page' : undefined} on:click={() => go(n.id)}>
            <svelte:component this={n.icon} size={18} />
            <span>{n.label}</span>
            {#if n.id === 'pet' && eggs.length > 0}<span class="tab-badge">{eggs.length}</span>{/if}
            {#if n.id === 'settings' && hasUpdate($updateState)}<span class="tab-badge" title="Hay una versión nueva">1</span>{/if}
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

      {#if panelError}
        <div class="error-msg panel-error" role="alert">
          <span>{panelError}</span>
          <button class="btn btn--ghost btn--icon" aria-label="Cerrar aviso" on:click={() => (panelError = '')}><X size={14} /></button>
        </div>
      {/if}

      <div class="tab-content">
        {#if dest === 'pet' && sub === 'home'}
          {#if pet}
            <div class="pet-summary">
              <div class="card pet-hero">
                <div class="pet-hero__info">
                  <span class="pet-title">{pet.nickname || pet.species?.name}</span>
                  <div class="pet-tags">
                    {#if pet.species?.element}<span class="chip pet-tag">{pet.species.element}</span>{/if}
                    {#if pet.rarity}<span class="chip rarity-pill {pet.rarity}">{pet.rarity}</span>{/if}
                  </div>
                </div>
                <span class="chip level-tag">Nv. {pet.level}</span>
              </div>

              <div class="vitals-grid">
                {#each [
                  { label: 'Hambre', icon: Drumstick, value: pet.hunger, color: 'var(--color-ember)' },
                  { label: 'Felicidad', icon: Sparkles, value: pet.happiness, color: 'var(--color-sunburst)' },
                  { label: 'Energía', icon: Zap, value: pet.energy, color: 'var(--color-electric-blue)' },
                  { label: 'Higiene', icon: Droplets, value: pet.hygiene, color: 'var(--color-mint-pop)' },
                ] as v (v.label)}
                  <div class="vital-item" class:low={v.value < 25} style="--meter-color: {v.color}">
                    <div class="vital-label">
                      <span><span class="vital-icon"><svelte:component this={v.icon} size={13} /></span> {v.label}</span>
                      <span class="vital-value">{Math.round(v.value)}%</span>
                    </div>
                    <div class="meter"><i style="width: {v.value}%;"></i></div>
                  </div>
                {/each}
              </div>

              <div class="actions-row">
                <button class="btn action-btn" on:click={handleClean}><Droplets size={18} /> Bañar</button>
                <button class="btn action-btn" on:click={handleToggleSleep}>
                  {#if pet.sleeping}<Sun size={18} /> Despertar{:else}<Moon size={18} /> Dormir{/if}
                </button>
              </div>

              <div class="food-selector">
                <span class="label-caps muted">Alimentar desde inventario</span>
                <div class="food-chips">
                  {#each inventory as item}
                    <button class="chip food-chip" on:click={() => handleFeed(item.itemId)}>
                      <Drumstick size={13} /> {item.item.name} <span class="chip-qty">{item.qty}</span>
                    </button>
                  {:else}
                    <div class="food-empty">
                      <p class="empty-msg">No tienes alimentos.</p>
                      <button class="btn btn--sm" on:click={() => go('shop', 'store')}><ShoppingBag size={14} /> Ir a la tienda</button>
                    </div>
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
                <div class="egg-preview">
                  <EggSprite
                    anim={hatchingEggId !== egg.id ? 'idle' : isHatchingOut ? 'hatch' : isCracking ? 'crack' : isShaking ? 'shake' : 'idle'}
                  />
                </div>
                <div class="egg-info">
                  <span class="egg-type">Huevo {egg.eggType}</span>
                  {#if hatchingEggId === egg.id}
                    <span class="egg-state">¡Eclosionando…</span>
                  {:else if eggReady(egg)}
                    <div class="form-group egg-name-field">
                      <label for="egg-name-{egg.id}">Nombre (opcional)</label>
                      <input
                        class="input"
                        id="egg-name-{egg.id}"
                        type="text"
                        maxlength="16"
                        spellcheck="false"
                        autocomplete="off"
                        bind:value={eggNames[egg.id]}
                        placeholder="Vacío = nombre al azar"
                        on:keydown={(e) => e.key === 'Enter' && handleHatch(egg.id, eggNames[egg.id])}
                      />
                      <small class="egg-count">{(eggNames[egg.id] ?? '').length}/16</small>
                    </div>
                    <button class="btn btn--primary btn--sm" on:click={() => handleHatch(egg.id, eggNames[egg.id])}>
                      Eclosionar
                    </button>
                  {:else}
                    <span class="egg-state">Incubando · faltan {eggCountdown(egg)}</span>
                    <button class="btn btn--primary btn--sm" disabled>Incubando…</button>
                  {/if}
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
          <AiTab {pet} on:bubble on:refreshPet />

        {:else if dest === 'social' && sub === 'friends'}
          <FriendsTab />

        {:else if dest === 'social' && sub === 'clans'}
          <ClansTab />

        {:else if dest === 'social' && sub === 'visits'}
          <VisitTab on:refreshUser />

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
    z-index: 100;
    pointer-events: auto;
  }

  .panel-header {
    cursor: grab;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 10px 16px;
    background: color-mix(in srgb, var(--surface) 45%, transparent);
    border-bottom: 1px solid var(--line-soft);
  }
  .panel-header:active {
    cursor: grabbing;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }
  .logo .display {
    font-family: var(--font-display);
    font-size: 18px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    line-height: 1;
  }

  .user-pill {
    display: flex;
    gap: 6px;
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .user-pill span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px 3px 7px;
    border: var(--outline);
    border-radius: var(--radius-pills);
    background: var(--surface);
  }
  .pill-coins :global(svg) {
    color: var(--warning-ink);
  }
  .pill-gems :global(svg) {
    color: var(--color-electric-blue);
  }
  .close-btn {
    transition: background var(--dur-1), rotate var(--dur-1);
  }
  .close-btn:hover {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    rotate: 90deg;
  }

  .nav-tabs {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--line-soft);
  }
  .nav-tabs button {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 7px 0 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-2xl);
    color: var(--ink-muted);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-1), color var(--dur-1), box-shadow var(--dur-1), translate var(--dur-1);
  }
  .nav-tabs button :global(svg) {
    transition: translate var(--dur-1);
  }
  .nav-tabs button:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, transparent);
  }
  .nav-tabs button:hover :global(svg) {
    translate: 0 -1px;
  }
  .nav-tabs button.active {
    color: var(--on-color);
    background: var(--color-sunburst);
    border-color: var(--color-carbon);
    box-shadow: 2px 3px 0 var(--color-carbon);
    translate: -1px -1px;
  }
  .nav-tabs button:focus-visible,
  .sub-tabs button:focus-visible,
  .auth-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tab-badge {
    position: absolute;
    top: -4px;
    right: 4px;
    min-width: 16px;
    padding: 0 4px;
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    background: var(--danger);
    color: var(--on-dark);
    font-size: 10px;
    line-height: 14px;
    text-align: center;
  }

  .sub-tabs {
    display: flex;
    gap: 6px;
    padding: 10px 12px 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sub-tabs::-webkit-scrollbar {
    display: none;
  }
  .sub-tabs button {
    padding: 5px 12px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pills);
    background: var(--surface);
    color: var(--ink-muted);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--dur-1), color var(--dur-1), border-color var(--dur-1);
  }
  .sub-tabs button:hover {
    color: var(--ink);
    border-color: var(--line);
  }
  .sub-tabs button.active {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
  }

  .tab-content {
    padding: 16px;
    overflow-y: auto;
    user-select: text;
  }

  .pet-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
    padding: 14px 16px;
    background:
      radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-sunburst) 28%, transparent), transparent 60%),
      var(--surface);
    box-shadow: var(--shadow-pop);
  }
  .pet-hero__info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .pet-title {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: 22px;
    line-height: 1.05;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pet-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pet-tag {
    text-transform: uppercase;
    font-size: 10px;
    padding: 2px 8px;
    background: var(--surface-2);
  }
  .pet-tags .rarity-pill {
    font-size: 10px;
    padding: 2px 8px;
    border-color: var(--color-carbon);
  }
  .level-tag {
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 800;
    background: var(--color-sunburst);
    color: var(--on-color);
    border-color: var(--color-carbon);
    box-shadow: 2px 2px 0 var(--color-carbon);
  }

  .vitals-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .vital-item {
    padding: 10px 12px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .vital-item.low {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }
  .vital-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--ink-muted);
  }
  .vital-label > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .vital-icon {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1px solid var(--color-carbon);
    border-radius: 8px;
    background: var(--meter-color);
    color: var(--on-color);
  }
  .vital-value {
    color: var(--ink);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .vital-item.low .vital-value {
    color: var(--danger-ink);
  }
  .vital-item .meter {
    height: 8px;
  }

  .actions-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .action-btn {
    flex: 1;
    min-height: 44px;
  }

  .food-selector {
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
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
    padding: 4px 4px 4px 10px;
    background: var(--color-mint-pop);
    color: var(--on-color);
    border-color: var(--color-carbon);
    transition: translate var(--dur-1), box-shadow var(--dur-1);
  }
  .food-chip:hover {
    translate: -1px -1px;
    box-shadow: 2px 2px 0 var(--color-carbon);
  }
  .chip-qty {
    min-width: 20px;
    padding: 0 6px;
    border-radius: var(--radius-pills);
    background: var(--color-carbon);
    color: var(--color-paper-white);
    font-weight: 800;
    font-size: 11px;
    text-align: center;
  }
  .food-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding-bottom: 4px;
  }
  .food-empty .empty-msg {
    padding: 4px 0 0;
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
    flex: 1;
    min-width: 0;
  }
  .egg-type {
    font-weight: 700;
  }
  .egg-state {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .egg-name-field {
    margin-bottom: 0;
    gap: 4px;
    width: 100%;
  }
  .egg-name-field .input {
    width: 100%;
  }
  .egg-count {
    font-size: 11px;
    color: var(--ink-muted);
    text-align: right;
  }
  .egg-preview {
    width: 64px;
    height: 64px;
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
    padding: 22px 20px 18px;
    overflow-y: auto;
  }
  .auth-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 16px;
  }
  .auth-halo {
    display: grid;
    place-items: center;
    width: 104px;
    height: 104px;
    margin-bottom: 10px;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--color-sunburst) 45%, transparent) 0%, transparent 70%);
  }
  .auth-title {
    margin: 8px 0 4px;
    font-size: 28px;
  }
  .subtitle {
    font-size: 13px;
    color: var(--ink-muted);
    margin: 0 0 14px;
  }
  .auth-hero .subtitle {
    margin: 0;
  }
  .auth-form {
    padding: 18px;
    border-radius: var(--radius-cards-elevated);
  }
  .auth-form .form-group:last-of-type {
    margin-bottom: 4px;
  }
  .auth-error {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .auth-error :global(svg) {
    flex-shrink: 0;
  }
  .auth-submit {
    min-height: 44px;
    margin-top: 10px;
  }
  .auth-toggle {
    display: block;
    margin: 14px auto 0;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius-pills);
    background: transparent;
    color: var(--ink-muted);
    font-size: 13px;
    cursor: pointer;
  }
  .auth-toggle strong {
    color: var(--accent-ink);
  }
  .auth-toggle:hover strong {
    text-decoration: underline;
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
  .panel-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 10px 12px 0;
  }
  .panel-error .btn {
    color: inherit;
  }
  .empty-msg {
    font-size: 12px;
    color: var(--ink-muted);
    text-align: center;
    padding: 12px 0;
    margin: 0;
  }
</style>
