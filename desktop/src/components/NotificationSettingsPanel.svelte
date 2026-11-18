<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { inbox, unreadCount, markAllRead, clearInbox } from '../lib/notification-inbox';
  import { Badge, Button, Card, EmptyState, ListRow, Notice, SectionHeader, Skeleton, Switch } from './ui';

  interface Prefs {
    vitals_critical: boolean;
    interaction: boolean;
    achievement: boolean;
    arena: boolean;
    event: boolean;
    maxPerDay: number;
  }

  const CATEGORIES: { key: keyof Omit<Prefs, 'maxPerDay'>; label: string; icon: string }[] = [
    { key: 'vitals_critical', label: 'Vitales críticas', icon: 'warn' },
    { key: 'interaction', label: 'Interacciones', icon: 'paw' },
    { key: 'achievement', label: 'Logros', icon: 'trophy' },
    { key: 'arena', label: 'Arena', icon: 'swords' },
    { key: 'event', label: 'Eventos', icon: 'megaphone' },
  ];

  const DEFAULTS: Prefs = {
    vitals_critical: true,
    interaction: true,
    achievement: true,
    arena: true,
    event: true,
    maxPerDay: 3,
  };

  let prefs: Prefs = { ...DEFAULTS };
  let loading = true;
  let saving = false;
  let loadFailed = false;
  /** Valor del deslizador mientras se arrastra (se guarda al soltar). */
  let draftMax: number | null = null;
  let confirmClear = false;
  let notice = '';
  let noticeOk = true;

  function flash(text: string, ok = true) {
    notice = text;
    noticeOk = ok;
    setTimeout(() => (notice = ''), 2500);
  }

  async function refresh() {
    loading = true;
    loadFailed = false;
    try {
      const me = await api.getMe();
      // `null` ⇒ defaults; si existe, el servidor ya devuelve el objeto resuelto.
      prefs = me.notificationPrefs ? { ...DEFAULTS, ...me.notificationPrefs } : { ...DEFAULTS };
    } catch {
      // No se enseñan los valores por defecto como si fueran los guardados.
      loadFailed = true;
    } finally {
      loading = false;
    }
  }

  async function setPref(key: keyof Omit<Prefs, 'maxPerDay'>, value: boolean) {
    saving = true;
    try {
      await api.updateMe({ notificationPrefs: { [key]: value } });
      prefs = { ...prefs, [key]: value };
      flash('Guardado');
    } catch {
      prefs = { ...prefs };
      flash('No se pudo guardar', false);
    } finally {
      saving = false;
    }
  }

  async function setMaxPerDay(value: number) {
    if (value < 1 || value > 10) value = Math.min(10, Math.max(1, value));
    saving = true;
    try {
      await api.updateMe({ notificationPrefs: { maxPerDay: value } });
      prefs = { ...prefs, maxPerDay: value };
      flash(`Como mucho ${value} ${value === 1 ? 'aviso' : 'avisos'} al día`);
    } catch {
      flash('No se pudo guardar', false);
    } finally {
      saving = false;
      draftMax = null;
    }
  }

  onMount(refresh);
</script>

<div class="ui-stack" role="group" aria-label="Ajustes de notificaciones">
  <SectionHeader title="Notificaciones" icon="bell">
    <svelte:fragment slot="end">
      {#if $unreadCount > 0}<Badge tone="danger" size="sm">{$unreadCount} sin leer</Badge>{/if}
    </svelte:fragment>
  </SectionHeader>

  {#if loading}
    <Skeleton rows={5} height={46} />
  {:else if loadFailed}
    <Notice tone="error">
      No se pudieron cargar tus preferencias de avisos.
      <svelte:fragment slot="end"><button class="btn btn--ghost btn--sm" on:click={refresh}>Reintentar</button></svelte:fragment>
    </Notice>
  {:else}
    <div class="ui-list">
      {#each CATEGORIES as c (c.key)}
        <Switch icon={c.icon} label={c.label} checked={prefs[c.key]} disabled={saving} on:change={(e) => setPref(c.key, e.detail)} />
      {/each}
    </div>

    <Card size="sm" variant="flat">
      <label class="slider" for="maxday">
        <span class="ui-progress-label"><span>Avisos al día, como mucho</span><span>{draftMax ?? prefs.maxPerDay}</span></span>
        <input
          id="maxday"
          type="range"
          min="1"
          max="10"
          step="1"
          value={prefs.maxPerDay}
          on:input={(e) => (draftMax = Number((e.target as HTMLInputElement).value))}
          on:change={(e) => setMaxPerDay(Number((e.target as HTMLInputElement).value))}
          disabled={saving}
        />
      </label>
    </Card>

    {#if notice}<Notice tone={noticeOk ? 'ok' : 'error'}>{notice}</Notice>{/if}
  {/if}

  <SectionHeader title="Bandeja" icon="note" count={$inbox.length}>
    <svelte:fragment slot="end">
      {#if $inbox.length > 0}
        {#if confirmClear}
          <Button variant="danger" size="sm" on:click={() => { clearInbox(); confirmClear = false; }}>Borrar todos</Button>
          <Button variant="ghost" size="sm" on:click={() => (confirmClear = false)}>No</Button>
        {:else}
          {#if $unreadCount > 0}<Button variant="ghost" size="sm" icon="check" on:click={() => markAllRead()}>Marcar leídos</Button>{/if}
          <Button variant="ghost" size="sm" icon="trash" on:click={() => (confirmClear = true)}>Vaciar</Button>
        {/if}
      {/if}
    </svelte:fragment>
  </SectionHeader>
  <div class="ui-list ui-list--scroll">
    {#each $inbox as n (n.timestamp + n.petId + n.category)}
      <ListRow icon="bell" title={n.petName} sub={n.message} wrap muted={n.read} />
    {:else}
      <EmptyState compact icon="bell" text="Sin avisos recientes." />
    {/each}
  </div>
</div>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .slider input {
    width: 100%;
    accent-color: var(--accent);
  }
</style>
