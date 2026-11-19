<script lang="ts">
  /** Ajustes › Cuenta › Canjear código: canjea un voucher; la celebración la pinta App (RewardToast). */
  import { createEventDispatcher } from 'svelte';
  import { api, ApiError } from '../../lib/api';
  import { celebrateReward } from '../../lib/rewards';
  import { Button, Card, Notice } from '../ui';

  const dispatch = createEventDispatcher<{ redeemed: void }>();

  let code = '';
  let busy = false;
  let error = '';
  let ok = '';

  function messageFor(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 409) return 'Ya has canjeado este código.';
      if (e.status === 429) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
      if (e.status === 400 || e.status === 404) return 'El código no es válido o ha caducado.';
    }
    return e instanceof Error && e.message ? e.message : 'No se pudo canjear el código.';
  }

  async function redeem() {
    const value = code.trim();
    if (!value || busy) return;
    busy = true;
    error = '';
    ok = '';
    try {
      const res = await api.redeemVoucher(value);
      celebrateReward(res);
      ok = '¡Código canjeado! Mira tu recompensa.';
      code = '';
      dispatch('redeemed');
    } catch (e) {
      error = messageFor(e);
    } finally {
      busy = false;
    }
  }
</script>

<Card title="Canjear código" icon="gift">
  <p class="ui-card__hint">¿Tienes un código de regalo? Canjéalo aquí para recibir monedas, gemas, Pro y más.</p>
  <form class="redeem" on:submit|preventDefault={redeem}>
    <label class="sr-only" for="redeem-code">Código</label>
    <input
      id="redeem-code"
      class="input redeem__input"
      bind:value={code}
      maxlength="40"
      autocomplete="off"
      spellcheck="false"
      placeholder="ABCD-EF23"
    />
    <Button type="submit" variant="primary" loading={busy} disabled={!code.trim()}>Canjear</Button>
  </form>
  {#if error}<Notice tone="error">{error}</Notice>{/if}
  {#if ok}<Notice tone="ok">{ok}</Notice>{/if}
</Card>

<style>
  .redeem {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .redeem__input {
    flex: 1 1 auto;
    min-width: 0;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
