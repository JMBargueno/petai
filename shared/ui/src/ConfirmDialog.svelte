<script lang="ts">
  /**
   * Confirmación antes de una acción destructiva o que gasta monedas/gemas.
   * Muestra el coste y el saldo si se pasan, y bloquea el botón si no alcanza.
   * Emite `confirm` y `cancel`; quien lo usa cierra el diálogo y gestiona `loading`.
   */
  import { createEventDispatcher } from 'svelte';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import CurrencyPill from './CurrencyPill.svelte';

  export let open = true;
  export let title = '¿Seguro?';
  export let icon: string | null = null;
  export let confirmLabel = 'Confirmar';
  export let cancelLabel = 'Cancelar';
  /** Acción destructiva (borrar, salir, expulsar): el botón de confirmar va en rojo. */
  export let danger = false;
  export let loading = false;
  /** Coste de la acción, si gasta moneda. */
  export let cost: number | null = null;
  export let currency: 'coins' | 'gems' = 'coins';
  /** Saldo actual, para mostrar lo que queda y avisar si no alcanza. */
  export let balance: number | null = null;

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();

  $: short = cost !== null && balance !== null && balance < cost;
  $: unit = currency === 'gems' ? 'gemas' : 'monedas';
</script>

<Modal {open} {title} {icon} closable={!loading} on:close={() => dispatch('cancel')}>
  <div class="ui-confirm">
    <slot />
    {#if cost !== null}
      <dl class="ui-confirm__cost">
        <div><dt>Cuesta</dt><dd><CurrencyPill kind={currency} amount={cost} plain /></dd></div>
        {#if balance !== null}
          <div><dt>Tienes</dt><dd><CurrencyPill kind={currency} amount={balance} plain /></dd></div>
        {/if}
      </dl>
      {#if short}
        <p class="ui-confirm__short" role="alert">Te faltan {cost - (balance ?? 0)} {unit}.</p>
      {/if}
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <Button variant="ghost" disabled={loading} on:click={() => dispatch('cancel')}>{cancelLabel}</Button>
    <Button variant={danger ? 'danger' : 'primary'} {loading} disabled={short} on:click={() => dispatch('confirm')}>{confirmLabel}</Button>
  </svelte:fragment>
</Modal>
