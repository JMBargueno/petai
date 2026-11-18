<script lang="ts">
  // Mantenimiento del servidor, embebido en el panel de control (como la actualización obligatoria).
  // Sustituye el contenido del panel y App oculta la mascota hasta que termine. Se comprueba solo cada
  // minuto; el botón permite mirarlo ya.
  import { RefreshCw, Wrench } from 'lucide-svelte';
  import { checkMaintenance, maintenanceLock } from '../lib/maintenance';

  let checking = false;

  async function retry() {
    checking = true;
    try {
      await checkMaintenance();
    } finally {
      checking = false;
    }
  }
</script>

<section class="maintenance-lock" aria-labelledby="maintenance-title" aria-describedby="maintenance-desc">
  <div class="header-badge">
    <Wrench size={14} />
    <span>Mantenimiento</span>
  </div>

  <div class="icon-circle">
    <Wrench size={34} />
  </div>

  <h2 id="maintenance-title" class="display">Estamos haciendo unos ajustes</h2>

  <p id="maintenance-desc" class="desc-text">{$maintenanceLock ?? ''}</p>
  <p class="muted-note">Tu mascota descansa mientras tanto. Pockai volverá solo en cuanto terminemos.</p>

  <button class="btn btn--primary block" on:click={retry} disabled={checking} aria-live="polite">
    <RefreshCw size={16} class={checking ? 'spin' : ''} />
    {checking ? 'Comprobando…' : 'Comprobar de nuevo'}
  </button>
</section>

<style>
  .maintenance-lock {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-6) var(--space-6);
    text-align: center;
    color: var(--ink);
    overflow-x: hidden;
  }
  .header-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: color-mix(in srgb, var(--warning) 18%, transparent);
    color: var(--warning-ink);
    font-size: var(--text-caption);
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-pills);
    text-transform: uppercase;
  }
  .icon-circle {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent-ink);
  }
  h2 {
    margin: 0;
    font-size: var(--text-title);
  }
  .desc-text {
    margin: 0;
    font-size: var(--text-body);
    line-height: 1.5;
    white-space: pre-line;
  }
  .muted-note {
    margin: 0;
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .block {
    width: 100%;
  }
  .maintenance-lock :global(.spin) {
    animation: rotate 1.5s linear infinite;
  }
  @keyframes rotate {
    to {
      transform: rotate(360deg);
    }
  }
</style>
