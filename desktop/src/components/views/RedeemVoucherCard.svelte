<script lang="ts">
  /**
   * Ajustes › Cuenta › Canjear código en el escritorio: hace el canje y celebra la recompensa
   * (RewardToast en App). El formulario es `RedeemCodeCard`, de `@pockai/ui`.
   */
  import { createEventDispatcher } from 'svelte';
  import { api, ApiError } from '../../lib/api';
  import { celebrateReward } from '../../lib/rewards';
  import { RedeemCodeCard } from '@pockai/ui';

  const dispatch = createEventDispatcher<{ redeemed: void }>();

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

  async function redeem(value: string) {
    if (busy) return;
    busy = true;
    error = '';
    ok = '';
    try {
      const res = await api.redeemVoucher(value);
      celebrateReward(res);
      ok = '¡Código canjeado! Mira tu recompensa.';
      dispatch('redeemed');
    } catch (e) {
      error = messageFor(e);
    } finally {
      busy = false;
    }
  }
</script>

<RedeemCodeCard {busy} {error} {ok} on:redeem={(e) => redeem(e.detail)} />
