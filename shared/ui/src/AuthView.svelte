<script lang="ts">
  /**
   * Acceso sin sesión: entrar, crear cuenta y recuperar la contraseña (correo → código + contraseña
   * nueva). Las llamadas llegan por el puerto `authApi`; al abrir sesión avisa con `success`
   * (`login`, `register` o `reset`) y la app recarga el estado. Lo que cada app quiera enseñar debajo
   * (p. ej. el estado de la actualización en el escritorio) va en el hueco.
   */
  import { createEventDispatcher, onDestroy } from 'svelte';
  import AuthLayout from './AuthLayout.svelte';
  import Button from './Button.svelte';
  import CodeInput from './CodeInput.svelte';
  import HandleField from './HandleField.svelte';
  import Notice from './Notice.svelte';
  import { cooldown, isAuthCode, type AuthApi } from './authApi';

  export let authApi: AuthApi;
  /** Aviso de éxito al llegar (p. ej. «Contraseña cambiada»). */
  export let notice = '';

  const dispatch = createEventDispatcher<{ success: 'login' | 'register' | 'reset' }>();

  let view: 'login' | 'register' | 'forgot' | 'reset' = 'login';
  let loading = false;
  let error = '';

  let email = '';
  let password = '';
  let displayName = '';
  let inviteCode = '';
  let handle = '';
  let handleValid = false;
  let inviteRequired = false;

  let resetEmail = '';
  let resetCode = '';
  let resetPassword = '';
  let resetPassword2 = '';
  let showResetPassword = false;
  let resetNotice = '';
  let resending = false;
  let resendIn = 0;
  let stopCooldown: (() => void) | null = null;

  function startCooldown() {
    stopCooldown?.();
    stopCooldown = cooldown(60, (left) => (resendIn = left));
  }
  onDestroy(() => stopCooldown?.());

  async function run(fallback: string, fn: () => Promise<void>) {
    error = '';
    loading = true;
    try {
      await fn();
    } catch (err) {
      error = authApi.errorText(err, fallback);
    } finally {
      loading = false;
    }
  }

  /** Al pasar a «Crear cuenta» se pregunta si el alta exige invitación. */
  async function toggleMode() {
    error = '';
    notice = '';
    view = view === 'login' ? 'register' : 'login';
    if (view !== 'register') return;
    try {
      inviteRequired = (await authApi.registrationConfig()).inviteRequired;
    } catch (err) {
      error = authApi.errorText(err, 'No se pudo comprobar si el registro está abierto.');
    }
  }

  const submit = () =>
    run(view === 'login' ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta', async () => {
      if (view === 'login') {
        await authApi.login(email.trim(), password);
        dispatch('success', 'login');
        return;
      }
      if (inviteRequired && !inviteCode.trim()) throw new Error('El registro requiere un código de invitación');
      if (!handleValid) throw new Error('Elige un nickname válido y libre');
      await authApi.register({
        email: email.trim(),
        password,
        handle,
        displayName: displayName.trim() || undefined,
        inviteCode: inviteCode.trim() || undefined,
      });
      dispatch('success', 'register');
    });

  function openForgot() {
    resetEmail = email.trim();
    resetCode = resetPassword = resetPassword2 = '';
    error = notice = resetNotice = '';
    view = 'forgot';
  }

  function backToLogin() {
    error = resetNotice = '';
    view = 'login';
  }

  const requestReset = () =>
    run('No se pudo enviar el código', async () => {
      resetNotice = '';
      if (!resetEmail.trim()) throw new Error('Escribe el correo de tu cuenta');
      await authApi.requestPasswordReset(resetEmail.trim());
      view = 'reset';
      startCooldown();
    });

  async function resendReset() {
    if (resending) return;
    error = resetNotice = '';
    resending = true;
    try {
      await authApi.requestPasswordReset(resetEmail.trim());
      resetNotice = 'Te hemos enviado un código nuevo. El anterior ya no sirve.';
      startCooldown();
    } catch (err) {
      error = authApi.errorText(err, 'No se pudo reenviar el código');
    } finally {
      resending = false;
    }
  }

  const confirmReset = () =>
    run('No se pudo cambiar la contraseña', async () => {
      resetNotice = '';
      if (!isAuthCode(resetCode)) throw new Error('El código tiene 6 dígitos');
      if (resetPassword.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
      if (resetPassword !== resetPassword2) throw new Error('Las contraseñas no coinciden');
      await authApi.confirmPasswordReset(resetEmail.trim(), resetCode.trim(), resetPassword);
      email = resetEmail.trim();
      password = resetPassword = resetPassword2 = '';
      view = 'login';
      dispatch('success', 'reset');
    });

  $: isLogin = view === 'login';
</script>

{#if view === 'forgot' || view === 'reset'}
  <AuthLayout eyebrow="Recuperar contraseña" title={view === 'forgot' ? '¿Has olvidado tu contraseña?' : 'Nueva contraseña'}>
    <svelte:fragment slot="subtitle">
      {#if view === 'forgot'}
        Te enviaremos un código de 6 dígitos para crear una contraseña nueva.
      {:else}
        Si existe una cuenta con <strong>{resetEmail}</strong>, te hemos enviado un código. Caduca en 15 minutos.
      {/if}
    </svelte:fragment>

    {#if view === 'forgot'}
      <form class="card auth-form" on:submit|preventDefault={requestReset}>
        {#if error}<Notice tone="error">{error}</Notice>{/if}
        <div class="form-group">
          <label for="reset-email">Correo electrónico</label>
          <input class="input" id="reset-email" type="email" autocomplete="email" required bind:value={resetEmail} placeholder="entrenador@pockai.app" />
        </div>
        <Button type="submit" variant="primary" size="lg" block {loading}>Enviar código</Button>
      </form>
    {:else}
      <form class="card auth-form" on:submit|preventDefault={confirmReset}>
        {#if error}<Notice tone="error">{error}</Notice>{/if}
        {#if resetNotice}<Notice tone="info">{resetNotice}</Notice>{/if}
        <CodeInput id="reset-code" bind:value={resetCode} />
        <div class="form-group">
          <label for="reset-pass">Contraseña nueva</label>
          {#if showResetPassword}
            <input class="input" id="reset-pass" type="text" autocomplete="new-password" minlength="8" required bind:value={resetPassword} placeholder="Mínimo 8 caracteres" />
          {:else}
            <input class="input" id="reset-pass" type="password" autocomplete="new-password" minlength="8" required bind:value={resetPassword} placeholder="Mínimo 8 caracteres" />
          {/if}
        </div>
        <div class="form-group">
          <label for="reset-pass2">Repite la contraseña</label>
          {#if showResetPassword}
            <input class="input" id="reset-pass2" type="text" autocomplete="new-password" required bind:value={resetPassword2} />
          {:else}
            <input class="input" id="reset-pass2" type="password" autocomplete="new-password" required bind:value={resetPassword2} />
          {/if}
        </div>
        <label class="show-pass"><input type="checkbox" bind:checked={showResetPassword} /> Mostrar contraseña</label>
        <Button type="submit" variant="primary" size="lg" block {loading}>Cambiar contraseña</Button>
      </form>

      <button type="button" class="auth-link" on:click={resendReset} disabled={resendIn > 0 || resending}>
        {#if resendIn > 0}Puedes pedir otro código en {resendIn} s{:else}¿No te ha llegado? <strong>Reenviar código</strong>{/if}
      </button>
    {/if}

    <button type="button" class="auth-link" on:click={backToLogin}>Volver a iniciar sesión</button>
  </AuthLayout>
{:else}
  <AuthLayout eyebrow="Pockai" title={isLogin ? 'Iniciar sesión' : 'Crear cuenta'}>
    <svelte:fragment slot="subtitle">Conecta con tu mascota virtual</svelte:fragment>

    <form class="card auth-form" on:submit|preventDefault={submit}>
      {#if notice}<Notice tone="ok">{notice}</Notice>{/if}
      {#if error}<Notice tone="error">{error}</Notice>{/if}

      <div class="form-group">
        <label for="auth-email">Correo electrónico</label>
        <input class="input" id="auth-email" type="email" autocomplete="email" required bind:value={email} placeholder="entrenador@pockai.app" />
      </div>

      {#if !isLogin}
        <HandleField id="auth-handle" checkHandle={(h) => authApi.checkHandle(h)} bind:value={handle} bind:valid={handleValid} />
        <div class="form-group">
          <label for="auth-name">Nombre de jugador</label>
          <input class="input" id="auth-name" type="text" autocomplete="nickname" bind:value={displayName} placeholder="Red" />
          <small class="form-hint">El nombre sí podrás cambiarlo cuando quieras.</small>
        </div>
      {/if}

      <div class="form-group">
        <label for="auth-pass">Contraseña</label>
        <input class="input" id="auth-pass" type="password" autocomplete={isLogin ? 'current-password' : 'new-password'} required bind:value={password} placeholder="••••••••" />
        {#if isLogin}
          <button type="button" class="forgot-link" on:click={openForgot}>¿Has olvidado tu contraseña?</button>
        {/if}
      </div>

      {#if !isLogin}
        <div class="form-group">
          <label for="auth-invite">Código de invitación{inviteRequired ? '' : ' (opcional)'}</label>
          <input
            class="input"
            id="auth-invite"
            type="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="32"
            required={inviteRequired}
            bind:value={inviteCode}
            placeholder="ABCD-EF23"
          />
          {#if inviteRequired}
            <small class="form-hint">El registro está limitado: necesitas un código de invitación.</small>
          {/if}
        </div>
      {/if}

      <Button type="submit" variant="primary" size="lg" block {loading}>{isLogin ? 'Entrar' : 'Registrarse'}</Button>
    </form>

    <button type="button" class="auth-link" on:click={toggleMode}>
      {#if isLogin}¿No tienes cuenta? <strong>Regístrate</strong>{:else}¿Ya tienes cuenta? <strong>Inicia sesión</strong>{/if}
    </button>

    <slot />
  </AuthLayout>
{/if}
