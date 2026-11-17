<script lang="ts">
  // Bloqueo de actualización obligatoria, embebido en el panel de control.
  // Sustituye todo el contenido del panel (y App oculta la mascota) hasta que se instale la versión nueva.
  // Va dentro de `.panel-card`, que es zona interactiva del click-through: así los botones reciben clics.
  import { Download, RefreshCw, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-svelte';
  import { updateState, updateLock, installUpdate, retryUpdate } from '../lib/updater';
  import { Notice } from './ui';

  $: state = $updateState;
  $: version = ('version' in state && state.version) ? state.version : ($updateLock ?? '');
  $: notes = ('notes' in state && state.notes) ? state.notes : '';
  $: progress = ('progress' in state && state.progress !== null) ? Math.round(state.progress * 100) : null;
  $: isDownloading = state.status === 'downloading';
  $: isReady = state.status === 'ready';
  $: isError = state.status === 'error';
  $: isChecking = state.status === 'checking';
</script>

<section class="update-lock" aria-labelledby="update-lock-title" aria-describedby="update-lock-desc">
  <div class="header-badge">
    <Sparkles size={14} />
    <span>Nueva versión obligatoria</span>
  </div>

  <div class="icon-circle" class:success={isReady} class:error={isError} class:loading={isDownloading || isChecking}>
    {#if isReady}
      <CheckCircle2 size={34} />
    {:else if isError}
      <AlertTriangle size={34} />
    {:else if isDownloading || isChecking}
      <RefreshCw size={34} class="spin" />
    {:else}
      <Download size={34} />
    {/if}
  </div>

  <h2 id="update-lock-title" class="display">
    Actualización requerida
    {#if version}<span class="version-tag">v{version}</span>{/if}
  </h2>

  <p id="update-lock-desc" class="desc-text">
    Tu mascota descansa mientras tanto. Actualiza Pockai a la última versión para seguir jugando sin desfases con el servidor.
  </p>

  {#if notes}
    <div class="release-notes-box">
      <div class="notes-header">Novedades y cambios</div>
      <div class="notes-body">{notes}</div>
    </div>
  {/if}

  <div class="action-section" aria-live="polite">
    {#if isDownloading}
      <div class="progress-wrap">
        <div class="progress-info">
          <span>Descargando actualización…</span>
          <span class="progress-val">{progress !== null ? `${progress}%` : 'Preparando…'}</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            class:indeterminate={progress === null}
            style={progress !== null ? `width: ${progress}%` : ''}
          ></div>
        </div>
        <p class="muted-note">La aplicación se reiniciará sola al terminar.</p>
      </div>
    {:else if isReady}
      <div class="ready-banner">¡Actualización instalada! Reiniciando la aplicación…</div>
    {:else if isChecking}
      <p class="muted-note">Comprobando actualización…</p>
    {:else if isError}
      <Notice tone="error">{state.message}</Notice>
      <button class="btn btn--primary block" on:click={() => retryUpdate()}>
        <RefreshCw size={16} /> Reintentar
      </button>
    {:else}
      <button class="btn btn--primary block" on:click={() => installUpdate()}>
        <Download size={18} /> Actualizar ahora y reiniciar
      </button>
      <p class="muted-note">Pockai se reiniciará automáticamente al terminar.</p>
    {/if}
  </div>
</section>

<style>
  .update-lock {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 24px 24px 28px;
    text-align: center;
    color: var(--ink);
    overflow-x: hidden;
  }
  .update-lock * {
    box-sizing: border-box;
  }

  .header-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: color-mix(in srgb, var(--warning) 18%, transparent);
    color: var(--warning-ink);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 4px 12px;
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
    color: var(--accent);
  }
  .icon-circle.loading {
    background: color-mix(in srgb, var(--color-electric-blue) 16%, transparent);
    color: var(--color-electric-blue);
  }
  .icon-circle.success {
    background: color-mix(in srgb, var(--success) 18%, transparent);
    color: var(--success-ink);
  }
  .icon-circle.error {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    color: var(--danger-ink);
  }

  .update-lock :global(.spin) {
    animation: rotate 1.5s linear infinite;
  }
  @keyframes rotate {
    to {
      transform: rotate(360deg);
    }
  }

  h2 {
    margin: 0;
    font-size: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .version-tag {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: var(--radius-pills);
  }

  .desc-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink-muted);
  }

  .release-notes-box {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-cards);
    padding: 12px 14px;
    text-align: left;
    max-height: 160px;
    overflow-y: auto;
  }
  .notes-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .notes-body {
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .action-section {
    width: 100%;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .progress-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 500;
  }
  .progress-val {
    color: var(--accent);
    font-weight: 700;
  }
  .progress-track {
    width: 100%;
    height: 10px;
    background: var(--line-soft);
    border-radius: var(--radius-pills);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--grad-accent, var(--accent));
    border-radius: var(--radius-pills);
    transition: width 0.3s ease;
  }
  .progress-fill.indeterminate {
    width: 40%;
    animation: indeterminateMove 1.5s infinite linear;
  }
  @keyframes indeterminateMove {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(350%);
    }
  }

  .muted-note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-muted);
  }

  .ready-banner {
    width: 100%;
    padding: 12px;
    background: color-mix(in srgb, var(--success) 16%, transparent);
    border-radius: var(--radius-cards);
    color: var(--success-ink);
    font-size: 13.5px;
    font-weight: 500;
  }

</style>
