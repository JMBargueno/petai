<script lang="ts">
  import { onMount } from 'svelte';
  import { ExternalLink } from 'lucide-svelte';
  import { Button, Notice, ProgressBar, SectionHeader } from './ui';
  import { updateState, checkForUpdates, installUpdate } from '../lib/updater';
  import { SOCIAL_HANDLE, SOCIAL_LINKS } from '../lib/social';
  import { restartOnboarding } from '../lib/onboarding';

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
  /** El mensaje técnico del actualizador no se enseña tal cual. */
  const UPDATE_ERROR = 'No se pudo comprobar o instalar la actualización. Revisa tu conexión e inténtalo de nuevo.';

  $: busy = s.status === 'checking' || s.status === 'downloading' || s.status === 'ready';
</script>

<div class="ui-stack" role="group" aria-label="Acerca de Pockai">
  <SectionHeader title="Versión" icon="info" />
  <p class="about-version">Pockai <strong>{version || '—'}</strong></p>

  {#if s.status === 'available'}
    <Notice tone="info" icon="gift">
      <strong>Hay una versión nueva: {s.version}</strong>
      {#if s.notes}<p class="notes">{s.notes}</p>{/if}
    </Notice>
    <Button variant="primary" block icon="refresh" on:click={installUpdate}>Instalar y reiniciar</Button>
  {:else if s.status === 'downloading'}
    <ProgressBar value={(s.progress ?? 0) * 100} label="Descargando la versión {s.version}…" detail={s.progress != null ? `${Math.round(s.progress * 100)}%` : ''} />
  {:else if s.status === 'ready'}
    <Notice tone="ok">Versión {s.version} instalada. Reiniciando…</Notice>
  {:else}
    <Button icon="refresh" loading={s.status === 'checking'} disabled={busy} on:click={() => checkForUpdates()}>
      {s.status === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
    </Button>
    {#if s.status === 'upToDate'}
      <Notice tone="ok">Tienes la última versión.</Notice>
    {:else if s.status === 'error'}
      <Notice tone="error">{UPDATE_ERROR}</Notice>
    {/if}
  {/if}

  <SectionHeader title="Ayuda" icon="help" />
  <Button variant="ghost" icon="book" on:click={() => restartOnboarding()}>Ver la guía de inicio otra vez</Button>
  <p class="form-hint">¿Has visto un fallo o tienes una idea? Cuéntanoslo con el formulario de contacto (se abre en tu navegador).</p>
  <div class="links">
    <a class="btn" href={BUG_URL} target="_blank" rel="noopener" on:click={(e) => openExternal(e, BUG_URL)}>
      Informar de un fallo <ExternalLink size={14} aria-hidden="true" /><span class="sr-only">(se abre en el navegador)</span>
    </a>
    <a class="btn" href={IDEA_URL} target="_blank" rel="noopener" on:click={(e) => openExternal(e, IDEA_URL)}>
      Sugerir una mejora <ExternalLink size={14} aria-hidden="true" /><span class="sr-only">(se abre en el navegador)</span>
    </a>
  </div>
  <p class="form-hint">
    Si lo prefieres, escríbenos a
    <a class="mail" href={`mailto:${CONTACT_EMAIL}`} on:click={(e) => openExternal(e, `mailto:${CONTACT_EMAIL}`)}>{CONTACT_EMAIL}</a>
  </p>

  <SectionHeader title="Síguenos" icon="megaphone" />
  <ul class="social" aria-label="Redes sociales">
    {#each SOCIAL_LINKS as link (link.id)}
      <li>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Pockai en ${link.name} (se abre en el navegador)`}
          title={`@${SOCIAL_HANDLE} en ${link.name}`}
          on:click={(e) => openExternal(e, link.url)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d={link.path} fill="currentColor" />
          </svg>
        </a>
      </li>
    {/each}
  </ul>
</div>

<style>
  .about-version {
    margin: 0;
    font-size: var(--text-body);
  }
  .notes {
    margin: var(--space-1) 0 0;
    white-space: pre-line;
    max-height: 120px;
    overflow-y: auto;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .links .btn {
    text-decoration: none;
  }
  .mail {
    color: var(--accent-ink);
  }
  .social {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .social a {
    display: grid;
    place-items: center;
    width: var(--control-h);
    height: var(--control-h);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pills);
    color: var(--ink);
    transition: border-color var(--dur-1), color var(--dur-1);
  }
  .social a:hover,
  .social a:focus-visible {
    border-color: var(--line);
    color: var(--accent-ink);
  }
</style>
