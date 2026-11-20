<script lang="ts">
  /**
   * Cuenta sin nickname (anterior al nickname o creada desde una app antigua): hay que elegirlo antes
   * de jugar. Es único y no se puede cambiar, así que se pide confirmarlo. Las llamadas llegan por
   * `authApi`; avisa con `success` al guardarlo y con `logout` para usar otra cuenta.
   */
  import { createEventDispatcher } from 'svelte';
  import AuthLayout from './AuthLayout.svelte';
  import Button from './Button.svelte';
  import HandleField from './HandleField.svelte';
  import Notice from './Notice.svelte';
  import type { AuthApi } from './authApi';

  export let authApi: AuthApi;

  const dispatch = createEventDispatcher<{ success: void; logout: void }>();

  let handle = '';
  let valid = false;
  let confirming = false;
  let error = '';
  let loading = false;

  // Si cambia el texto tras pedir confirmación, se vuelve a pedir.
  $: handle, (confirming = false);

  async function submit() {
    error = '';
    if (!valid) {
      error = 'Elige un nickname válido y libre';
      return;
    }
    if (!confirming) {
      confirming = true;
      return;
    }
    loading = true;
    try {
      await authApi.setHandle(handle);
      dispatch('success');
    } catch (err) {
      error = authApi.errorText(err, 'No se pudo guardar el nickname');
      confirming = false;
    } finally {
      loading = false;
    }
  }
</script>

<AuthLayout eyebrow="Un último paso" title="Elige tu nickname">
  <svelte:fragment slot="subtitle">
    Es tu @ en Pockai: con él te añadirán como amigo, te invitarán a clanes y te mandarán pockais de visita.
    <strong>Es único y no se podrá cambiar.</strong>
  </svelte:fragment>

  <form class="card auth-form" on:submit|preventDefault={submit}>
    {#if error}<Notice tone="error">{error}</Notice>{/if}
    <HandleField id="choose-handle" checkHandle={(h) => authApi.checkHandle(h)} bind:value={handle} bind:valid />
    {#if confirming}
      <Notice tone="warning">¿Seguro que quieres ser <strong>@{handle}</strong>? No podrás cambiarlo nunca.</Notice>
    {/if}
    <Button type="submit" variant="primary" size="lg" block {loading} disabled={!valid}>
      {confirming ? `Sí, quiero ser @${handle}` : 'Continuar'}
    </Button>
  </form>

  <button type="button" class="auth-link" on:click={() => dispatch('logout')}>Usar otra cuenta</button>
</AuthLayout>
