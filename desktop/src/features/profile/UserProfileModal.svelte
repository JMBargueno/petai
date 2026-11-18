<script lang="ts">
  /**
   * Perfil público de otro jugador (desde Amigos o Visitas): cabecera, vitrina, estadísticas e
   * insignias, si el jugador las muestra. Se cierra con Esc, con la X o pulsando fuera.
   */
  import { createEventDispatcher } from 'svelte';
  import { focusTrap } from '../../lib/ui/focusTrap';
  import { friendlyError } from '../../lib/ui/errors';
  import { api, type PublicProfile } from '../../lib/api';
  import ProfileView from './ProfileView.svelte';
  import { X, AlertCircle, Home } from 'lucide-svelte';

  export let userId: string;
  /** Mostrar el botón "Visitar" (si sois amigos). */
  export let canVisit = false;

  const dispatch = createEventDispatcher<{ close: void; visit: string }>();

  let profile: PublicProfile | null = null;
  let loading = true;
  let error = '';

  async function load(id: string) {
    loading = true;
    error = '';
    profile = null;
    try {
      profile = await api.getUserProfile(id);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el perfil.');
    } finally {
      loading = false;
    }
  }

  $: if (userId) void load(userId);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="upm-backdrop" role="presentation" on:click|self={() => dispatch('close')}>
  <div
    class="upm"
    role="dialog"
    aria-modal="true"
    aria-label={profile ? `Perfil de ${profile.displayName}` : 'Perfil de jugador'}
    tabindex="-1"
    use:focusTrap
  >
    <div class="upm-bar">
      <span class="label-caps">Perfil</span>
      <div class="upm-bar__end">
        {#if canVisit && profile?.isFriend}
          <button class="btn btn--sm btn--primary" on:click={() => dispatch('visit', userId)}><Home size={14} /> Visitar</button>
        {/if}
        <button class="btn btn--ghost btn--icon" aria-label="Cerrar perfil" on:click={() => dispatch('close')}><X size={16} /></button>
      </div>
    </div>
    <div class="upm-body ui">
      {#if error}
        <div class="ui-notice ui-notice--error" role="alert"><AlertCircle size={15} /><span class="ui-notice__body">{error}</span><button class="btn btn--ghost btn--sm" on:click={() => load(userId)}>Reintentar</button></div>
      {:else if loading || !profile}
        <div class="ui-loading" aria-label="Cargando perfil">
          <div class="ui-skel"></div>
          <div class="ui-skel"></div>
        </div>
      {:else}
        <ProfileView {profile} own={false} />
      {/if}
    </div>
  </div>
</div>

<style>
  .upm-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: color-mix(in srgb, var(--color-carbon) 45%, transparent);
  }
  .upm {
    display: flex;
    flex-direction: column;
    width: min(460px, 100%);
    max-height: min(640px, 100%);
    border: 1.5px solid var(--line);
    border-radius: var(--radius-3xl);
    background: var(--surface);
    box-shadow: 3px 5px 0 var(--line);
    outline: none;
    overflow: hidden;
  }
  .upm-bar {
    display: flex;
    align-items: center;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line-soft);
  }
  .upm-bar .label-caps {
    color: var(--ink-muted);
  }
  .upm-bar__end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .upm-body {
    padding: var(--space-3) var(--space-4) var(--space-4);
    overflow-y: auto;
  }
</style>
