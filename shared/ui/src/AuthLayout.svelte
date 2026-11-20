<script lang="ts">
  /**
   * Pantalla de autenticación: halo con el logo, eyebrow, título display y subtítulo (slot `subtitle`).
   * El formulario y los enlaces van en el slot por defecto. La usan login/registro, recuperar
   * contraseña, verificar correo y elegir nickname, en el escritorio y en Android.
   */
  import PockaiMark from './PockaiMark.svelte';

  export let eyebrow: string;
  export let title: string;
</script>

<div class="auth">
  <div class="auth-hero">
    <div class="auth-halo"><PockaiMark size={72} /></div>
    <span class="eyebrow">{eyebrow}</span>
    <h2 class="display auth-title">{title}</h2>
    {#if $$slots.subtitle}<p class="auth-subtitle"><slot name="subtitle" /></p>{/if}
  </div>
  <slot />
</div>

<style>
  .auth {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-5) var(--space-4);
    overflow-y: auto;
  }
  .auth-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: var(--space-1);
    text-align: center;
  }
  .auth-halo {
    display: grid;
    place-items: center;
    width: 104px;
    height: 104px;
    margin-bottom: var(--space-2);
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--color-sunburst) 45%, transparent) 0%, transparent 70%);
  }
  .auth-title {
    margin: var(--space-2) 0 var(--space-1);
    font-size: 28px;
    /* En dos líneas, la tilde de la Ñ necesita aire para no quedar tapada por la línea de arriba. */
    line-height: 1.25;
  }
  .auth-subtitle {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-label);
  }
  /* Piezas compartidas por los formularios de auth (marcado en ControlPanel) */
  .auth :global(.auth-form) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-cards-elevated);
  }
  .auth :global(.auth-link) {
    display: block;
    margin: 0 auto;
    padding: var(--space-2) var(--space-2);
    border: 0;
    border-radius: var(--radius-pills);
    background: transparent;
    color: var(--ink-muted);
    font-size: var(--text-label);
    cursor: pointer;
  }
  .auth :global(.auth-link strong) {
    color: var(--accent-ink);
  }
  .auth :global(.auth-link:hover strong) {
    text-decoration: underline;
  }
  .auth :global(.auth-link:disabled) {
    cursor: default;
    opacity: 0.7;
  }
  .auth :global(.auth-link:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .auth :global(.forgot-link) {
    align-self: flex-end;
    padding: 2px var(--space-1);
    border: 0;
    background: transparent;
    color: var(--accent-ink);
    font-size: var(--text-caption);
    font-weight: 600;
    cursor: pointer;
  }
  .auth :global(.forgot-link:hover) {
    text-decoration: underline;
  }
  .auth :global(.show-pass) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-muted);
    font-size: var(--text-label);
    cursor: pointer;
  }
</style>
