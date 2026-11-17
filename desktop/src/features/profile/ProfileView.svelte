<script lang="ts">
  /**
   * Vista de un perfil (propio o de otro jugador): cabecera, vitrina de insignias destacadas,
   * estadísticas e insignias desbloqueadas. En el perfil propio (`own`) la vitrina se puede editar:
   * en modo edición, pulsar una insignia la añade o quita de la vitrina (máx. 3).
   */
  import { createEventDispatcher } from 'svelte';
  import type { ProfileBase, ProfileBadge } from '../../lib/api';
  import {
    TIER_LABELS,
    RARITY_LABELS,
    formatCount,
    formatDate,
    formatMonthYear,
    formatPlayTime,
    sortBadges,
  } from '../../lib/profile-format';
  import SocialAvatar from '../../components/SocialAvatar.svelte';
  import Badge from './Badge.svelte';
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

  const dispatch = createEventDispatcher<{ edit: void; save: void; cancel: void; toggle: string }>();

  $: badges = sortBadges(profile.badges);
  $: byId = new Map(profile.badges.map((b) => [b.id, b]));
  $: featuredIds = editing ? draftFeatured : profile.featuredBadges;
  $: featured = featuredIds.map((id) => byId.get(id)).filter(Boolean) as ProfileBadge[];
  $: s = profile.stats;
  $: rarities = s ? Object.entries(s.byRarity).filter(([, n]) => n > 0) : [];
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
    <div class="soc-empty">
      <span class="soc-empty__icon"><EyeOff size={22} /></span>
      <strong>Perfil privado</strong>
      <p>{profile.displayName} ha decidido no mostrar sus insignias ni estadísticas.</p>
    </div>
  {:else}
    <!-- Vitrina -->
    <section class="soc-card pf-showcase">
      <div class="soc-head">
        <span class="label-caps">Vitrina</span>
        <span class="chip soc-count">{profile.achievementCount.unlocked}/{profile.achievementCount.total}</span>
        {#if own}
          <div class="soc-head__end">
            {#if editing}
              <button class="btn btn--ghost btn--sm" on:click={() => dispatch('cancel')} disabled={saving}>Cancelar</button>
              <button class="btn btn--primary btn--sm" on:click={() => dispatch('save')} disabled={saving}>
                <Check size={14} /> {saving ? 'Guardando…' : 'Guardar'}
              </button>
            {:else if profile.badges.length > 0}
              <button class="btn btn--ghost btn--sm" on:click={() => dispatch('edit')}><Pencil size={13} /> Editar</button>
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
      {#if editing}<p class="soc-card__hint">Pulsa tus insignias para destacarlas (máximo 3).</p>{/if}
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
    <section class="soc-list">
      <div class="soc-head">
        <span class="label-caps">Insignias</span>
        <span class="chip soc-count">{badges.length}</span>
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
              title={`${b.name} · ${TIER_LABELS[b.tier] ?? b.tier}\n${b.description}\nConseguida el ${formatDate(b.unlockedAt)}`}
              aria-pressed={editing ? isFeatured : undefined}
              on:click={() => editing && dispatch('toggle', b.id)}
            >
              <Badge icon={b.badgeIcon} tier={b.tier} size={44} />
              <span class="pf-badge__name">{b.name}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="soc-empty">
          <span class="soc-empty__icon"><Award size={22} /></span>
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
    gap: 14px;
  }
  .pf-head {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-2xl);
    background: color-mix(in srgb, var(--theme-social) 14%, var(--surface));
    box-shadow: 2px 3px 0 var(--color-carbon);
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
    gap: 6px;
    font-size: 16px;
  }
  .pf-name strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pf-pro {
    gap: 3px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: 800;
    background: var(--rarity-legendary);
    border-color: var(--color-carbon);
    color: var(--color-carbon);
  }
  .pf-handle {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .pf-meta {
    font-size: 11px;
    color: var(--ink-muted);
  }
  .pf-title {
    color: var(--ink);
    font-weight: 700;
  }

  .pf-featured {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .pf-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
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
    font-size: 11px;
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
    gap: 6px;
  }
  .pf-stat {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .pf-stat :global(svg) {
    grid-row: span 2;
    color: var(--theme-social);
  }
  .pf-stat strong {
    font-size: 14px;
  }
  .pf-stat span {
    font-size: 10px;
    color: var(--ink-muted);
  }
  .pf-rarities {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pf-rarity {
    font-size: 11px;
    padding: 1px 8px;
    border-color: var(--color-carbon);
    color: var(--color-carbon);
    background: var(--rarity-common);
  }
  .rarity-rare { background: var(--rarity-rare); }
  .rarity-super_rare { background: var(--rarity-super-rare); }
  .rarity-legendary { background: var(--rarity-legendary); }
  .rarity-mythic { background: var(--rarity-mythic); }

  .pf-badges {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 6px;
  }
  .pf-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
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
    border-color: var(--color-carbon);
    background: color-mix(in srgb, var(--theme-social) 22%, var(--surface));
    box-shadow: 1px 2px 0 var(--color-carbon);
  }
  .pf-badge__name {
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
</style>
