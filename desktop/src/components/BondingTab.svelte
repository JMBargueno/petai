<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount } from 'svelte';
  import { api, type BondingDetail } from '../lib/api';
  import { reasonIcon } from '../lib/ui/maps';
  import { AsyncState, Badge, Card, EmptyState, FeatureHeader, ListRow, ProgressBar, SectionHeader } from './ui';

  export let pet: any = null;

  let data: BondingDetail | null = null;
  let error = '';
  let loading = true;

  const UNLOCKS: { key: keyof BondingDetail['unlocks']; label: string; icon: string }[] = [
    { key: 'greeting', label: 'Saludo', icon: 'hand' },
    { key: 'memoryRecall', label: 'Memoria', icon: 'brain' },
    { key: 'emotionalReactions', label: 'Emociones', icon: 'smile' },
    { key: 'patternUnlocked', label: 'Patrón exclusivo', icon: 'xp' },
    { key: 'sleepNearCursor', label: 'Duerme cerca', icon: 'moon' },
  ];

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getBonding(pet.id);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: petId = pet?.id;
  $: if (petId && !loading) load();

  onMount(load);
</script>

<div class="ui-stack">
  {#if !pet?.id}
    <EmptyState icon="bond" title="Sin mascota" text="Necesitas una mascota para ver el vínculo." />
  {:else}
    <AsyncState loading={loading && !data} {error} onRetry={load} rows={3} height={64}>
      {#if data}
        <Card variant="hero">
          <FeatureHeader icon="bond" title="Vínculo" sub="Rango: {data.tierName}" tint="var(--color-lavender)">
            <svelte:fragment slot="end"><span class="bond-value">{data.value.toFixed(0)}<small>/100</small></span></svelte:fragment>
          </FeatureHeader>
          <ProgressBar value={data.value} color="linear-gradient(90deg, var(--color-lavender), var(--accent))" />
          <p class="ui-card__hint">Última interacción: {new Date(data.lastInteractionAt).toLocaleString()}</p>
        </Card>

        <SectionHeader title="Desbloqueos" icon="unlock" count="{UNLOCKS.filter((u) => data?.unlocks[u.key]).length}/{UNLOCKS.length}" />
        <div class="unlocks">
          {#each UNLOCKS as u (u.key)}
            <div class="unlock" class:on={data.unlocks[u.key]} title={data.unlocks[u.key] ? 'Desbloqueado' : 'Bloqueado'}>
              <span class="ui-tile__icon"><Ico n={data.unlocks[u.key] ? u.icon : 'lock'} size={16} /></span>
              <small>{u.label}</small>
            </div>
          {/each}
        </div>

        <SectionHeader title="Decaimiento" icon="cold" />
        <ListRow
          icon={data.decayInfo.isDecaying ? 'cold' : 'shield'}
          iconTint={data.decayInfo.isDecaying ? 'var(--color-electric-blue)' : 'var(--success)'}
          title={data.decayInfo.isDecaying ? 'Enfriándose ahora' : 'Estable'}
          sub="Gracia {data.decayInfo.graceWindowHours}h · decae desde {data.decayInfo.decayStartHours}h · {data.decayInfo.decayRatePerDay}/día · acumulado -{data.decayInfo.acumulatedDecay.toFixed(2)}"
          wrap
        >
          <svelte:fragment slot="end">
            <Badge size="sm" icon="clock">{data.decayInfo.hoursSinceInteraction.toFixed(0)}h</Badge>
          </svelte:fragment>
        </ListRow>

        <SectionHeader title="Historial" icon="log" onRefresh={load} {loading} />
        <div class="ui-list ui-list--scroll">
          {#each data.history.items as ev (ev.id)}
            <ListRow icon={reasonIcon(ev.reason)} title={ev.reason} sub={new Date(ev.createdAt).toLocaleDateString()}>
              <svelte:fragment slot="end">
                <span class="delta" class:pos={ev.delta > 0} class:neg={ev.delta < 0}>
                  {ev.delta > 0 ? '+' : ''}{ev.delta.toFixed(2)}
                </span>
                <span class="muted">→ {ev.value.toFixed(0)}</span>
              </svelte:fragment>
            </ListRow>
          {:else}
            <EmptyState compact icon="log" text="Sin cambios registrados." />
          {/each}
        </div>
      {/if}
    </AsyncState>
  {/if}
</div>

<style>
  .bond-value {
    font-family: var(--font-display);
    font-size: 24px;
  }
  .bond-value small {
    font-family: var(--font-ui);
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .unlocks {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-2);
  }
  .unlock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-1);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    --tile-c: var(--surface-2);
  }
  .unlock .ui-tile__icon {
    width: 30px;
    height: 30px;
    color: var(--ink-muted);
  }
  .unlock.on {
    border-color: var(--line);
    --tile-c: var(--color-lavender);
  }
  .unlock.on .ui-tile__icon {
    color: var(--on-color);
  }
  .unlock small {
    font-size: var(--text-caption);
    font-weight: 700;
    color: var(--ink-muted);
    text-align: center;
    line-height: 1.15;
  }
  .ui-stack :global(.ui-row__title) {
    text-transform: capitalize;
  }
  .delta {
    font-weight: 800;
    font-size: var(--text-caption);
    font-variant-numeric: tabular-nums;
  }
  .delta.pos {
    color: var(--success-ink);
  }
  .delta.neg {
    color: var(--danger-ink);
  }
  .muted {
    font-size: var(--text-caption);
  }
</style>
