<script lang="ts">
  import { onMount } from 'svelte';
  import { RefreshCw, Download } from 'lucide-svelte';
  import { updateState, checkForUpdates, installUpdate } from '../lib/updater';
  import { SOCIAL_HANDLE, SOCIAL_LINKS } from '../lib/social';

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
  /** Formulario de contacto de la web (vía preferente; en mantenimiento se abre en un modal). */
  const contactFormUrl = (type: 'bug' | 'improvement') =>
    `https://pockai.world/es/contact?type=${type}&from=desktop`;
  const BUG_URL = contactFormUrl('bug');
  const IDEA_URL = contactFormUrl('improvement');

  /** Abre un enlace externo con el navegador/cliente del sistema (en navegador basta el href). */
  async function openExternal(event: MouseEvent, url: string) {
    if (!('__TAURI_INTERNALS__' in window)) return;
    event.preventDefault();
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
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

  <div class="contact">
    <p class="muted">¿Has visto un fallo o tienes una idea? La vía preferente es el formulario de contacto.</p>
    <div class="contact__links">
      <a class="btn" href={BUG_URL} target="_blank" rel="noopener" on:click={(e) => openExternal(e, BUG_URL)}>Informar de un fallo</a>
      <a class="btn" href={IDEA_URL} target="_blank" rel="noopener" on:click={(e) => openExternal(e, IDEA_URL)}>Sugerir una mejora</a>
    </div>
    <p class="muted">
      Si lo prefieres, escríbenos a
      <a href={`mailto:${CONTACT_EMAIL}`} on:click={(e) => openExternal(e, `mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</a>
    </p>
  </div>

  <div class="social">
    <p class="muted">Síguenos</p>
    <ul aria-label="Redes sociales">
      {#each SOCIAL_LINKS as s (s.id)}
        <li>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Pockai en ${s.name}`}
            title={`@${SOCIAL_HANDLE} en ${s.name}`}
            on:click={(e) => openExternal(e, s.url)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <path d={s.path} fill="currentColor" />
            </svg>
          </a>
        </li>
      {/each}
    </ul>
  </div>
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
  .contact { display: grid; gap: 8px; justify-items: start; padding-top: 6px; border-top: 1px solid var(--line-soft); width: 100%; }
  .contact p { margin: 0; }
  .contact p a { color: var(--accent); }
  .contact__links { display: flex; flex-wrap: wrap; gap: 8px; }
  .contact__links .btn { text-decoration: none; }
  .social { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
  .social ul { display: flex; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .social a {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line-soft);
    border-radius: 9999px;
    color: var(--ink);
  }
  .social a:hover, .social a:focus-visible { border-color: var(--accent); color: var(--accent); }
</style>
