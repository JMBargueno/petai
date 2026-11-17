<script lang="ts">
  /** Mascota › Mente (spec 36): personalidad en 5 dimensiones, memoria por capas y vida autónoma. */
  import { onMount } from 'svelte';
  import { api, type PetMind } from '../lib/api';
  import { DIMENSIONS, MEMORY_LAYERS, layerUsage, memoryIcon, relativeTime } from '../lib/mind';
  import { AsyncState, Badge, Card, EmptyState, FeatureHeader, ListRow, ProgressBar, SectionHeader } from './ui';

  export let pet: any = null;

  let data: PetMind | null = null;
  let error = '';
  let loading = true;
  let now = new Date();

  const TIER_LABEL: Record<string, string> = { chat: 'Charla', memory: 'Memoria', agent: 'Agente' };

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getMind(pet.id);
      now = new Date();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Recarga al cambiar de mascota (no en cada actualización del objeto `pet`)
  let loadedFor = '';
  $: if (pet?.id && pet.id !== loadedFor) {
    loadedFor = pet.id;
    data = null;
    load();
  }

  onMount(() => {
    // Las fechas relativas se refrescan solas mientras la vista está abierta
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });
</script>

<div class="ui-stack">
  {#if !pet?.id}
    <EmptyState icon="brain" title="Sin mascota" text="Necesitas una mascota para ver su mente." />
  {:else}
    <AsyncState loading={loading && !data} {error} onRetry={load} rows={4} height={56}>
      {#if data}
        <Card variant="hero">
          <FeatureHeader icon="brain" title="Mente de {pet.name ?? 'tu Pockai'}" sub="Así es y así recuerda" tint="var(--theme-ai)">
            <svelte:fragment slot="end">
              <Badge size="sm" icon="brain" tone="tint">{TIER_LABEL[data.intelligenceTier] ?? data.intelligenceTier}</Badge>
            </svelte:fragment>
          </FeatureHeader>
          <div class="chips">
            {#if data.mood}<Badge size="sm" icon="smile">{data.mood}</Badge>{/if}
            {#if data.bondingTier}<Badge size="sm" icon="bond">{data.bondingTier}</Badge>{/if}
          </div>
        </Card>

        <SectionHeader title="Personalidad" icon="smile" onRefresh={load} {loading} />
        <div class="dims">
          {#each DIMENSIONS as d (d.id)}
            {@const dim = data.dimensions[d.id]}
            {#if dim}
              <div class="dim" title={dim.keyword}>
                <ProgressBar
                  value={dim.value}
                  color={d.tint}
                  label={d.label}
                  detail="{dim.label} · {Math.round(dim.value)}"
                />
              </div>
            {/if}
          {/each}
        </div>

        <SectionHeader title="Memoria" icon="folder" />
        <div class="ui-list">
          {#each MEMORY_LAYERS as l (l.id)}
            {@const count = data.memory.counts[l.id] ?? 0}
            {@const cap = data.memory.capacity?.[l.id] ?? null}
            <ListRow icon={l.icon} title={l.label} sub={l.hint} wrap>
              <svelte:fragment slot="end">
                <div class="cap">
                  <span class="cap-num">{count}{#if cap !== null}<small>/{cap}</small>{/if}</span>
                  {#if cap !== null}<ProgressBar size="sm" value={layerUsage(count, cap)} color="var(--theme-ai)" />{/if}
                </div>
              </svelte:fragment>
            </ListRow>
          {/each}
        </div>

        <SectionHeader title="Vida reciente" icon="log" count={data.recentLife.length || null} />
        <div class="ui-list ui-list--scroll">
          {#each data.recentLife as e (e.id)}
            <ListRow icon={memoryIcon(e.kind)} sub={e.content} wrap>
              <svelte:fragment slot="end">
                <time class="when" datetime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>{relativeTime(e.createdAt, now)}</time>
              </svelte:fragment>
            </ListRow>
          {:else}
            <EmptyState compact icon="log" text="Aún no ha vivido nada por su cuenta. Mientras no estés, explorará, jugará y conocerá a otros Pockais." />
          {/each}
        </div>
      {/if}
    </AsyncState>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips :global(.ui-badge) {
    text-transform: capitalize;
  }
  .dims {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    min-width: 64px;
  }
  .cap :global(.ui-progress) {
    width: 64px;
  }
  .cap-num {
    font-weight: 800;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .cap-num small {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-muted);
  }
  .when {
    font-size: 11px;
    color: var(--ink-muted);
    white-space: nowrap;
  }
</style>
