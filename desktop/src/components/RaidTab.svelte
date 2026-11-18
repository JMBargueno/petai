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
      error = e instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : 'No se pudo cargar la raid.';
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
      if (res.settled) settledMsg = '¡Jefe derrotado! El premio se ha repartido entre quienes participaron.';
      await load();
      dispatch('refreshPet');
      dispatch('refreshUser');
    } catch (e: any) {
      error = e instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : e?.message || 'No se pudo atacar.';
    } finally {
      busy = false;
    }
  }

  const RAID_STATUS: Record<string, string> = { active: 'En curso', expired: 'Escapó', failed: 'Escapó', cancelled: 'Cancelado' };

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
          label="Vida del jefe"
          detail="{fmt(current.hpRemaining)} / {fmt(current.hpGlobal)} ({current.hpPercent}%)"
        />
        <p class="ui-card__hint">
          {#if current.myContribution}
            Tu contribución: <b>{fmt(current.myContribution.damageDealt)}</b> de daño · {current.myContribution.attacks} ataques ·
            {current.myContribution.percentage}%
          {:else}
            Aún no has atacado a este jefe.
          {/if}
        </p>
        {#if current.status === 'active'}
          {#if pet?.sleeping}<Notice tone="info" icon="moon">Tu mascota está durmiendo. Despiértala para atacar.</Notice>{/if}
          <Button variant="primary" size="lg" block icon="swords" loading={busy} disabled={!pet || pet.sleeping} on:click={attack}>
            {pet ? 'Atacar al jefe' : 'Sin mascota activa'}
          </Button>
          <p class="ui-card__hint center">Cada ataque es un combate completo y gasta energía.</p>
        {:else}
          <Notice tone="ok" icon="trophy">Jefe derrotado</Notice>
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
            sub="{e.petName} · Nv. {e.petLevel} · {e.attacks} ataques · {e.percentage}% del daño"
            value={fmt(e.damageDealt)}
          />
        {:else}
          <EmptyState compact icon="medal" text="Aún no hay contribuciones." />
        {/each}
      </div>

      <SectionHeader title="Raids anteriores" icon="log" />
      <div class="ui-list">
        {#each history as h (h.id)}
          <ListRow icon={elementMeta(h.element).icon} iconTint={elementMeta(h.element).color} title={h.theme} sub="{elementMeta(h.element).label} · {fmt(h.hpGlobal)} de vida">
            <svelte:fragment slot="end">
              {#if h.status === 'settled' || h.status === 'defeated'}
                <Badge tone="success" size="sm" icon="check">Derrotado</Badge>
              {:else}
                <Badge size="sm">{RAID_STATUS[h.status] ?? h.status}</Badge>
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
