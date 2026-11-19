<script lang="ts">
  /** Ajustes › Cuenta: datos del jugador y cerrar sesión. */
  import { createEventDispatcher } from 'svelte';
  import SocialAvatar from '../SocialAvatar.svelte';
  import { Badge, Button, Card, ListRow } from '../ui';
  import RedeemVoucherCard from './RedeemVoucherCard.svelte';

  export let user: any;

  const dispatch = createEventDispatcher<{ logout: void }>();
  $: displayName = user.displayName || user.email;
</script>

<div class="ui-stack">
  <Card variant="hero">
    <div class="who">
      <SocialAvatar name={displayName} size={48} />
      <div class="who-text">
        <strong class="ui-feature__title">{displayName}</strong>
        {#if user.handle}<span class="muted">@{user.handle}</span>{/if}
      </div>
    </div>
  </Card>

  <div class="ui-list">
    {#if user.handle}
      <ListRow icon="user" title="Nickname" sub="No se puede cambiar">
        <svelte:fragment slot="end"><Badge>@{user.handle}</Badge></svelte:fragment>
      </ListRow>
    {/if}
    {#if user.email}
      <ListRow icon="note" title="Correo" sub={user.email} />
    {/if}
  </div>

  <RedeemVoucherCard />

  <!-- Cerrar sesión no borra nada: es una acción normal, no de peligro -->
  <Button block icon="logout" on:click={() => dispatch('logout')}>Cerrar sesión</Button>
  <p class="form-hint">Tu Pockai y tu progreso se quedan guardados en tu cuenta.</p>
</div>

<style>
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .who-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .who-text .muted {
    font-size: var(--text-caption);
  }
</style>
