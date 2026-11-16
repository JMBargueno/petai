<script lang="ts">
  import { Download, RefreshCw, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-svelte';
  import { updateState, installUpdate, checkForUpdates } from '../lib/updater';

  $: state = $updateState;
  $: version = ('version' in state && state.version) ? state.version : '';
  $: notes = ('notes' in state && state.notes) ? state.notes : '';
  $: progress = ('progress' in state && state.progress !== null) ? Math.round(state.progress * 100) : null;
  $: isDownloading = state.status === 'downloading';
  $: isReady = state.status === 'ready';
  $: isError = state.status === 'error';

  function handleKeydown(e: KeyboardEvent) {
    // Modal infranqueable: bloquear escape u otros atajos de cierre
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  }
</script>

<svelte:window on:keydown|capture={handleKeydown} />

<div
  class="update-lock-overlay"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="update-lock-title"
  aria-describedby="update-lock-desc"
  tabindex="-1"
>
  <div class="update-lock-card">
    <div class="header-badge">
      <Sparkles size={16} class="text-amber-400" />
      <span>NUEVA VERSIÓN OBLIGATORIA</span>
    </div>

    <div class="icon-hero">
      {#if isReady}
        <div class="icon-circle icon-circle--success">
          <CheckCircle2 size={36} />
        </div>
      {:else if isError}
        <div class="icon-circle icon-circle--error">
          <AlertTriangle size={36} />
        </div>
      {:else if isDownloading}
        <div class="icon-circle icon-circle--loading">
          <RefreshCw size={36} class="spin" />
        </div>
      {:else}
        <div class="icon-circle icon-circle--primary">
          <Download size={36} />
        </div>
      {/if}
    </div>

    <h2 id="update-lock-title">
      Actualización requerida
      {#if version}<span class="version-tag">v{version}</span>{/if}
    </h2>

    <p id="update-lock-desc" class="desc-text">
      Para evitar desfases entre el cliente y el servidor y garantizar el correcto funcionamiento de tus mascotas, inventario y batallas, debes actualizar Pockai a la versión más reciente.
    </p>

    {#if notes}
      <div class="release-notes-box">
        <div class="notes-header">Novedades y cambios:</div>
        <div class="notes-body">{notes}</div>
      </div>
    {/if}

    <div class="action-section">
      {#if isDownloading}
        <div class="progress-wrap">
          <div class="progress-info">
            <span class="progress-label">Descargando actualización...</span>
            <span class="progress-val">{progress !== null ? `${progress}%` : 'Preparando...'}</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              class:indeterminate={progress === null}
              style={progress !== null ? `width: ${progress}%` : ''}
            ></div>
          </div>
          <p class="muted-note">Por favor, espera unos instantes. La aplicación se reiniciará sola.</p>
        </div>
      {:else if isReady}
        <div class="ready-banner">
          <p>¡Actualización instalada con éxito! Reiniciando la aplicación...</p>
        </div>
      {:else if isError}
        <div class="error-banner">
          <p class="error-msg">{state.message}</p>
          <button class="btn btn-retry" on:click={() => checkForUpdates()}>
            <RefreshCw size={16} /> Reintentar comprobación
          </button>
        </div>
      {:else}
        <button class="btn btn-primary" on:click={installUpdate}>
          <Download size={18} /> Actualizar ahora y reiniciar
        </button>
        <p class="sub-hint">La descarga se realiza en segundo plano y Pockai se reiniciará automáticamente.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .update-lock-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 15, 29, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    pointer-events: auto;
    padding: 24px;
    animation: fadeIn 0.25s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .update-lock-card {
    position: relative;
    width: 100%;
    max-width: 480px;
    background: linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
    border: 1px solid rgba(139, 92, 246, 0.35);
    box-shadow:
      0 20px 40px -10px rgba(0, 0, 0, 0.7),
      0 0 30px rgba(139, 92, 246, 0.2);
    border-radius: 20px;
    padding: 32px 28px;
    color: #f8fafc;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .header-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fbbf24;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 4px 12px;
    border-radius: 999px;
    text-transform: uppercase;
  }

  .icon-hero {
    margin-top: 4px;
  }

  .icon-circle {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-circle--primary {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 2px solid rgba(139, 92, 246, 0.4);
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
  }

  .icon-circle--loading {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 2px solid rgba(59, 130, 246, 0.4);
  }

  .icon-circle--success {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 2px solid rgba(16, 185, 129, 0.4);
  }

  .icon-circle--error {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 2px solid rgba(239, 68, 68, 0.4);
  }

  :global(.spin) {
    animation: rotate 1.5s linear infinite;
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
  }

  .version-tag {
    font-size: 13px;
    font-weight: 600;
    background: rgba(139, 92, 246, 0.25);
    color: #c4b5fd;
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid rgba(139, 92, 246, 0.4);
  }

  .desc-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: #94a3b8;
    max-width: 400px;
  }

  .release-notes-box {
    width: 100%;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px 14px;
    text-align: left;
    max-height: 140px;
    overflow-y: auto;
  }

  .notes-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #a78bfa;
    margin-bottom: 6px;
  }

  .notes-body {
    font-size: 12.5px;
    line-height: 1.45;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .action-section {
    width: 100%;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 13px 20px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
    transform: translateY(-1px);
  }

  .btn-primary:active {
    transform: translateY(0);
  }

  .btn-retry {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.4);
  }

  .btn-retry:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  .sub-hint {
    margin: 0;
    font-size: 11.5px;
    color: #64748b;
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
    color: #cbd5e1;
  }

  .progress-val {
    color: #a78bfa;
    font-weight: 700;
  }

  .progress-track {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #8b5cf6, #3b82f6);
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .progress-fill.indeterminate {
    width: 40%;
    animation: indeterminateMove 1.5s infinite linear;
  }

  @keyframes indeterminateMove {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(350%);
    }
  }

  .muted-note {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
  }

  .ready-banner {
    padding: 12px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 10px;
    color: #34d399;
    font-size: 13.5px;
    font-weight: 500;
  }

  .error-banner {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .error-msg {
    margin: 0;
    color: #f87171;
    font-size: 13px;
  }
</style>
