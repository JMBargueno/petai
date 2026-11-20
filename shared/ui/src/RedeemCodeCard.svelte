<script lang="ts">
  /**
   * Canjear un código de regalo. Solo pinta el formulario y el resultado: avisa con `redeem` y el
   * contenedor de cada app hace el canje y le pasa cómo ha ido (`busy`, `error`, `ok`).
   */
  import { createEventDispatcher } from 'svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Notice from './Notice.svelte';

  export let busy = false;
  export let error = '';
  /** Mensaje de éxito. Al llegar, el campo se vacía para el siguiente código. */
  export let ok = '';

  const dispatch = createEventDispatcher<{ redeem: string }>();

  let code = '';
  $: if (ok) code = '';

  function submit() {
    const value = code.trim();
    if (value && !busy) dispatch('redeem', value);
  }
</script>

<Card title="Canjear código" icon="gift">
  <p class="ui-card__hint">¿Tienes un código de regalo? Canjéalo aquí para recibir monedas, gemas, Pro y más.</p>
  <form class="redeem" on:submit|preventDefault={submit}>
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
