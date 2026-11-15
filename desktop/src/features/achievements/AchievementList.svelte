<script lang="ts">
  import Ico from '../../components/Ico.svelte';
  import type { Achievement, AchievementStatus } from './achievements.api';

  /**
   * Lista de logros (feature 008). Muestra los logros de una categoría con nombre, descripción,
   * progreso (`current/target`), recompensa y estado. `category` se usa como filtro (opcional);
   * `onClaim` emite la reclamación al backend cuando se pulsa sobre un logro desbloqueado.
   */
  export let achievements: Achievement[] = [];
  export let category: string = '';
  export let onClaim: (id: string) => void = () => {};

  const CATEGORIES = ['care', 'battle', 'ai', 'collection', 'social'] as const;
  const CATEGORY_LABELS: Record<string, string> = {
    care: 'Cuidado',
    battle: 'Batalla',
    ai: 'IA',
    collection: 'Colección',
    social: 'Social',
  };

  $: filtered = category ? achievements.filter((a) => a.category === category) : achievements;

  function statusLabel(s: AchievementStatus): string {
    if (s === 'unlocked') return 'Desbloqueado';
    if (s === 'in_progress') return 'En progreso';
    return 'Bloqueado';
  }
</script>

<div class="list">
  <div class="list__filters" role="tablist">
    <button
      class:list={['chip', { chip--active: category === '' }]}
      on:click={() => (category = '')}
      aria-pressed={category === ''}
    >
      Todas
    </button>
    {#each CATEGORIES as cat (cat)}
      <button
        class:list={['chip', { 'chip--active': category === cat }]}
        on:click={() => (category = cat)}
        aria-pressed={category === cat}
      >
        {CATEGORY_LABELS[cat]}
      </button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <p class="list__empty">Sin logros para mostrar.</p>
  {:else}
    <ul class="list__items">
      {#each filtered as a (a.id)}
        <li class:list={['item', `item--${a.status}`]}>
          <div class="item__main">
            <div class="item__title">
              <span class="item__name">{a.name}</span>
              <span class:list={['badge', `badge--${a.tier}`]}>{a.tier}</span>
            </div>
            <p class="item__desc">{a.description}</p>
            {#if a.status !== 'unlocked'}
              <div class="item__progress">
                <div class="item__bar">
                  <div class="item__fill" style={`width: ${Math.min(100, (a.current / a.target) * 100)}%`}></div>
                </div>
                <span class="item__count">{a.current}/{a.target}</span>
              </div>
            {/if}
          </div>
          <div class="item__side">
            <span class="item__status">{statusLabel(a.status)}</span>
            <span class="item__reward">+{a.reward.coins}<Ico n="coin" /> {a.reward.gems ? `+${a.reward.gems}<Ico n="gem" /> ` : ''}{a.reward.xp}<Ico n="xp" /></span>
            {#if a.status === 'unlocked' && !a.claimed}
              <button class="item__claim" on:click={() => onClaim(a.id)}>Reclamar</button>
            {:else if a.status === 'unlocked'}
              <span class="item__claimed">Reclamado</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .list { font-family: inherit; color: var(--ink); }
  .list__filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .chip {
    background: #141824; color: var(--ink-muted); border: 1px solid #232a3a;
    padding: 4px 12px; border-radius: 999px; cursor: pointer; font-size: 0.8rem;
  }
  .chip--active { background: #1f2a44; color: var(--ink); border-color: var(--line); }
  .list__empty { color: var(--ink-muted); font-size: 0.9rem; }
  .list__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .item {
    display: flex; justify-content: space-between; gap: 12px;
    background: var(--surface-2); border: 1px solid #1e2431; border-radius: var(--radius-2xl); padding: 10px 12px;
  }
  .item--unlocked { border-color: #3a3320; background: #17140d; }
  .item__title { display: flex; align-items: center; gap: 8px; }
  .item__name { font-weight: 600; color: var(--ink); }
  .badge { font-size: 0.65rem; text-transform: uppercase; padding: 1px 6px; border-radius: var(--radius-2xl); }
  .badge--common { background: #2a2f3a; color: var(--ink-muted); }
  .badge--rare { background: #1c2a44; color: #7ea0ff; }
  .badge--epic { background: #2a1c44; color: var(--color-lavender); }
  .badge--legendary { background: #3a2a10; color: var(--warning-ink); }
  .item__desc { margin: 4px 0 0; font-size: 0.82rem; color: var(--ink-muted); }
  .item__progress { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .item__bar { flex: 1; height: 6px; background: #1c212e; border-radius: var(--radius-2xl); overflow: hidden; }
  .item__fill { height: 100%; background: #5b8cff; }
  .item__count { font-size: 0.72rem; color: var(--ink-muted); }
  .item__side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .item__status { font-size: 0.72rem; color: var(--ink-muted); }
  .item--unlocked .item__status { color: var(--warning-ink); }
  .item__reward { font-size: 0.78rem; color: var(--ink); }
  .item__claim {
    background: #2f6df0; color: var(--ink); border: none; padding: 4px 12px; border-radius: var(--radius-2xl); cursor: pointer;
  }
  .item__claimed { font-size: 0.72rem; color: var(--ink-muted); }
</style>
