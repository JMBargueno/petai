<script lang="ts">
  /**
   * Temporada: progreso, siguiente recompensa, niveles desbloqueados y compra del pase (con su
   * confirmación). Solo pinta: el contenedor de cada app carga los datos y hace la compra.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';
  import { rewardIcon } from './maps';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import SectionHeader from './SectionHeader.svelte';

  /** Temporada actual y progreso del jugador, tal como los devuelve el servidor. */
  export let season: any = null;
  export let progress: any = null;
  export let loading = false;
  export let error = '';
  /** Compra del pase en curso. Al terminar se cierra la confirmación. */
  export let busy = false;
  /** El pase se acaba de comprar: se enseña el aviso. */
  export let justBought = false;
  /** Saldo del jugador en la moneda del pase, para mostrarlo al confirmar la compra. */
  export let coins: number | null = null;
  export let gems: number | null = null;

  const dispatch = createEventDispatcher<{ refresh: void; buyPass: void }>();
  const load = () => dispatch('refresh');
  const buyPass = () => dispatch('buyPass');

  let confirming = false;
  let wasBusy = false;
  $: {
    if (wasBusy && !busy) confirming = false;
    wasBusy = busy;
  }

  const REWARD_LABEL: Record<string, string> = { coins: 'monedas', gems: 'gemas', xp: 'XP', chest: 'cofre', item: 'objeto', egg: 'huevo', furniture: 'mueble' };
  const rewardName = (type: string) => REWARD_LABEL[type] ?? type;
  $: passCurrency = (season?.passCurrency === 'coins' ? 'coins' : 'gems') as 'coins' | 'gems';
  $: balance = passCurrency === 'coins' ? coins : gems;

  function fmtMs(ms: number): string {
    if (ms <= 0) return 'Finalizada';
    const d = Math.floor(ms / 86_400_000);
    const h = Math.floor((ms % 86_400_000) / 3_600_000);
    if (d > 0) return `faltan ${d} d ${h} h`;
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `faltan ${h} h ${m} min`;
  }

  function tierRewards(t: any): { type: string; value: number | string }[] {
    return [...t.freeRewards, ...(t.premiumRewards ?? [])];
  }
</script>

<div class="ui-stack">
  <AsyncState {loading} {error} onRetry={() => load()} rows={3} height={64}>
    {#if season}
      <Card variant="hero">
        <FeatureHeader icon="trophy" title={season.name} sub="Tema: {season.theme}">
          <svelte:fragment slot="end">
            <Badge tone={season.isActive ? 'tint' : 'neutral'} icon="clock">
              {season.isActive ? fmtMs(season.timeRemainingMs) : 'Finalizada'}
            </Badge>
          </svelte:fragment>
        </FeatureHeader>

        {#if progress && progress.seasonExpired}
          <Notice tone="info">
            Temporada finalizada. ¡Vuelve cuando empiece la próxima!
            {#if season.upcoming}<br /><small>Próxima: {season.upcoming.name}</small>{/if}
          </Notice>
        {:else if progress}
          <ProgressBar
            value={progress.currentTier}
            max={season.maxTier || progress.maxTier}
            label="Nivel {progress.currentTier} / {progress.maxTier}"
            detail={progress.hasPass ? 'Pase activo' : 'Sin pase'}
          />
          {#if progress.nextReward}
            <div class="rewards">
              <span class="muted">Siguiente (nivel {progress.nextReward.tier}):</span>
              {#each tierRewards(progress.nextReward) as r}
                <Badge size="sm" icon={rewardIcon(r.type)}>{r.value} {rewardName(r.type)}</Badge>
              {/each}
            </div>
          {:else}
            <div class="rewards"><Ico n="party" /> Nivel máximo alcanzado</div>
          {/if}
        {/if}
      </Card>

      {#if justBought}
        <Notice tone="ok" icon="party">¡Pase de temporada comprado! Ya recibes también las recompensas premium de cada nivel.</Notice>
      {:else if progress?.hasPass}
        <Notice tone="ok" icon="gem">Ya tienes el pase de esta temporada.</Notice>
      {:else if season.isActive}
        <Button variant="primary" size="lg" block loading={busy} on:click={() => (confirming = true)}>
          Comprar pase · {season.passPrice} <Ico n={passCurrency === 'coins' ? 'coin' : 'gem'} />
        </Button>
        <p class="ui-card__hint">Con el pase recibes una recompensa extra en cada nivel, también en los que ya has superado.</p>
      {/if}

      {#if progress && progress.unlockedTiers.length > 0}
        <SectionHeader title="Niveles desbloqueados" icon="unlock" count={progress.unlockedTiers.length} onRefresh={() => load()} {loading} />
        <div class="ui-list ui-list--scroll">
          {#each progress.unlockedTiers as t}
            <ListRow rank={null} title="Nivel {t.tier}">
              <svelte:fragment slot="end">
                {#each tierRewards(t) as r}
                  <Badge size="sm" icon={rewardIcon(r.type)} title={rewardName(r.type)}>{r.value}<span class="sr-only"> {rewardName(r.type)}</span></Badge>
                {/each}
              </svelte:fragment>
            </ListRow>
          {/each}
        </div>
      {/if}
    {/if}
  </AsyncState>

  {#if confirming && season}
    <ConfirmDialog
      title="Comprar el pase"
      icon="trophy"
      confirmLabel="Comprar"
      cost={season.passPrice}
      currency={passCurrency}
      {balance}
      loading={busy}
      on:confirm={buyPass}
      on:cancel={() => (confirming = false)}
    >
      <p>Pase de <strong>{season.name}</strong>. Vale solo para esta temporada y no se puede devolver.</p>
    </ConfirmDialog>
  {/if}
</div>

<style>
  .rewards {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-caption);
  }
</style>
