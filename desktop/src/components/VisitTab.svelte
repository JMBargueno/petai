<script lang="ts">
  /** Visitas (feature 021): cuidar la mascota de un amigo, visitar su hábitat en vivo y ver el historial. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type CoopFriend, type CoopVisitLog, type CoopVisitResult } from '../lib/api';
  import { acceptedFriends } from '../lib/visitors';
  import SocialAvatar from './SocialAvatar.svelte';
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
  /** Visita en vivo en curso: otherUserId del amigo visitado (estado local). */
  let visiting: string = '';

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
      const acc = acceptedFriends(friends);
      if (acc.length && !acc.some((f) => f.otherUserId === selected)) {
        selected = acc[0].otherUserId;
      }
    } catch (e: any) {
      error = e.message;
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
      error = e.message;
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
      await api.startHabitatVisit(f.otherUserId);
      visiting = f.otherUserId;
      ok = `¡Visitando el hábitat de ${f.otherDisplayName}! Su mascota aparecerá en tu pantalla.`;
      await load();
    } catch (e: any) {
      error = e.message;
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
      visiting = '';
      ok = 'Visita terminada. ¡Hasta la próxima!';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

<div class="soc">
  {#if error}<div class="soc-notice soc-notice--error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>{/if}
  {#if ok}<div class="soc-notice soc-notice--ok" role="status"><CircleCheck size={15} /><span>{ok}</span></div>{/if}

  {#if loading && !friends.length}
    <div class="soc-loading" aria-label="Cargando visitas">
      <div class="soc-skel"></div>
      <div class="soc-skel tall"></div>
    </div>
  {:else if accepted.length === 0}
    <div class="soc-empty">
      <span class="soc-empty__icon"><Users size={22} /></span>
      <strong>Nadie a quien visitar todavía</strong>
      <p>Cuando aceptéis una amistad podrás cuidar de su mascota y visitar su hábitat.</p>
      <button class="btn btn--sm btn--primary" on:click={() => dispatch('goFriends')}>Ir a Amigos</button>
    </div>
  {:else}
    <!-- Selector de amigo -->
    <section>
      <div class="soc-head">
        <span class="label-caps">¿A quién visitas?</span>
        <div class="soc-head__end">
          <button class="btn btn--ghost btn--icon soc-ibtn soc-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar visitas" on:click={load}>
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
        <div class="scene" class:live={visiting === selectedFriend.otherUserId}>
          <span class="scene-sign">Casa de {selectedFriend.otherDisplayName}</span>
          <span class="scene-floor" aria-hidden="true"></span>
          <span class="scene-pet" aria-hidden="true"><PawPrint size={34} /></span>
        </div>
        <div class="visit-body">
          <div class="visit-title">
            <span class="pet-name">{pet ? pet.nickname || pet.speciesName : 'Sin mascota'}</span>
            {#if pet?.nickname && pet.speciesName}<span class="chip soc-chip">{pet.speciesName}</span>{/if}
          </div>

          <div class="care-row">
            {#each ACTIONS as a (a.id)}
              <button class="care" style="--c: {a.color}" disabled={!pet?.petId || !!busy} on:click={() => care(a.id)}>
                <span class="care-ico"><svelte:component this={a.icon} size={16} /></span>
                {busy === a.id ? '…' : a.label}
              </button>
            {/each}
          </div>

          {#if visiting === selectedFriend.otherUserId}
            <button class="btn btn--danger block" disabled={!!busy} on:click={endVisit}>
              <LogOut size={16} /> {busy === 'end' ? 'Terminando…' : 'Terminar visita'}
            </button>
          {:else}
            <button class="btn btn--primary block" disabled={!!busy} on:click={startVisit}>
              <Home size={16} /> {busy === 'start' ? 'Iniciando…' : 'Iniciar visita'}
            </button>
          {/if}
          <p class="soc-card__hint">Al iniciar la visita, su mascota aparecerá en tu escritorio junto a la tuya.</p>
        </div>
      </div>
    {/if}
  {/if}

  {#if !(loading && !friends.length)}
    <!-- Historial -->
    <section class="soc-list">
      <div class="soc-head">
        <span class="label-caps">Historial</span>
        {#if history.length}<span class="chip soc-count">{history.length}</span>{/if}
      </div>
      {#each history.slice(0, 15) as h (h.createdAt + h.petId + h.visitorId)}
        {@const a = ACTION_BY_ID[h.action]}
        <div class="hist-row">
          <span class="hist-ico" style="--c: {a?.color ?? 'var(--theme-social)'}">
            <svelte:component this={a?.icon ?? PawPrint} size={14} />
          </span>
          <div class="soc-row__body">
            <span class="hist-title">{friendName(h.visitorId)} · {a?.label ?? h.action}</span>
            <span class="soc-row__sub">{when(h.createdAt)}</span>
          </div>
          <span class="chip soc-chip hist-xp">+{h.xpGained} XP</span>
        </div>
      {:else}
        <div class="hist-empty"><History size={16} /> Todavía no hay visitas.</div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .soc-skel.tall {
    height: 200px;
  }

  /* Selector de amigos */
  .picker {
    display: flex;
    gap: 6px;
    padding: 8px 4px 4px;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .pick {
    position: relative;
    flex: 0 0 72px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 4px;
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
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-handle {
    max-width: 100%;
    margin-top: -5px;
    font-size: 10px;
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick-live {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0 5px;
    font-size: 9px;
    font-weight: 800;
    border-radius: var(--radius-pills);
    background: var(--theme-social);
    color: var(--on-color);
    border: 1px solid var(--color-carbon);
  }

  /* Tarjeta del amigo */
  .visit-card {
    border: var(--outline);
    border-radius: var(--radius-cards);
    background: var(--surface);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .scene {
    color-scheme: light;
    position: relative;
    height: 96px;
    background:
      radial-gradient(70% 70% at 50% 20%, rgb(255 236 179 / 0.9), transparent 70%),
      linear-gradient(180deg, #fff3d6 0%, #ffe3b0 100%);
    border-bottom: 1.5px solid var(--color-carbon);
  }
  .scene.live {
    background:
      radial-gradient(70% 70% at 50% 20%, rgb(85 219 156 / 0.55), transparent 70%),
      linear-gradient(180deg, #e9fff4 0%, #c9f5df 100%);
  }
  .scene-sign {
    position: absolute;
    top: 10px;
    left: 10px;
    max-width: 70%;
    padding: 3px 10px;
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: 11px;
    color: var(--color-carbon);
    background: var(--color-sunburst);
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    box-shadow: 2px 2px 0 var(--color-carbon);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .scene-floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 28px;
    border-top: 1.5px solid var(--color-carbon);
    background:
      repeating-linear-gradient(90deg, transparent 0 38px, rgb(0 0 0 / 0.12) 38px 40px),
      linear-gradient(180deg, #c98a4b 0%, #a86a33 100%);
  }
  .scene-pet {
    position: absolute;
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1.5px solid var(--color-carbon);
    background: #fffaf0;
    color: var(--color-carbon);
    animation: bob 3s ease-in-out infinite;
  }
  @keyframes bob {
    50% {
      translate: -50% -4px;
    }
  }
  .visit-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
  .visit-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pet-name {
    font-family: var(--font-display);
    text-transform: uppercase;
    font-size: 18px;
    line-height: 1.05;
  }
  .care-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .care {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 4px 8px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    color: var(--ink);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--dur-1) var(--ease-out), border-color var(--dur-1), box-shadow var(--dur-1);
  }
  .care:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: var(--color-carbon);
    box-shadow: 2px 3px 0 var(--color-carbon);
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
    border-radius: 10px;
    border: 1px solid var(--color-carbon);
    background: var(--c);
    color: var(--on-color);
  }
  .block {
    width: 100%;
  }

  /* Historial */
  .hist-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
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
    border: 1px solid var(--color-carbon);
    background: var(--c);
    color: var(--on-color);
  }
  .hist-title {
    font-size: 12px;
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
    gap: 6px;
    padding: 12px;
    font-size: 12px;
    color: var(--ink-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-pet {
      animation: none;
    }
  }
</style>
