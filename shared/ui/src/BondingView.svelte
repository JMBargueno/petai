<script lang="ts">
  /**
   * Vínculo con la mascota: valor y rango, desbloqueos, si se está enfriando y el historial. Solo
   * pinta: el contenedor de cada app pide los datos cuando cambia la mascota.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';
  import { reasonIcon } from './maps';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Card from './Card.svelte';
  import EmptyState from './EmptyState.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import ListRow from './ListRow.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import SectionHeader from './SectionHeader.svelte';

  /** Si hay mascota activa. Sin ella no hay vínculo que enseñar. */
  export let hasPet = true;
  /** Detalle del vínculo tal como lo devuelve el servidor. */
  export let data: any = null;
  export let loading = false;
  export let error = '';

  const dispatch = createEventDispatcher<{ refresh: void }>();
  const load = () => dispatch('refresh');

  const UNLOCKS: { key: string; label: string; icon: string }[] = [
    { key: 'greeting', label: 'Saludo', icon: 'hand' },
    { key: 'memoryRecall', label: 'Memoria', icon: 'brain' },
    { key: 'emotionalReactions', label: 'Emociones', icon: 'smile' },
    { key: 'patternUnlocked', label: 'Patrón exclusivo', icon: 'xp' },
    { key: 'sleepNearCursor', label: 'Duerme cerca', icon: 'moon' },
  ];

  const REASONS: Record<string, string> = {
    feed: 'Le diste de comer',
    clean: 'Lo bañaste',
    play: 'Jugasteis juntos',
    chat: 'Hablasteis',
    sleep: 'Durmió bien',
    visit: 'Recibió una visita',
    battle: 'Combatisteis juntos',
    decay: 'Se enfrió por falta de trato',
    login: 'Volviste a verlo',
  };
  const reasonLabel = (r: string) => REASONS[r] ?? r.replace(/_/g, ' ');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${Math.abs(n) < 10 ? n.toFixed(1).replace('.', ',') : n.toFixed(0)}`;

  $: decay = data?.decayInfo;
  $: decayText = !decay
    ? ''
    : decay.isDecaying
      ? `Lleva ${decay.hoursSinceInteraction.toFixed(0)} h sin trato y pierde ${decay.decayRatePerDay} puntos al día. Cualquier cuidado lo detiene.`
      : `Empezará a enfriarse si pasan ${decay.decayStartHours} h sin que lo cuides o habléis.`;
</script>

<div class="ui-stack">
  {#if !hasPet}
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
            <div class="unlock" class:on={data.unlocks[u.key]}>
              <span class="ui-tile__icon" aria-hidden="true"><Ico n={data.unlocks[u.key] ? u.icon : 'lock'} size={16} /></span>
              <small>{u.label}</small>
              <small class="unlock-state">{data.unlocks[u.key] ? 'Activo' : 'Bloqueado'}</small>
            </div>
          {/each}
        </div>

        <SectionHeader title="Estado del vínculo" icon="cold" />
        <ListRow
          icon={data.decayInfo.isDecaying ? 'cold' : 'shield'}
          iconTint={data.decayInfo.isDecaying ? 'var(--color-electric-blue)' : 'var(--success)'}
          title={data.decayInfo.isDecaying ? 'Enfriándose ahora' : 'Estable'}
          sub={decayText}
          wrap
        >
          <svelte:fragment slot="end">
            <Badge size="sm" icon="clock" title="Tiempo desde la última interacción">hace {data.decayInfo.hoursSinceInteraction.toFixed(0)} h</Badge>
          </svelte:fragment>
        </ListRow>

        <SectionHeader title="Historial" icon="log" onRefresh={load} {loading} />
        <div class="ui-list ui-list--scroll">
          {#each data.history.items as ev (ev.id)}
            <ListRow icon={reasonIcon(ev.reason)} title={reasonLabel(ev.reason)} sub={new Date(ev.createdAt).toLocaleDateString()}>
              <svelte:fragment slot="end">
                <span class="delta" class:pos={ev.delta > 0} class:neg={ev.delta < 0}>
                  {signed(ev.delta)}
                </span>
                <span class="muted" title="Vínculo tras el cambio">→ {ev.value.toFixed(0)}</span>
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
  .unlock-state {
    color: var(--ink-muted);
    font-weight: 600;
  }
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
