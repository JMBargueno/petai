<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type RaidCurrent, type RaidLeaderboard, type RaidHistoryEntry } from '../lib/api';
  import { elementMeta, hpColor } from '../lib/ui/maps';
  import { AsyncState, Badge, Button, Card, EmptyState, FeatureHeader, ListRow, Notice, ProgressBar, SectionHeader } from './ui';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: RaidCurrent | null = null;
  let board: RaidLeaderboard | null = null;
  let history: RaidHistoryEntry[] = [];
  let error = '';
  let loading = true;
  let busy = false;
  let lastHit = '';
  let settledMsg = '';

  async function load() {
    loading = true;
    error = '';
    try {
      [current, board, history] = await Promise.all([
        api.getRaidCurrent(),
        api.getRaidLeaderboard(10),
        api.getRaidHistory(5),
      ]);
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function attack() {
    if (!pet) return;
    busy = true;
    error = '';
    lastHit = '';
    settledMsg = '';
    try {
      const res = await api.raidAttack(pet.id);
      lastHit = `Infligiste ${res.damage.toLocaleString()} de daño (${res.rounds} asaltos).`;
      if (res.settled) settledMsg = '¡El boss fue derrotado! Se ha repartido el premio entre los participantes.';
      await load();
      dispatch('refreshPet');
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);

  function fmt(n: number): string {
    return n?.toLocaleString?.() ?? String(n);
  }

  $: el = elementMeta(current?.element);
</script>

<div class="ui-stack">
  <AsyncState loading={loading && !current} error={current ? '' : error} onRetry={load} rows={3} height={64}>
    {#if current}
      <Card variant="hero">
        <FeatureHeader
          icon={el.icon}
          tint={el.color}
          title={current.theme}
          sub="Nivel {current.level} · {el.label} · {current.participantCount} participantes"
        />
        <ProgressBar
          size="lg"
          value={current.hpRemaining}
          max={current.hpGlobal}
          color={hpColor(current.hpPercent)}
          label="Vida del boss"
          detail="{fmt(current.hpRemaining)} / {fmt(current.hpGlobal)} ({current.hpPercent}%)"
        />
        <p class="ui-card__hint">
          {#if current.myContribution}
            Tu contribución: <b>{fmt(current.myContribution.damageDealt)}</b> de daño · {current.myContribution.attacks} ataques ·
            {current.myContribution.percentage}%
          {:else}
            Aún no has atacado a este boss.
          {/if}
        </p>
        {#if current.status === 'active'}
          <Button variant="danger" size="lg" block icon="swords" loading={busy} disabled={!pet} on:click={attack}>
            {pet ? 'Atacar al boss' : 'Sin mascota activa'}
          </Button>
        {:else}
          <Notice tone="ok" icon="trophy">Boss derrotado</Notice>
        {/if}
      </Card>

      {#if lastHit}<Notice tone="ok" icon="swords">{lastHit}</Notice>{/if}
      {#if settledMsg}<Notice tone="ok" icon="party">{settledMsg}</Notice>{/if}
      {#if error}<Notice tone="error">{error}</Notice>{/if}

      <SectionHeader title="Top contribuciones" icon="medal" onRefresh={load} {loading} />
      <div class="ui-list">
        {#each board?.entries ?? [] as e (e.rank)}
          <ListRow
            rank={e.rank}
            highlight={e.mine}
            title={e.displayName}
            sub="{e.petName} · Nv {e.petLevel} · {e.attacks} ataques · {e.percentage}%"
            value={fmt(e.damageDealt)}
          />
        {:else}
          <EmptyState compact icon="medal" text="Aún no hay contribuciones." />
        {/each}
      </div>

      <SectionHeader title="Raids anteriores" icon="log" />
      <div class="ui-list">
        {#each history as h (h.id)}
          <ListRow icon={elementMeta(h.element).icon} iconTint={elementMeta(h.element).color} title={h.theme} sub="{fmt(h.hpGlobal)} HP">
            <svelte:fragment slot="end">
              {#if h.status === 'settled'}
                <Badge tone="success" size="sm" icon="check">Liquidado</Badge>
              {:else}
                <Badge size="sm">{h.status}</Badge>
              {/if}
            </svelte:fragment>
          </ListRow>
        {:else}
          <EmptyState compact icon="log" text="Sin raids anteriores." />
        {/each}
      </div>
    {/if}
  </AsyncState>
</div>
