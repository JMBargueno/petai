<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { inbox, unreadCount, markAllRead, clearInbox } from '../lib/notification-inbox';

  interface Prefs {
    vitals_critical: boolean;
    interaction: boolean;
    achievement: boolean;
    arena: boolean;
    event: boolean;
    maxPerDay: number;
  }

  const CATEGORIES: { key: keyof Omit<Prefs, 'maxPerDay'>; label: string; icon: string }[] = [
    { key: 'vitals_critical', label: 'Vitales críticas', icon: '⚠️' },
    { key: 'interaction', label: 'Interacciones', icon: '🐾' },
    { key: 'achievement', label: 'Logros', icon: '🏆' },
    { key: 'arena', label: 'Arena', icon: '⚔️' },
    { key: 'event', label: 'Eventos', icon: '📢' },
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
  let notice = '';

  function flash(text: string) {
    notice = text;
    setTimeout(() => (notice = ''), 2500);
  }

  async function refresh() {
    loading = true;
    try {
      const me = await api.getMe();
      // `null` ⇒ defaults; si existe, el servidor ya devuelve el objeto resuelto.
      prefs = me.notificationPrefs ? { ...DEFAULTS, ...me.notificationPrefs } : { ...DEFAULTS };
    } catch {
      /* sin sesión o error: se conservan los defaults */
    } finally {
      loading = false;
    }
  }

  async function setPref(key: keyof Omit<Prefs, 'maxPerDay'>, value: boolean) {
    saving = true;
    try {
      await api.updateMe({ notificationPrefs: { [key]: value } });
      prefs = { ...prefs, [key]: value };
      flash('Preferencia guardada');
    } catch {
      flash('No se pudo guardar');
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
      flash(`Máximo ${value}/día`);
    } catch {
      flash('No se pudo guardar');
    } finally {
      saving = false;
    }
  }

  onMount(refresh);
</script>

<section class="notif-panel" aria-label="Ajustes de notificaciones">
  <header>
    <h2>🔔 Notificaciones</h2>
    {#if $unreadCount > 0}
      <button class="badge" on:click={() => markAllRead()} title="Marcar todo como leído">
        {$unreadCount} sin leer
      </button>
    {/if}
  </header>

  {#if loading}
    <p class="muted">Cargando…</p>
  {:else}
    <ul class="toggles">
      {#each CATEGORIES as c (c.key)}
        <li>
          <label>
            <input type="checkbox" checked={prefs[c.key]} on:change={() => setPref(c.key, !prefs[c.key])} disabled={saving} />
            <span class="label">{c.icon} {c.label}</span>
          </label>
        </li>
      {/each}
    </ul>

    <div class="slider-row">
      <label for="maxday">Máx. por día: <strong>{prefs.maxPerDay}</strong></label>
      <input
        id="maxday"
        type="range"
        min="1"
        max="10"
        step="1"
        value={prefs.maxPerDay}
        on:change={(e) => setMaxPerDay(Number((e.target as HTMLInputElement).value))}
        disabled={saving}
      />
    </div>

    {#if notice}
      <p class="notice">{notice}</p>
    {/if}
  {/if}

  {#if $inbox.length > 0}
    <details class="inbox">
      <summary>Inbox ({$inbox.length})</summary>
      <div class="inbox-actions">
        <button on:click={() => markAllRead()}>Marcar leídas</button>
        <button on:click={() => clearInbox()}>Limpiar</button>
      </div>
      <ul class="inbox-list">
        {#each $inbox as n (n.timestamp + n.petId + n.category)}
          <li class:read={n.read}>
            <strong>{n.petName}</strong>: {n.message}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .notif-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 320px;
    padding: 14px;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    color: #e2e8f0;
    backdrop-filter: blur(8px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 { margin: 0; font-size: 15px; }
  .badge {
    background: #f43f5e;
    color: white;
    border: none;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .muted { color: #94a3b8; font-size: 13px; }
  .toggles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .toggles label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; }
  .slider-row { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .slider-row input { width: 100%; }
  .notice { color: #4ade80; font-size: 12px; margin: 0; }
  .inbox { font-size: 12px; }
  .inbox-actions { display: flex; gap: 8px; margin: 6px 0; }
  .inbox-actions button {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .inbox-list { list-style: none; margin: 0; padding: 0; max-height: 160px; overflow-y: auto; }
  .inbox-list li { padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
  .inbox-list li.read { opacity: 0.5; }
</style>
