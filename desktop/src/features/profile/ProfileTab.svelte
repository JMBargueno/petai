<script lang="ts">
  /**
   * Social › Mi Perfil: tus datos, vitrina de insignias, estadísticas, colección completa de logros
   * (con progreso de los que faltan) y la opción de mostrar u ocultar tus insignias a los demás.
   */
  import { onMount, onDestroy } from 'svelte';
  import { api, type Achievement, type MyProfile } from '../../lib/api';
  import { onAchievementUnlocked } from '../achievements/achievements.api';
  import { CATEGORY_LABELS, TIER_LABELS, formatProgress, progressRatio, toggleFeatured } from '../../lib/profile-format';
  import ProfileView from './ProfileView.svelte';
  import Badge from './Badge.svelte';
  import { AlertCircle, RefreshCw, Eye, EyeOff, CircleCheck } from 'lucide-svelte';

  let profile: MyProfile | null = null;
  let achievements: Achievement[] = [];
  let loading = true;
  let error = '';
  let ok = '';

  let editing = false;
  let draft: string[] = [];
  let saving = false;
  let savingPrivacy = false;

  let category = 'all';
  let showUnlocked = true;

  $: categories = Object.keys(CATEGORY_LABELS).filter((c) => achievements.some((a) => a.category === c));
  $: visible = achievements
    .filter((a) => category === 'all' || a.category === category)
    .filter((a) => showUnlocked || a.status !== 'unlocked')
    .sort(
      (a, b) =>
        Number(b.status === 'unlocked') - Number(a.status === 'unlocked') ||
        progressRatio(b.current, b.target) - progressRatio(a.current, a.target),
    );

  async function load() {
    loading = true;
    error = '';
    try {
      const [p, list] = await Promise.all([api.getMyProfile(), api.getAchievements()]);
      profile = p;
      achievements = Object.values(list.categories).flat();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function startEdit() {
    if (!profile) return;
    draft = [...profile.featuredBadges];
    editing = true;
    ok = '';
  }

  function toggle(id: string) {
    const next = toggleFeatured(draft, id);
    if (next) draft = next;
    else error = 'La vitrina ya tiene 3 insignias: quita una antes de añadir otra.';
  }

  async function save() {
    if (!profile) return;
    saving = true;
    error = '';
    try {
      const res = await api.setFeaturedBadges(draft);
      profile = { ...profile, featuredBadges: res.featuredBadges };
      editing = false;
      ok = 'Vitrina actualizada.';
    } catch (e: any) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  async function togglePrivacy() {
    if (!profile) return;
    savingPrivacy = true;
    error = '';
    ok = '';
    const next = !profile.achievementsPublic;
    try {
      await api.updateMe({ achievementsPublic: next });
      profile = { ...profile, achievementsPublic: next };
      ok = next ? 'Tus insignias y estadísticas son visibles para los demás.' : 'Tus insignias y estadísticas ahora son privadas.';
    } catch (e: any) {
      error = e.message;
    } finally {
      savingPrivacy = false;
    }
  }

  // Un logro desbloqueado mientras el perfil está abierto se refleja al momento.
  let stopUnlocked = () => {};
  onMount(() => {
    void load();
    stopUnlocked = onAchievementUnlocked(() => {
      if (!editing) void load();
    });
  });
  onDestroy(() => stopUnlocked());
</script>

<div class="ui">
  {#if error}<div class="ui-notice ui-notice--error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>{/if}
  {#if ok}<div class="ui-notice ui-notice--ok" role="status"><CircleCheck size={15} /><span>{ok}</span></div>{/if}

  {#if loading && !profile}
    <div class="ui-loading" aria-label="Cargando perfil">
      <div class="ui-skel"></div>
      <div class="ui-skel"></div>
      <div class="ui-skel"></div>
    </div>
  {:else if profile}
    <ProfileView
      {profile}
      own
      {editing}
      draftFeatured={draft}
      {saving}
      on:edit={startEdit}
      on:cancel={() => (editing = false)}
      on:save={save}
      on:toggle={(e) => toggle(e.detail)}
    />

    <!-- Privacidad -->
    <div class="ui-card pr-privacy">
      <span class="ui-card__title">
        {#if profile.achievementsPublic}<Eye size={15} />{:else}<EyeOff size={15} />{/if}
        {profile.achievementsPublic ? 'Perfil visible' : 'Perfil privado'}
      </span>
      <p class="ui-card__hint">
        {profile.achievementsPublic
          ? 'Tus amigos y otros jugadores ven tus insignias y estadísticas.'
          : 'Los demás solo ven tu nombre y tu mascota.'}
      </p>
      <button class="btn btn--sm" class:btn--primary={!profile.achievementsPublic} disabled={savingPrivacy} on:click={togglePrivacy}>
        {profile.achievementsPublic ? 'Ocultar mis insignias' : 'Mostrar mis insignias'}
      </button>
    </div>

    <!-- Colección completa -->
    <section class="ui-list">
      <div class="ui-head">
        <span class="label-caps">Logros</span>
        <div class="ui-head__end">
          <label class="pr-check"><input type="checkbox" bind:checked={showUnlocked} /> Conseguidos</label>
          <button class="btn btn--ghost btn--icon ui-ibtn ui-refresh" class:spinning={loading} title="Actualizar" aria-label="Actualizar perfil" on:click={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div class="pr-filters" role="group" aria-label="Filtrar por categoría">
        <button class="chip" class:active={category === 'all'} aria-pressed={category === 'all'} on:click={() => (category = 'all')}>Todos</button>
        {#each categories as c (c)}
          <button class="chip" class:active={category === c} aria-pressed={category === c} on:click={() => (category = c)}>{CATEGORY_LABELS[c]}</button>
        {/each}
      </div>
      {#each visible as a (a.id)}
        {@const done = a.status === 'unlocked'}
        <div class="ui-row pr-ach" class:done>
          <Badge icon={a.badgeIcon} tier={a.tier} size={40} locked={!done} label={a.name} />
          <div class="ui-row__body">
            <span class="ui-row__title">{a.name}</span>
            <span class="ui-row__sub">{a.description}</span>
            {#if !done}
              <div class="pr-bar" aria-label="Progreso {formatProgress(a.id, a.current, a.target)}">
                <i style="width: {progressRatio(a.current, a.target) * 100}%"></i>
              </div>
            {/if}
          </div>
          <div class="pr-side">
            <span class="pr-tier tier-{a.tier}">{TIER_LABELS[a.tier] ?? a.tier}</span>
            {#if !done}<span class="pr-count">{formatProgress(a.id, a.current, a.target)}</span>{/if}
          </div>
        </div>
      {:else}
        <div class="ui-empty"><strong>Nada por aquí</strong><p>No hay logros con este filtro.</p></div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .pr-privacy {
    gap: var(--space-2);
  }
  .pr-privacy .btn {
    align-self: flex-start;
  }
  .pr-check {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .pr-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pr-filters .chip {
    cursor: pointer;
    font-size: var(--text-caption);
    padding: 2px var(--space-2);
  }
  .pr-filters .chip.active {
    background: var(--theme-social);
    border-color: var(--on-color);
    color: var(--on-color);
    font-weight: 700;
  }
  .pr-ach.done {
    border-color: var(--line);
  }
  .pr-ach:not(.done) .ui-row__title {
    color: var(--ink-muted);
  }
  .pr-ach .ui-row__sub {
    white-space: normal;
  }
  .pr-bar {
    height: 5px;
    margin-top: var(--space-1);
    border-radius: var(--radius-pills);
    background: var(--surface-2);
    overflow: hidden;
  }
  .pr-bar i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--theme-social);
  }
  .pr-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }
  .pr-tier {
    padding: 0 var(--space-2);
    border: 1px solid var(--on-color);
    border-radius: var(--radius-pills);
    font-size: var(--text-caption);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--on-color);
    background: var(--rarity-common);
  }
  .pr-tier.tier-rare { background: var(--rarity-rare); }
  .pr-tier.tier-epic { background: var(--rarity-super-rare); }
  .pr-tier.tier-legendary { background: var(--rarity-legendary); }
  .pr-count {
    font-size: var(--text-caption);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
