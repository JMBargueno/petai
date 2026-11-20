<script lang="ts">
  /**
   * Cuenta recién creada: hay que verificar el correo antes de jugar, con el código del correo o con
   * su enlace («Ya lo he verificado»). Las llamadas llegan por `authApi`; avisa con `success` al
   * quedar verificada y con `logout` para usar otra cuenta.
   */
  import { createEventDispatcher, onDestroy } from 'svelte';
  import AuthLayout from './AuthLayout.svelte';
  import Button from './Button.svelte';
  import CodeInput from './CodeInput.svelte';
  import Notice from './Notice.svelte';
  import { cooldown, isAuthCode, type AuthApi } from './authApi';

  export let authApi: AuthApi;
  export let email = '';

  const dispatch = createEventDispatcher<{ success: void; logout: void }>();

  let code = '';
  let error = '';
  let notice = '';
  let loading = false;
  let resending = false;
  let resendIn = 0;
  let stopCooldown: (() => void) | null = null;
  onDestroy(() => stopCooldown?.());

  async function verify() {
    error = notice = '';
    if (!isAuthCode(code)) {
      error = 'El código tiene 6 dígitos';
      return;
    }
    loading = true;
    try {
      await authApi.verifyEmail(code.trim());
      code = '';
      dispatch('success');
    } catch (err) {
      error = authApi.errorText(err, 'No se pudo verificar el código');
    } finally {
      loading = false;
    }
  }

  async function recheck() {
    error = notice = '';
    loading = true;
    try {
      if (await authApi.isEmailVerified()) dispatch('success');
      else notice = 'Aún no consta como verificado. Abre el enlace del correo o escribe el código.';
    } catch (err) {
      error = authApi.errorText(err, 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.');
    } finally {
      loading = false;
    }
  }

  async function resend() {
    if (resending) return;
    error = notice = '';
    resending = true;
    try {
      await authApi.resendVerification();
      notice = 'Te hemos enviado un correo nuevo. El código anterior ya no sirve.';
      stopCooldown?.();
      stopCooldown = cooldown(60, (left) => (resendIn = left));
    } catch (err) {
      error = authApi.errorText(err, 'No se pudo reenviar el correo');
    } finally {
      resending = false;
    }
  }
</script>

<AuthLayout eyebrow="Un último paso" title="Verifica tu correo">
  <svelte:fragment slot="subtitle">
    Te hemos enviado un código a <strong>{email}</strong>. Escríbelo aquí o pulsa el botón del correo.
  </svelte:fragment>

  <form class="card auth-form" on:submit|preventDefault={verify}>
    {#if error}<Notice tone="error">{error}</Notice>{/if}
    {#if notice}<Notice tone="info">{notice}</Notice>{/if}
    <CodeInput id="verify-code" label="Código de verificación" bind:value={code} />
    <Button type="submit" variant="primary" size="lg" block {loading}>Verificar</Button>
    <Button block disabled={loading} on:click={recheck}>Ya lo he verificado con el enlace</Button>
  </form>

  <button type="button" class="auth-link" on:click={resend} disabled={resendIn > 0 || resending}>
    {#if resendIn > 0}Puedes reenviarlo en {resendIn} s{:else}¿No te ha llegado? <strong>Reenviar correo</strong>{/if}
  </button>
  <button type="button" class="auth-link" on:click={() => dispatch('logout')}>Usar otra cuenta</button>
</AuthLayout>
