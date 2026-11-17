<script lang="ts">
  import { onMount } from 'svelte';
  import { RefreshCw, Download } from 'lucide-svelte';
  import { updateState, checkForUpdates, installUpdate } from '../lib/updater';

  let version = '';

  onMount(async () => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      version = await getVersion();
    } catch {
      /* sin versión: no es crítico */
    }
  });

  /** Buzón de contacto público (el mismo que recibe el formulario de la web). */
  const CONTACT_EMAIL = 'contact@pockai.world';

  async function openContact(event: MouseEvent) {
    if (!('__TAURI_INTERNALS__' in window)) return; // en navegador basta el href
    event.preventDefault();
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(`mailto:${CONTACT_EMAIL}`);
  }

  $: s = $updateState;
  $: busy = s.status === 'checking' || s.status === 'downloading' || s.status === 'ready';
</script>

<section class="about-panel" aria-label="Acerca de Pockai">
  <h2>Pockai</h2>
  <p class="muted">Versión {version || '—'}</p>

  {#if s.status === 'available'}
    <div class="update-box">
      <p><strong>¡Hay una versión nueva: {s.version}!</strong></p>
      {#if s.notes}<p class="notes">{s.notes}</p>{/if}
      <button class="btn btn--primary" on:click={installUpdate}>
        <Download size={16} /> Instalar y reiniciar
      </button>
    </div>
  {:else if s.status === 'downloading'}
    <div class="update-box">
      <p>Descargando la versión {s.version}…</p>
      <progress max="1" value={s.progress ?? undefined} aria-label="Progreso de la descarga"></progress>
    </div>
  {:else if s.status === 'ready'}
    <p class="notice">Versión {s.version} instalada. Reiniciando…</p>
  {:else}
    <button class="btn" on:click={() => checkForUpdates()} disabled={busy}>
      <RefreshCw size={16} />
      {s.status === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
    </button>
    {#if s.status === 'upToDate'}
      <p class="notice">Estás en la última versión.</p>
    {:else if s.status === 'error'}
      <p class="error" role="alert">{s.message}</p>
    {/if}
  {/if}

  <p class="muted contact">
    ¿Dudas o algún fallo? Escríbenos a
    <a href={`mailto:${CONTACT_EMAIL}`} on:click={openContact}>{CONTACT_EMAIL}</a>
  </p>
</section>

<style>
  .about-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 14px;
    background: var(--surface-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    color: var(--ink);
  }
  h2 { margin: 0; font-size: 15px; }
  p { margin: 0; font-size: 13px; }
  .muted { color: var(--ink-muted); }
  .notice { color: var(--success-ink); }
  .error { color: var(--danger-ink); }
  .update-box { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .notes { white-space: pre-line; max-height: 120px; overflow-y: auto; color: var(--ink-muted); }
  progress { width: 100%; accent-color: var(--accent); }
  .contact { padding-top: 6px; border-top: 1px solid var(--line-soft); width: 100%; }
  .contact a { color: var(--accent); }
</style>
