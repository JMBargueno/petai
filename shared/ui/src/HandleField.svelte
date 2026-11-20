<script lang="ts">
  /**
   * Campo de nickname (@handle) con comprobación de disponibilidad en vivo. Se usa en el registro y en
   * la pantalla "Elige tu nickname". `value` queda normalizado (minúsculas, sin "@") y `valid` solo es
   * true cuando el servidor confirma que está libre. Cómo se comprueba lo pone cada app
   * (`checkHandle`: el núcleo en Android, la API en el escritorio).
   */
  import { onDestroy } from 'svelte';
  import { Check, AlertCircle } from 'lucide-svelte';
  import { HANDLE_MAX_LENGTH, handleFormatError, normalizeHandle } from './handle';

  /** Disponibilidad de un nickname ya normalizado. Si falla, debe resolver con `available: false` y el motivo. */
  export let checkHandle: (handle: string) => Promise<{ handle: string; available: boolean; reason?: string }>;

  export let id = 'auth-handle';
  export let value = '';
  export let valid = false;

  let raw = value;
  let status: 'idle' | 'checking' | 'ok' | 'error' = 'idle';
  let message = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  $: onInput(raw);

  function onInput(text: string) {
    value = normalizeHandle(text);
    valid = false;
    if (timer) clearTimeout(timer);
    if (!value) {
      status = 'idle';
      message = '';
      return;
    }
    const formatError = handleFormatError(value);
    if (formatError) {
      status = 'error';
      message = formatError;
      return;
    }
    status = 'checking';
    message = 'Comprobando…';
    const mine = ++seq;
    const handle = value;
    timer = setTimeout(async () => {
      const res = await checkHandle(handle).catch(() => ({ handle, available: false, reason: 'No se pudo comprobar' }));
      if (mine !== seq) return; // llegó tarde: el usuario ya escribió otra cosa
      if (res.available) {
        status = 'ok';
        message = `@${res.handle} está libre`;
        valid = true;
      } else {
        status = 'error';
        message = res.reason || 'No disponible';
      }
    }, 350);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="form-group">
  <label for={id}>Nickname</label>
  <div class="handle-input" class:ok={status === 'ok'} class:bad={status === 'error'}>
    <span class="at" aria-hidden="true">@</span>
    <input
      class="input"
      {id}
      type="text"
      autocomplete="username"
      autocapitalize="none"
      spellcheck="false"
      maxlength={HANDLE_MAX_LENGTH + 1}
      required
      bind:value={raw}
      placeholder="tu_nickname"
      aria-describedby="{id}-hint"
    />
  </div>
  <small id="{id}-hint" class="form-hint handle-hint" class:ok={status === 'ok'} class:bad={status === 'error'} aria-live="polite">
    {#if status === 'ok'}<Check size={12} /> {message}{:else if status === 'error'}<AlertCircle size={12} /> {message}{:else if status === 'checking'}{message}{:else}Así te encontrarán tus amigos. <strong>No podrás cambiarlo después.</strong>{/if}
  </small>
</div>

<style>
  .handle-input {
    position: relative;
    display: flex;
    align-items: center;
  }
  .handle-input .at {
    position: absolute;
    left: 12px;
    opacity: 0.6;
    pointer-events: none;
    font-weight: 600;
  }
  .handle-input .input {
    /* Relativo a la letra del campo: en Android es más grande. */
    padding-left: 2em;
    width: 100%;
  }
  .handle-input.ok .input {
    border-color: var(--success-ink);
  }
  .handle-input.bad .input {
    border-color: var(--danger-ink);
  }
  .handle-hint {
    display: flex;
    gap: var(--space-1);
    align-items: center;
    flex-wrap: wrap;
  }
  .handle-hint.ok {
    color: var(--success-ink);
  }
  .handle-hint.bad {
    color: var(--danger-ink);
  }
</style>
