<script lang="ts">
  import Button from './Button.svelte';
  /**
   * Vista de un perfil (propio o de otro jugador): cabecera, vitrina de insignias destacadas,
   * estadísticas e insignias desbloqueadas. En el perfil propio (`own`) la vitrina se puede editar:
   * en modo edición, pulsar una insignia la añade o quita de la vitrina (máx. 3).
   */
  import { createEventDispatcher } from 'svelte';
  type ProfileBase = any;
  type ProfileBadge = any;
  import {
    TIER_LABELS,
    RARITY_LABELS,
    formatCount,
    formatDate,
    formatMonthYear,
    formatPlayTime,
    sortBadges,
  } from './profile-format';
  import SocialAvatar from './SocialAvatar.svelte';
  import Badge from './AchievementBadge.svelte';
  import {
    Crown, Clock, Drumstick, Egg, Flame, Users, DoorOpen, Gem, Sparkles, Coins, EyeOff, Pencil, Check, Award,
  } from 'lucide-svelte';

  export let profile: ProfileBase;
  export let own = false;
  /** Modo edición de la vitrina (solo perfil propio). */
  export let editing = false;
  /** Vitrina en edición (ids). */
  export let draftFeatured: string[] = [];
  export let saving = false;
  /** Insignia cuyo detalle está abierto (fuera del modo edición, pulsar una insignia lo muestra). */
  let detailId = '';
  $: detail = badges.find((b) => b.id === detailId) ?? null;

  const dispatch = createEventDispatcher<{ edit: void; save: void; cancel: void; toggle: string }>();

  $: badges = sortBadges<ProfileBadge>(profile.badges);
  $: byId = new Map(profile.badges.map((b) => [b.id, b]));
  $: featuredIds = editing ? draftFeatured : profile.featuredBadges;
  $: featured = featuredIds.map((id) => byId.get(id)).filter(Boolean) as ProfileBadge[];
  $: s = profile.stats;
  $: rarities = s ? (Object.entries(s.byRarity) as [string, number][]).filter(([, n]) => n > 0) : [];
</script>

<div class="pf">
  <!-- Cabecera -->
  <header class="pf-head">
    <SocialAvatar name={profile.displayName || profile.handle || '?'} size={56} />
    <div class="pf-head__body">
      <div class="pf-name">
        <strong>{profile.displayName}</strong>
        {#if profile.isPro}<span class="chip pf-pro"><Crown size={12} /> PRO</span>{/if}
      </div>
      {#if profile.handle}<span class="pf-handle">@{profile.handle}</span>{/if}
      <span class="pf-meta">
        {#if profile.title}<span class="pf-title">{profile.title}</span> ·{/if}
        Desde {formatMonthYear(profile.createdAt)} · {formatCount(profile.accountXp)} XP
      </span>
      {#if profile.pet}
        <span class="pf-meta">
          Mascota: <strong>{profile.pet.nickname}</strong> ({profile.pet.speciesName}, nv. {profile.pet.level}{profile.pet.shiny ? ', shiny' : ''})
        </span>
      {/if}
    </div>
  </header>

  {#if !s && !own}
    <div class="ui-empty">
      <span class="ui-empty__icon"><EyeOff size={22} /></span>
      <strong>Perfil privado</strong>
      <p>{profile.displayName} ha decidido no mostrar sus insignias ni estadísticas.</p>
    </div>
  {:else}
    <!-- Vitrina -->
    <section class="ui-card pf-showcase">
      <div class="ui-head">
        <span class="label-caps">Vitrina</span>
        <span class="chip ui-count">{profile.achievementCount.unlocked}/{profile.achievementCount.total}</span>
        {#if own}
          <div class="ui-head__end">
            {#if editing}
              <Button variant="ghost" size="sm" on:click={() => dispatch('cancel')} disabled={saving}>Cancelar</Button>
              <Button variant="primary" size="sm" on:click={() => dispatch('save')} disabled={saving}>
                <Check size={14} /> {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            {:else if profile.badges.length > 0}
              <Button variant="ghost" size="sm" on:click={() => dispatch('edit')}><Pencil size={13} /> Editar</Button>
            {/if}
          </div>
        {/if}
      </div>
      <div class="pf-featured">
        {#each [0, 1, 2] as slot (slot)}
          {@const b = featured[slot]}
          <div class="pf-slot" class:empty={!b}>
            {#if b}
              <Badge icon={b.badgeIcon} tier={b.tier} size={64} label={b.name} />
              <span class="pf-slot__name">{b.name}</span>
            {:else}
              <span class="pf-slot__ghost"><Award size={22} /></span>
              <span class="pf-slot__name muted">{own ? (editing ? 'Elige abajo' : 'Vacío') : '—'}</span>
            {/if}
          </div>
        {/each}
      </div>
      {#if editing}<p class="ui-card__hint">Pulsa tus insignias para destacarlas (máximo 3).</p>{/if}
    </section>

    <!-- Estadísticas -->
    {#if s}
      <section class="pf-stats" aria-label="Estadísticas">
        <div class="pf-stat"><Clock size={16} /><strong>{formatPlayTime(s.playMinutes)}</strong><span>jugado</span></div>
        <div class="pf-stat"><Drumstick size={16} /><strong>{formatCount(s.feeds)}</strong><span>comidas dadas</span></div>
        <div class="pf-stat"><Flame size={16} /><strong>{s.streakCurrent} d</strong><span>racha (mejor {s.streakBest})</span></div>
        <div class="pf-stat"><Egg size={16} /><strong>{formatCount(s.eggsHatched)}</strong><span>huevos abiertos</span></div>
        <div class="pf-stat"><Users size={16} /><strong>{s.friends}</strong><span>amigos</span></div>
        <div class="pf-stat"><DoorOpen size={16} /><strong>{formatCount(s.habitatVisits)}</strong><span>visitas</span></div>
        {#if s.proDays > 0}<div class="pf-stat"><Crown size={16} /><strong>{s.proDays} d</strong><span>siendo PRO</span></div>{/if}
        {#if s.shinies > 0}<div class="pf-stat"><Sparkles size={16} /><strong>{s.shinies}</strong><span>shiny</span></div>{/if}
        {#if s.coinsSpent !== undefined}<div class="pf-stat"><Coins size={16} /><strong>{formatCount(s.coinsSpent)}</strong><span>monedas gastadas</span></div>{/if}
        {#if s.gemsSpent}<div class="pf-stat"><Gem size={16} /><strong>{formatCount(s.gemsSpent)}</strong><span>gemas gastadas</span></div>{/if}
      </section>
      {#if rarities.length}
        <div class="pf-rarities">
          {#each rarities as [r, n] (r)}
            <span class="chip pf-rarity rarity-{r}">{RARITY_LABELS[r] ?? r} × {n}</span>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- Insignias -->
    <section class="ui-list">
      <div class="ui-head">
        <span class="label-caps">Insignias</span>
        <span class="chip ui-count">{badges.length}</span>
      </div>
      {#if badges.length}
        <div class="pf-badges">
          {#each badges as b (b.id)}
            {@const isFeatured = featuredIds.includes(b.id)}
            <button
              type="button"
              class="pf-badge"
              class:selectable={editing}
              class:featured={editing && isFeatured}
              title={editing ? (isFeatured ? 'Quitar de la vitrina' : 'Poner en la vitrina') : 'Ver detalle'}
              aria-pressed={editing ? isFeatured : undefined}
              aria-expanded={editing ? undefined : detailId === b.id}
              on:click={() => (editing ? dispatch('toggle', b.id) : (detailId = detailId === b.id ? '' : b.id))}
            >
              <Badge icon={b.badgeIcon} tier={b.tier} size={44} />
              <span class="pf-badge__name">{b.name}</span>
            </button>
          {/each}
        </div>
        {#if detail && !editing}
          <div class="ui-notice ui-notice--info pf-detail" role="status">
            <div class="ui-notice__body">
              <strong>{detail.name}</strong> · {TIER_LABELS[detail.tier] ?? detail.tier}
              <br />{detail.description}
              <br /><small>Conseguida el {formatDate(detail.unlockedAt)}</small>
            </div>
          </div>
        {/if}
      {:else}
        <div class="ui-empty">
          <span class="ui-empty__icon"><Award size={22} /></span>
          <strong>Sin insignias todavía</strong>
          <p>{own ? 'Cuida a tu mascota, juega y haz amigos para conseguir las primeras.' : 'Aún no ha conseguido ninguna.'}</p>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .pf {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .pf-head {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-2xl);
    background: color-mix(in srgb, var(--theme-social) 14%, var(--surface));
    box-shadow: 2px 3px 0 var(--line);
  }
  .pf-head__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .pf-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-body-lg);
  }
  .pf-name strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pf-pro {
    gap: 3px;
    padding: 1px var(--space-2);
    font-size: var(--text-caption);
    font-weight: 800;
    background: var(--rarity-legendary);
    border-color: var(--on-color);
    color: var(--on-color);
  }
  .pf-handle {
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--ink-muted);
  }
  .pf-meta {
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .pf-title {
    color: var(--ink);
    font-weight: 700;
  }

  .pf-featured {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
  }
  .pf-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-1);
    min-width: 0;
  }
  .pf-slot__ghost {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 2px dashed var(--line);
    border-radius: 50%;
    color: var(--ink-muted);
  }
  .pf-slot__name {
    font-size: var(--text-caption);
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
  }
  .muted {
    color: var(--ink-muted);
    font-weight: 500;
  }

  .pf-stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .pf-stat {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--space-2);
    align-items: center;
    padding: var(--space-2) var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .pf-stat :global(svg) {
    grid-row: span 2;
    color: var(--theme-social);
  }
  .pf-stat strong {
    font-size: var(--text-body);
  }
  .pf-stat span {
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .pf-rarities {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pf-rarity {
    font-size: var(--text-caption);
    padding: 1px var(--space-2);
    border-color: var(--on-color);
    color: var(--on-color);
    background: var(--rarity-common);
  }
  .rarity-rare { background: var(--rarity-rare); }
  .rarity-super_rare { background: var(--rarity-super-rare); }
  .rarity-legendary { background: var(--rarity-legendary); }
  .rarity-mythic { background: var(--rarity-mythic); }

  .pf-badges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: var(--space-2);
  }
  .pf-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-2xl);
    background: transparent;
    color: var(--ink);
    font: inherit;
    cursor: default;
    transition: background var(--dur-1), border-color var(--dur-1), translate var(--dur-1);
  }
  .pf-badge.selectable {
    cursor: pointer;
  }
  .pf-badge.selectable:hover {
    background: var(--surface-2);
    translate: 0 -1px;
  }
  .pf-badge.featured {
    border-color: var(--line);
    background: color-mix(in srgb, var(--theme-social) 22%, var(--surface));
    box-shadow: 1px 2px 0 var(--line);
  }
  .pf-badge__name {
    font-size: var(--text-caption);
    font-weight: 700;
    text-align: center;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
</style>
