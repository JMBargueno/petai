<script lang="ts">
  /** Visitas (feature 021): cuidar la mascota de un amigo, visitar su hábitat en vivo y ver el historial. */
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    api,
    VISIT_ENERGY_COST,
    VISIT_MESSAGE_MAX,
    type CoopFriend,
    type CoopVisitLog,
    type CoopVisitResult,
  } from '../lib/api';
  import { acceptedFriends } from '../lib/visitors';
  import { activeVisit, ongoingVisitFrom } from '../lib/activeVisit';
  import { friendlyError } from '../lib/ui/errors';
  import Ico from './Ico.svelte';
  import { Button, Notice } from './ui';
  import SocialAvatar from './SocialAvatar.svelte';
  import UserProfileModal from '../features/profile/UserProfileModal.svelte';
  import HomeScene from './HomeScene.svelte';
  import { Drumstick, Gamepad2, Droplets, Home, LogOut, PawPrint, RefreshCw, Users, AlertCircle, CircleCheck, History } from 'lucide-svelte';

  /** Amigo a preseleccionar (otherUserId), p. ej. al pulsar «Visitar» en Amigos. */
  export let initialFriend = '';

  const dispatch = createEventDispatcher();

  let friends: CoopFriend[] = [];
  let history: CoopVisitLog[] = [];
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  /** Amigo seleccionado (otherUserId). */
  let selected: string = initialFriend;
  /** Visita en vivo en curso: otherUserId del amigo visitado. Vive en un store para no perderla al cambiar de pestaña. */
  $: visiting = $activeVisit;
  /** Mensaje opcional que lleva tu Pockai a la visita. */
  let visitMessage = '';
  /** Perfil abierto (userId del amigo). */
  let profileOf = '';

  $: accepted = acceptedFriends(friends);
  $: selectedFriend = accepted.find((f) => f.otherUserId === selected) ?? null;

  /** El historial no trae el nombre; se recupera de la lista de amigos si es conocido. */
  function friendName(uid: string): string {
    return friends.find((f) => f.otherUserId === uid)?.otherDisplayName ?? 'Un amigo';
  }

  const ACTIONS = [
    { id: 'feed', label: 'Alimentar', icon: Drumstick, color: 'var(--color-ember)' },
    { id: 'play', label: 'Jugar', icon: Gamepad2, color: 'var(--color-sunburst)' },
    { id: 'clean', label: 'Limpiar', icon: Droplets, color: 'var(--color-electric-blue)' },
  ] as const;
  const ACTION_BY_ID: Record<string, (typeof ACTIONS)[number]> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

  /** Fecha corta y relativa para el historial. */
  function when(iso: string): string {
    const d = new Date(iso);
    const diff = Math.round((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return 'ahora';
    if (diff < 60) return `hace ${diff} min`;
    if (diff < 60 * 24) return `hace ${Math.round(diff / 60)} h`;
    if (diff < 60 * 24 * 7) return `hace ${Math.round(diff / 1440)} d`;
    return d.toLocaleDateString();
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [fr, hist] = await Promise.all([api.getCoopFriends(), api.getCoopHistory()]);
      friends = fr;
      history = hist?.visits ?? [];
      // Si la app se reinició con una visita abierta, se recupera del historial.
      if (!$activeVisit) activeVisit.set(ongoingVisitFrom(history));
      const acc = acceptedFriends(friends);
      if ($activeVisit && acc.some((f) => f.otherUserId === $activeVisit) && !initialFriend) selected = $activeVisit;
      if (acc.length && !acc.some((f) => f.otherUserId === selected)) {
        selected = acc[0].otherUserId;
      }
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron cargar las visitas.');
    } finally {
      loading = false;
    }
  }

  async function care(action: 'feed' | 'play' | 'clean') {
    const f = selectedFriend;
    if (!f?.otherPet?.petId) return;
    busy = action;
    error = '';
    ok = '';
    try {
      const res: CoopVisitResult = await api.coopVisit({
        ownerId: f.otherUserId,
        petId: f.otherPet.petId,
        action,
      });
      ok = `${res.message} +${res.xpGained} XP`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo hacer el cuidado.');
    } finally {
      busy = '';
    }
  }

  async function startVisit() {
    const f = selectedFriend;
    if (!f) return;
    busy = 'start';
    error = '';
    ok = '';
    try {
      await api.startHabitatVisit(f.otherUserId, visitMessage);
      activeVisit.set(f.otherUserId);
      visitMessage = '';
      ok = `¡Tu Pockai está de visita en el hábitat de ${f.otherDisplayName}!`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo iniciar la visita.');
    } finally {
      busy = '';
    }
  }

  async function endVisit() {
    busy = 'end';
    error = '';
    ok = '';
    try {
      await api.endHabitatVisit();
      activeVisit.set('');
      ok = 'Visita terminada. ¡Hasta la próxima!';
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo terminar la visita.');
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<div class="ui-stack">
  {#if error}<Notice tone="error" dismissible on:dismiss={() => (error = '')}>{error}</Notice>{/if}
  {#if ok}<Notice tone="ok">{ok}</Notice>{/if}
  {#if visiting && selectedFriend && visiting !== selectedFriend.otherUserId}
    <Notice tone="info" icon="home">
      Tu Pockai sigue de visita en casa de {friendName(visiting)}.
      <svelte:fragment slot="end"><Button variant="ghost" size="sm" disabled={!!busy} on:click={endVisit}>Terminar</Button></svelte:fragment>
    </Notice>
  {/if}

  {#if loading && !friends.length}
    <div class="ui-loading" aria-label="Cargando visitas">
      <div class="ui-skel"></div>
      <div class="ui-skel tall"></div>
    </div>
  {:else if accepted.length === 0}
    <div class="ui-empty">
      <span class="ui-empty__icon"><Users size={22} /></span>
      <strong>Nadie a quien visitar todavía</strong>
      <p>Cuando aceptéis una amistad podrás cuidar de su mascota y visitar su hábitat.</p>
      <Button variant="primary" size="sm" on:click={() => dispatch('goFriends')}>Ir a Amigos</Button>
    </div>
  {:else}
    <!-- Selector de amigo -->
    <section>
      <div class="ui-head">
        <span class="label-caps">¿A quién visitas?</span>
        <div class="ui-head__end">
          <button class="btn btn--ghost btn--icon ui-ibtn ui-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar visitas" on:click={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div class="picker" role="radiogroup" aria-label="Amigos">
        {#each accepted as f (f.id)}
          <button
            class="pick"
            class:on={selected === f.otherUserId}
            role="radio"
            aria-checked={selected === f.otherUserId}
            title={f.otherDisplayName}
            on:click={() => (selected = f.otherUserId)}
          >
            <SocialAvatar name={f.otherDisplayName} size={44} selected={selected === f.otherUserId} />
            <span class="pick-name">{f.otherDisplayName}</span>
            {#if f.otherHandle}<span class="pick-handle">@{f.otherHandle}</span>{/if}
            {#if visiting === f.otherUserId}<span class="pick-live">En visita</span>{/if}
          </button>
        {/each}
      </div>
    </section>

    {#if selectedFriend}
      {@const pet = selectedFriend.otherPet}
      <div class="visit-card">
        <HomeScene
          class="visit-scene"
          label="Casa de {selectedFriend.otherDisplayName}"
          mood={visiting === selectedFriend.otherUserId ? 'live' : 'day'}
          height={110}
          showRug={false}
          decor={false}
        >
          <span class="scene-pet" aria-hidden="true"><PawPrint size={34} /></span>
        </HomeScene>
        <div class="visit-body">
          <div class="visit-title">
            <span class="pet-name">{pet ? pet.nickname || pet.speciesName : 'Sin mascota'}</span>
            {#if pet?.nickname && pet.speciesName}<span class="chip ui-chip">{pet.speciesName}</span>{/if}
            <button class="btn btn--ghost btn--sm profile-btn" on:click={() => (profileOf = selectedFriend?.otherUserId ?? '')}>
              Ver perfil
            </button>
          </div>

          <div class="care-row">
            {#each ACTIONS as a (a.id)}
              <button class="care" style="--c: {a.color}" disabled={!pet?.petId || !!busy} aria-busy={busy === a.id || undefined} on:click={() => care(a.id)}>
                <span class="care-ico">{#if busy === a.id}<span class="ui-spinner" aria-hidden="true"></span>{:else}<svelte:component this={a.icon} size={16} />{/if}</span>
                {a.label}
              </button>
            {/each}
          </div>

          {#if visiting === selectedFriend.otherUserId}
            <Button block icon="logout" loading={busy === 'end'} disabled={!!busy} on:click={endVisit}>Terminar visita</Button>
          {:else}
            <label class="msg-field">
              <input
                class="input"
                type="text"
                bind:value={visitMessage}
                maxlength={VISIT_MESSAGE_MAX}
                placeholder="Deja un mensaje (opcional)"
                aria-label="Mensaje para tu amigo"
                disabled={!!busy}
              />
              <span class="msg-count">{visitMessage.length}/{VISIT_MESSAGE_MAX}</span>
            </label>
            <Button variant="primary" block icon="home" loading={busy === 'start'} disabled={!!busy || !!visiting} title={visiting ? 'Termina antes la visita en curso' : undefined} on:click={startVisit}>
              Iniciar visita · −{VISIT_ENERGY_COST} <Ico n="energy" size={14} />
            </Button>
          {/if}
          <p class="ui-card__hint">
            Tu Pockai aparecerá en la pantalla de tu amigo con tu mensaje. Gasta {VISIT_ENERGY_COST} de energía y
            puedes volver a visitar al mismo amigo cada 10 minutos.
          </p>
        </div>
      </div>
    {/if}
  {/if}

  {#if !(loading && !friends.length)}
    <!-- Historial -->
    <section class="ui-list">
      <div class="ui-head">
        <span class="label-caps">Historial</span>
        {#if history.length}<span class="chip ui-count">{history.length}</span>{/if}
      </div>
      {#each history.slice(0, 15) as h (h.id ?? h.createdAt + h.petId + h.visitorId)}
        {@const a = ACTION_BY_ID[h.action]}
        {@const who = h.otherName ?? friendName(h.visitorId)}
        <div class="hist-row">
          <span class="hist-ico" style="--c: {a?.color ?? 'var(--theme-social)'}">
            <svelte:component this={h.kind === 'habitat' ? Home : (a?.icon ?? PawPrint)} size={14} />
          </span>
          <div class="ui-row__body">
            <span class="hist-title" title="{h.direction === 'out' ? `Visitaste a ${who}` : who}">
              {#if h.direction === 'out'}Visitaste a {who}{:else}{who}{/if}
              · {h.kind === 'habitat' ? 'Visita al hábitat' : (a?.label ?? h.action)}
            </span>
            <span class="ui-row__sub">{when(h.createdAt)}</span>
          </div>
          {#if h.xpGained > 0}<span class="chip ui-chip hist-xp">+{h.xpGained} XP</span>{/if}
        </div>
      {:else}
        <div class="hist-empty"><History size={16} /> Todavía no hay visitas.</div>
      {/each}
    </section>
  {/if}
</div>

{#if profileOf}
  <UserProfileModal userId={profileOf} on:close={() => (profileOf = '')} />
{/if}

<style>
  .profile-btn {
    margin-left: auto;
  }
  .ui-skel.tall {
    height: 200px;
  }

  /* Selector de amigos */
  .picker {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-1) var(--space-1);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .pick {
    position: relative;
    flex: 0 0 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-2xl);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    transition: background var(--dur-1), color var(--dur-1);
  }
  .pick:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }
  .pick.on {
    color: var(--ink);
  }
  .pick-name {
    max-width: 100%;
    font-size: var(--text-caption);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-handle {
    max-width: 100%;
    margin-top: -5px;
    font-size: var(--text-caption);
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-live {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0 var(--space-1);
    font-size: var(--text-caption);
    font-weight: 800;
    border-radius: var(--radius-pills);
    background: var(--theme-social);
    color: var(--on-color);
    border: 1px solid var(--on-color);
  }

  /* Tarjeta del amigo */
  .visit-card {
    border: var(--outline);
    border-radius: var(--radius-cards);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .ui-stack :global(.visit-scene) {
    border-width: 0 0 1.5px;
    border-radius: 0;
  }
  .scene-pet {
    position: relative;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1.5px solid var(--on-color);
    background: #fffaf0;
    color: var(--on-color);
    animation: bob 3s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      translate: 0 -4px;
    }
  }
  .visit-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .visit-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .pet-name {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: var(--text-title);
    line-height: 1.05;
  }
  .care-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }
  .care {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-1) var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    color: var(--ink);
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--dur-1) var(--ease-out), border-color var(--dur-1), box-shadow var(--dur-1);
  }
  .care:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--line);
    box-shadow: 2px 3px 0 var(--line);
  }
  .care:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .care-ico {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: var(--radius-md);
    border: 1px solid var(--on-color);
    background: var(--c);
    color: var(--on-color);
  }
  .msg-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .msg-count {
    align-self: flex-end;
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }

  /* Historial */
  .hist-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    border: 1px solid var(--line-soft);
  }
  .hist-ico {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--on-color);
    background: var(--c);
    color: var(--on-color);
  }
  .hist-title {
    font-size: var(--text-caption);
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hist-xp {
    background: color-mix(in srgb, var(--success) 22%, var(--surface));
    color: var(--success-ink);
    border-color: var(--success);
  }
  .hist-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-pet {
      animation: none;
    }
  }
</style>
