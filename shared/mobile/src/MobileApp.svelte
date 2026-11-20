<script lang="ts">
  /**
   * El shell de la app móvil, común a Android e iOS: la barra de pestañas con sus secciones, el
   * enrutado por fase (arrancando, sin sesión, con un paso de alta pendiente, dentro) y los momentos
   * que no son de una sola pantalla (la iniciativa de la mascota, la eclosión, el canje de un
   * código, el saldo de la cabecera).
   *
   * Aquí no hay nada de una plataforma concreta: lo que cambia entre las dos apps entra por
   * `config` (`./config.ts`), y el aspecto de cada sistema lo pone `@pockai/ui` por `data-platform`.
   */
  import { onMount, untrack } from 'svelte';
  import { AccountView, AppearancePicker, AuthView, BackpackView, Button, Card, ChooseHandleView, CurrencyPill, HatchView, Ico, Notice, PetHomeView, RedeemCodeCard, RewardToast, Segmented, ShopView, SoundSettingsView, VerifyEmailView, createInitiativeLoop, redeemErrorText, rewardToCelebrate, type InitiativeReply } from '@pockai/ui';
  import { stateSelectPet } from '@pockai/client';
  import AdventureScreen from './screens/AdventureScreen.svelte';
  import ArenaScreen from './screens/ArenaScreen.svelte';
  import BondingScreen from './screens/BondingScreen.svelte';
  import ChatScreen from './screens/ChatScreen.svelte';
  import ChestsScreen from './screens/ChestsScreen.svelte';
  import ClansScreen from './screens/ClansScreen.svelte';
  import CookingScreen from './screens/CookingScreen.svelte';
  import FriendsScreen from './screens/FriendsScreen.svelte';
  import HabitatScreen from './screens/HabitatScreen.svelte';
  import MindScreen from './screens/MindScreen.svelte';
  import MinigamesScreen from './screens/MinigamesScreen.svelte';
  import MissionsScreen from './screens/MissionsScreen.svelte';
  import ProfileScreen from './screens/ProfileScreen.svelte';
  import RaidScreen from './screens/RaidScreen.svelte';
  import SeasonScreen from './screens/SeasonScreen.svelte';
  import TournamentScreen from './screens/TournamentScreen.svelte';
  import TrainingScreen from './screens/TrainingScreen.svelte';
  import VisitsScreen from './screens/VisitsScreen.svelte';
  import WardrobeScreen from './screens/WardrobeScreen.svelte';
  import { act, activePet, authApi, failureText, hasCore, lock, offline, phase, redeemCode, reload, signOut, start, state as core } from './core';
  import { askNotificationsOnce } from './notifications';
  import { audioSettings, previewSound, updateAudioSettings } from './audio';
  import { firstSection, type MobileConfig, type TabId } from './config';

  /**
   * La configuración de la app que monta este shell (`apps/android`, `apps/ios`): su plataforma, su
   * barra de pestañas y sus secciones. Todo lo demás es igual en las dos.
   */
  let { config }: { config: MobileConfig } = $props();

  /** Lo que tarda la lente en llegar al destino nuevo. El mismo valor que `--dur-2` en los tokens. */
  const LENS_TRAVEL_MS = 300;

  let tab = $state<TabId>('pet');
  /**
   * Secciones dentro de una pestaña, como en el escritorio (Mascota › Inicio, Vínculo, Eclosión).
   * Cada una arranca en la primera de su lista; `untrack` deja claro que de la configuración solo se
   * toma el valor de partida (no cambia en caliente, igual que la plataforma).
   */
  let petSection = $state(untrack(() => firstSection(config, 'pet')));
  let progressSection = $state(untrack(() => firstSection(config, 'progress')));
  let playSection = $state(untrack(() => firstSection(config, 'play')));
  let shopSection = $state(untrack(() => firstSection(config, 'shop')));
  let accountSection = $state(untrack(() => firstSection(config, 'account')));
  /** Amigo que se eligió con «Visitar» en Amigos. */
  let visitFriend = $state('');
  /** Qué se está haciendo ahora (`buy:<id>`, `use:<id>`, `sleep`…), o `null`. Bloquea los botones. */
  let busy = $state<string | null>(null);
  let message = $state('');

  /** Eclosión en curso: qué huevo, quién ha nacido y los nombres que el jugador va escribiendo. */
  let hatchingEggId = $state<string | null>(null);
  let hatched = $state<any>(null);
  let eggNames = $state<Record<string, string>>({});
  /** Reloj de las cuentas atrás de los huevos. */
  let now = $state(Date.now());

  const pet = $derived(activePet($core));
  /** Qué pestaña de la barra está activa, o -1 si la de ahora no sale en ella (Cuenta). */
  const activeTabIndex = $derived(config.tabs.findIndex((t) => t.id === tab));
  /**
   * La lente de la barra se estira mientras viaja de un destino a otro, como una gota de líquido
   * que se alarga al moverse y recupera su forma al llegar. Dura lo que el desplazamiento.
   */
  let lensMoving = $state(false);
  let lensTimer: ReturnType<typeof setTimeout> | undefined;
  function goToTab(id: TabId) {
    if (id === tab) return;
    tab = id;
    lensMoving = true;
    clearTimeout(lensTimer);
    lensTimer = setTimeout(() => (lensMoving = false), LENS_TRAVEL_MS);
  }

  /**
   * Iniciativa (spec 41): la mascota habla por su cuenta. Qué dice y cuándo lo decide el servidor;
   * aquí solo se le pregunta y se enseña en Inicio. Abrir la app o volver a ella cuenta como «el
   * entrenador ha vuelto» (el servidor saluda una sola vez por ausencia).
   */
  let petSays = $state('');
  let initiativeOn = false;
  const initiative = createInitiativeLoop({
    ask: async (back) => {
      if (!pet?.id) return null;
      return (await act({ type: 'petInitiative', petId: String(pet.id), back, focus: false })) as InitiativeReply;
    },
    say: (text) => (petSays = text),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  $effect(() => {
    const on = $phase === 'ready' && !!pet?.id;
    if (on === initiativeOn) return;
    initiativeOn = on;
    if (on) {
      initiative.start();
      void initiative.ownerBack();
    } else {
      initiative.stop();
      petSays = '';
    }
  });
  function onVisible() {
    if (document.visibilityState === 'visible' && initiativeOn) void initiative.ownerBack();
  }
  const coins = $derived(Number($core.user?.coins ?? 0));
  onMount(() => {
    if (hasCore()) void start().catch((e) => (message = failureText(e, 'No se pudo arrancar')));
    const clock = setInterval(() => (now = Date.now()), 1000);
    // Con sesión, el permiso para los avisos de cuidado en segundo plano (una sola vez).
    // Cada cambio de fase es otra pantalla: se empieza arriba (el alta es larga y deja la página bajada).
    const unphase = phase.subscribe((p) => {
      window.scrollTo(0, 0);
      if (p === 'ready' && config.askNotifications) void askNotificationsOnce();
    });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      initiative.stop();
      clearInterval(clock);
      clearTimeout(lensTimer);
      unphase();
    };
  });

  /** Eclosiona un huevo. El huevo tiembla mientras responde el servidor; quién nace lo dice él. */
  async function hatch(eggId: string, name?: string) {
    if (hatchingEggId || busy) return;
    hatchingEggId = eggId;
    hatched = null;
    message = '';
    try {
      hatched = await act({ type: 'hatchEgg', eggId, nickname: name?.trim() || null });
      delete eggNames[eggId];
    } catch (e) {
      message = failureText(e, 'No se pudo eclosionar');
    } finally {
      hatchingEggId = null;
    }
  }

  /** Hace algo y, si falla, se lo dice al jugador. El estado lo actualiza el núcleo. */
  async function run(key: string, fallback: string, fn: () => Promise<unknown>) {
    if (busy) return;
    busy = key;
    message = '';
    try {
      await fn();
    } catch (e) {
      message = failureText(e, fallback);
    } finally {
      busy = null;
    }
  }

  /** Tras entrar, darse de alta o completar un paso de alta, el núcleo recarga y decide la fase. */
  const onAuth = () => run('auth', 'No se pudo cargar tu cuenta', reload);

  const leave = () => run('signOut', 'No se pudo cerrar la sesión', signOut);

  /** Cuenta › Canjear código: lo recibido se celebra con `RewardToast`. */
  let redeemBusy = $state(false);
  let redeemError = $state('');
  let redeemOk = $state('');
  async function redeem(code: string) {
    if (redeemBusy) return;
    redeemBusy = true;
    redeemError = redeemOk = '';
    try {
      await redeemCode(code);
      redeemOk = '¡Código canjeado! Mira tu recompensa.';
    } catch (e) {
      redeemError = redeemErrorText((e as { status?: number } | null)?.status, failureText(e, 'No se pudo canjear el código.'));
    } finally {
      redeemBusy = false;
    }
  }

  /** A dónde lleva cada «ir a…» de las vistas compartidas. Lo que aún no existe aquí se queda en Mascota. */
  function go(dest: string, sub?: string) {
    tab = dest === 'shop' ? 'shop' : 'pet';
    if (tab === 'pet') petSection = sub === 'hatch' ? 'eggs' : 'home';
    else shopSection = sub === 'chests' ? 'chests' : 'store';
  }
</script>

<main class:centered={$phase === 'signedOut' || $phase === 'starting'}>
  {#if !hasCore()}
    <Card title="Pockai" icon="paw">
      <p>{config.noCoreText}</p>
    </Card>
  {:else if $phase === 'starting'}
    <p class="muted" aria-live="polite">Despertando a tu Pockai…</p>
  {:else if $phase === 'signedOut'}
    <AuthView {authApi} on:success={onAuth} />
  {:else if $phase === 'locked' && $lock === 'unverified'}
    <VerifyEmailView {authApi} email={String($core.user?.email ?? '')} on:success={onAuth} on:logout={leave} />
  {:else if $phase === 'locked'}
    <ChooseHandleView {authApi} on:success={onAuth} on:logout={leave} />
  {:else}
    <header>
      <button type="button" class="who" class:active={tab === 'account'} aria-label="Cuenta" onclick={() => (tab = 'account')}>
        <Ico n="user" size={18} />
        <strong>{$core.user?.displayName ?? $core.user?.email ?? 'Pockai'}</strong>
      </button>
      <span class="wallet">
        <CurrencyPill kind="coins" amount={coins} />
        <CurrencyPill kind="gems" amount={Number($core.user?.gems ?? 0)} />
      </span>
    </header>

    {#if $offline}
      <Notice tone="warning">Sin conexión: esto es lo último que se guardó.</Notice>
    {/if}
    {#if message}
      <Notice tone="error" dismissible on:dismiss={() => (message = '')}>{message}</Notice>
    {/if}

    <div class="screen">
      {#if tab === 'pet'}
        <Segmented variant="pills" label="Sección de Mascota" value={petSection} options={config.sections.pet} on:change={(e) => (petSection = e.detail)} />
      {/if}
      {#if tab === 'pet' && petSection === 'home'}
        {#if petSays}
          <Notice tone="info" icon="chat"><strong>{String(pet?.nickname || (pet?.species as { name?: string } | undefined)?.name || 'Tu Pockai')} dice:</strong> «{petSays}»</Notice>
        {/if}
        <!-- La misma ficha que el escritorio. Aquí la mascota no sale de su hábitat: sin «A casa». -->
        <PetHomeView
          {pet}
          pets={$core.pets}
          inventory={$core.inventory}
          {busy}
          habitatToggle={false}
          on:clean={() => pet && run('clean', 'No se pudo bañar', () => act({ type: 'clean', petId: pet.id }))}
          on:toggleSleep={() =>
            pet &&
            run('sleep', pet.sleeping ? 'No se pudo despertar' : 'No se pudo dormir', () =>
              act({ type: pet.sleeping ? 'wake' : 'sleep', petId: pet.id }),
            )}
          on:feed={(e) => pet && run(`feed:${e.detail}`, 'No se pudo dar de comer', () => act({ type: 'feed', petId: pet.id, itemId: String(e.detail) }))}
          on:selectPet={(e) => run('selectPet', 'No se pudo cambiar de mascota', () => stateSelectPet(String(e.detail)))}
          on:go={(e) => go(e.detail.dest, e.detail.sub)}
        />
      {:else if tab === 'pet' && petSection === 'chat'}
        <ChatScreen {pet} />
      {:else if tab === 'pet' && petSection === 'habitat'}
        <HabitatScreen {pet} user={$core.user} />
      {:else if tab === 'pet' && petSection === 'mind'}
        <MindScreen {pet} />
      {:else if tab === 'pet' && petSection === 'wardrobe'}
        <WardrobeScreen {pet} user={$core.user} />
      {:else if tab === 'pet' && petSection === 'bond'}
        <BondingScreen petId={pet?.id ?? null} />
      {:else if tab === 'pet'}
        <HatchView
          eggs={$core.eggs}
          bind:eggNames
          {now}
          {hatchingEggId}
          isShaking={hatchingEggId !== null}
          hatchedResult={hatched}
          activePetId={pet?.id ?? null}
          {coins}
          buying={busy === 'buy:egg'}
          on:hatch={(e) => hatch(e.detail.id, e.detail.name)}
          on:buyEgg={() => run('buy:egg', 'No se pudo comprar el huevo', () => act({ type: 'buyEgg' }))}
          on:selectPet={(e) => run('selectPet', 'No se pudo cambiar de mascota', () => stateSelectPet(String(e.detail)))}
          on:dismissResult={() => (hatched = null)}
        />
      {:else if tab === 'backpack'}
        <!-- La misma pantalla que el escritorio: aquí solo se atiende lo que pide el jugador. -->
        <BackpackView
          {pet}
          inventory={$core.inventory}
          {busy}
          on:use={(e) => pet && run(`use:${e.detail}`, 'No se pudo usar el objeto', () => act({ type: 'useItem', petId: pet.id, itemId: e.detail }))}
          on:go={() => (tab = 'shop')}
        />
      {:else if tab === 'progress'}
        <Segmented variant="pills" label="Sección de Progreso" value={progressSection} options={config.sections.progress} on:change={(e) => (progressSection = e.detail)} />
        {#if progressSection === 'missions'}
          <MissionsScreen />
        {:else}
          <SeasonScreen {coins} gems={Number($core.user?.gems ?? 0)} />
        {/if}
      {:else if tab === 'play'}
        <Segmented variant="pills" label="Sección de Jugar" value={playSection} options={config.sections.play} on:change={(e) => (playSection = e.detail)} />
        {#if playSection === 'games'}
          <MinigamesScreen {pet} />
        {:else if playSection === 'arena'}
          <ArenaScreen {pet} />
        {:else if playSection === 'raid'}
          <RaidScreen {pet} />
        {:else if playSection === 'tournament'}
          <TournamentScreen {pet} />
        {:else if playSection === 'training'}
          <TrainingScreen {pet} />
        {:else if playSection === 'cooking'}
          <CookingScreen {pet} />
        {:else}
          <AdventureScreen {pet} />
        {/if}
      {:else if tab === 'account'}
        <Segmented variant="pills" label="Sección de Cuenta" value={accountSection} options={config.sections.account} on:change={(e) => (accountSection = e.detail)} />
        {#if accountSection === 'profile'}
          <ProfileScreen />
        {:else if accountSection === 'friends'}
          <FriendsScreen onVisit={(userId) => { visitFriend = userId; accountSection = 'visits'; }} />
        {:else if accountSection === 'clans'}
          <ClansScreen />
        {:else if accountSection === 'visits'}
          {#key visitFriend}
            <VisitsScreen initialFriend={visitFriend} onGoFriends={() => (accountSection = 'friends')} />
          {/key}
        {:else if accountSection === 'settings'}
          <Card title="Apariencia" icon="sun">
            <AppearancePicker />
          </Card>
          <!-- En el móvil solo suenan efectos e interfaz (la voz de la mascota y el ambiente no van en el APK). -->
          <SoundSettingsView settings={$audioSettings} buses={config.audio.buses} previews={config.audio.previews} on:change={(e) => updateAudioSettings(e.detail)} on:preview={(e) => previewSound(e.detail)} />
        {:else}
          <AccountView user={$core.user} on:logout={leave}>
            <RedeemCodeCard slot="redeem" busy={redeemBusy} error={redeemError} ok={redeemOk} on:redeem={(e) => redeem(e.detail)} />
          </AccountView>
        {/if}
      {:else}
        <Segmented variant="pills" label="Sección de Tienda" value={shopSection} options={config.sections.shop} on:change={(e) => (shopSection = e.detail)} />
        {#if shopSection === 'chests'}
          <ChestsScreen {coins} gems={Number($core.user?.gems ?? 0)} />
        {:else}
        <ShopView
          shopItems={$core.shop}
          inventory={$core.inventory}
          {coins}
          busyItem={busy?.startsWith('buy:') ? busy.slice(4) : null}
          on:buy={(e) => run(`buy:${e.detail}`, 'No se pudo comprar', () => act({ type: 'buyItem', itemId: e.detail, quantity: 1 }))}
        />
        {/if}
      {/if}
    </div>

    <!--
      `--tab-count` y `--tab-index` los usa iOS para deslizar la lente hasta la pestaña activa. Con
      `-1` (la pestaña Cuenta, que no está en la barra) la lente se esconde.
      `aria-label` en cada botón: en iOS el texto no se ve, y sin él el botón se quedaría sin nombre.
    -->
    <nav
      class="tabbar"
      class:no-lens={activeTabIndex < 0}
      class:lens-moving={lensMoving}
      aria-label="Secciones"
      style="--tab-count: {config.tabs.length}; --tab-index: {activeTabIndex};"
    >
      {#each config.tabs as item (item.id)}
        <button
          type="button"
          class:active={tab === item.id}
          aria-current={tab === item.id ? 'page' : undefined}
          aria-label={item.label}
          onclick={() => goToTab(item.id)}
        >
          <span class="tab-icon"><Ico n={item.icon} active={tab === item.id} size={26} /></span>
          <span class="tab-label">{item.label}</span>
        </button>
      {/each}
    </nav>
  {/if}

  {#if message && $phase !== 'ready'}
    <Notice tone="error">{message}</Notice>
  {/if}
</main>

<RewardToast payload={$rewardToCelebrate} onDismiss={() => rewardToCelebrate.set(null)} />
