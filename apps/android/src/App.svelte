<script lang="ts">
  import { onMount } from 'svelte';
  import { AccountView, BackpackView, Button, Card, CurrencyPill, HatchView, Ico, Notice, PetHomeView, Segmented, ShopView } from '@pockai/ui';
  import { stateSelectPet } from '@pockai/client';
  import ArenaScreen from './screens/ArenaScreen.svelte';
  import BondingScreen from './screens/BondingScreen.svelte';
  import ChestsScreen from './screens/ChestsScreen.svelte';
  import CookingScreen from './screens/CookingScreen.svelte';
  import MissionsScreen from './screens/MissionsScreen.svelte';
  import RaidScreen from './screens/RaidScreen.svelte';
  import SeasonScreen from './screens/SeasonScreen.svelte';
  import TournamentScreen from './screens/TournamentScreen.svelte';
  import TrainingScreen from './screens/TrainingScreen.svelte';
  import WardrobeScreen from './screens/WardrobeScreen.svelte';
  import { act, activePet, failureText, hasCore, offline, phase, signIn, signOut, start, state as core } from './core';

  type Tab = 'pet' | 'backpack' | 'play' | 'shop' | 'progress' | 'account';
  /** Cuenta no está en la barra: se abre tocando el nombre de la cabecera (seis pestañas no caben a 48 px). */
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'pet', label: 'Mascota', icon: 'paw' },
    { id: 'backpack', label: 'Mochila', icon: 'gift' },
    { id: 'play', label: 'Jugar', icon: 'gamepad' },
    { id: 'shop', label: 'Tienda', icon: 'shop' },
    { id: 'progress', label: 'Progreso', icon: 'trophy' },
  ];

  let email = $state('');
  let password = $state('');
  let tab = $state<Tab>('pet');
  /** Secciones dentro de una pestaña, como en el escritorio (Mascota › Inicio, Vínculo, Eclosión). */
  let petSection = $state<'home' | 'bond' | 'eggs' | 'wardrobe'>('home');
  let progressSection = $state<'missions' | 'season'>('missions');
  let playSection = $state<'arena' | 'raid' | 'tournament' | 'training' | 'cooking'>('arena');
  let shopSection = $state<'store' | 'chests'>('store');
  const PLAY_SECTIONS = [
    { value: 'arena', label: 'Arena', icon: 'medal' },
    { value: 'raid', label: 'Raid', icon: 'swords' },
    { value: 'tournament', label: 'Torneo', icon: 'trophy' },
    { value: 'training', label: 'Entrenar', icon: 'castle' },
    { value: 'cooking', label: 'Cocina', icon: 'chef' },
  ];
  const SHOP_SECTIONS = [
    { value: 'store', label: 'Tienda', icon: 'shop' },
    { value: 'chests', label: 'Cofres', icon: 'gift' },
  ];
  const PET_SECTIONS = [
    { value: 'home', label: 'Inicio', icon: 'home' },
    { value: 'bond', label: 'Vínculo', icon: 'bond' },
    { value: 'eggs', label: 'Huevos', icon: 'egg' },
    { value: 'wardrobe', label: 'Armario', icon: 'star' },
  ];
  const PROGRESS_SECTIONS = [
    { value: 'missions', label: 'Misiones', icon: 'target' },
    { value: 'season', label: 'Temporada', icon: 'trophy' },
  ];
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
  const coins = $derived(Number($core.user?.coins ?? 0));
  onMount(() => {
    if (hasCore()) void start().catch((e) => (message = failureText(e, 'No se pudo arrancar')));
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(clock);
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

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void run('signIn', 'No se pudo iniciar sesión', () => signIn(email.trim(), password));
  }

  const leave = () => run('signOut', 'No se pudo cerrar la sesión', signOut);

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
      <p>Esta pantalla es la app de Android: ábrela desde la app, no desde el navegador.</p>
    </Card>
  {:else if $phase === 'starting'}
    <p class="muted" aria-live="polite">Despertando a tu Pockai…</p>
  {:else if $phase === 'signedOut'}
    <Card variant="pop">
      <form onsubmit={submit}>
        <h1 class="display">Pockai</h1>
        <p class="muted">Conecta con tu mascota virtual</p>
        <label>
          Correo electrónico
          <input class="input" type="email" bind:value={email} autocomplete="username" inputmode="email" required />
        </label>
        <label>
          Contraseña
          <input class="input" type="password" bind:value={password} autocomplete="current-password" required />
        </label>
        <Button variant="primary" size="lg" block type="submit" loading={busy === 'signIn'}>Entrar</Button>
      </form>
    </Card>
  {:else if $phase === 'locked'}
    <Card title="Falta un paso" icon="lock">
      <p>Verifica tu correo o elige tu nickname desde la app de escritorio para seguir.</p>
      <Button size="lg" block on:click={leave}>Usar otra cuenta</Button>
    </Card>
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
        <Segmented variant="pills" label="Sección de Mascota" value={petSection} options={PET_SECTIONS} on:change={(e) => (petSection = e.detail)} />
      {/if}
      {#if tab === 'pet' && petSection === 'home'}
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
        <Segmented variant="pills" label="Sección de Progreso" value={progressSection} options={PROGRESS_SECTIONS} on:change={(e) => (progressSection = e.detail)} />
        {#if progressSection === 'missions'}
          <MissionsScreen />
        {:else}
          <SeasonScreen {coins} gems={Number($core.user?.gems ?? 0)} />
        {/if}
      {:else if tab === 'play'}
        <Segmented variant="pills" label="Sección de Jugar" value={playSection} options={PLAY_SECTIONS} on:change={(e) => (playSection = e.detail)} />
        {#if playSection === 'arena'}
          <ArenaScreen {pet} />
        {:else if playSection === 'raid'}
          <RaidScreen {pet} />
        {:else if playSection === 'tournament'}
          <TournamentScreen {pet} />
        {:else if playSection === 'training'}
          <TrainingScreen {pet} />
        {:else}
          <CookingScreen {pet} />
        {/if}
      {:else if tab === 'account'}
        <AccountView user={$core.user} on:logout={leave} />
      {:else}
        <Segmented variant="pills" label="Sección de Tienda" value={shopSection} options={SHOP_SECTIONS} on:change={(e) => (shopSection = e.detail)} />
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

    <nav aria-label="Secciones">
      {#each TABS as item (item.id)}
        <button type="button" class:active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} onclick={() => (tab = item.id)}>
          <Ico n={item.icon} size={22} />
          <span>{item.label}</span>
        </button>
      {/each}
    </nav>
  {/if}

  {#if message && $phase !== 'ready'}
    <Notice tone="error">{message}</Notice>
  {/if}
</main>
