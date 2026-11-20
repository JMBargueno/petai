<script lang="ts">
  /**
   * Ajustes › Cuenta › Canjear código en el escritorio: hace el canje y celebra la recompensa
   * (RewardToast en App). El formulario es `RedeemCodeCard`, de `@pockai/ui`.
   */
  import { createEventDispatcher } from 'svelte';
  import { api, ApiError } from '../../lib/api';
  import { celebrateReward } from '../../lib/rewards';
  import { RedeemCodeCard, redeemErrorText } from '@pockai/ui';

  const dispatch = createEventDispatcher<{ redeemed: void }>();

  let busy = false;
  let error = '';
  let ok = '';

  function messageFor(e: unknown): string {
    const fallback = e instanceof Error && e.message ? e.message : 'No se pudo canjear el código.';
    return redeemErrorText(e instanceof ApiError ? e.status : undefined, fallback);
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
