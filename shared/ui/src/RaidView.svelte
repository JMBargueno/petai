<script lang="ts">
  /**
   * Raid: el jefe común, su vida, tu contribución, el ranking y las raids anteriores. Solo pinta:
   * el contenedor de cada app carga, ataca y dice cómo ha ido.
   */
  import { createEventDispatcher } from 'svelte';
  import { elementMeta, hpColor } from './maps';
  import AsyncState from './AsyncState.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import EmptyState from './EmptyState.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import ListRow from './ListRow.svelte';
  import Notice from './Notice.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import SectionHeader from './SectionHeader.svelte';

  /** Mascota con la que se ataca (`id`, `sleeping`). */
  export let pet: any = null;
  /** `GET /raid/current`. */
  export let current: any = null;
  /** `GET /raid/leaderboard`: `{ entries }`. */
  export let board: any = null;
  /** `GET /raid/history`. */
  export let history: any[] = [];
  export let loading = false;
  export let error = '';
  /** Ataque en curso. */
  export let busy = false;
  /** Aviso del último golpe. */
  export let lastHit = '';
  /** Aviso de jefe derrotado. */
  export let settledMsg = '';

  const dispatch = createEventDispatcher<{ refresh: void; attack: void }>();
  const refresh = () => dispatch('refresh');
  const attack = () => dispatch('attack');

  const RAID_STATUS: Record<string, string> = { active: 'En curso', expired: 'Escapó', failed: 'Escapó', cancelled: 'Cancelado' };

  /** Porcentaje con un decimal como mucho (el servidor lo manda sin redondear: 4.3999999…). */
  function pct(n: number): string {
    return (Math.round(n * 10) / 10).toLocaleString('es-ES');
  }

  function fmt(n: number): string {
    return n?.toLocaleString?.() ?? String(n);
  }

  $: el = elementMeta(current?.element);
</script>


<div class="ui-stack">
  <AsyncState loading={loading && !current} error={current ? '' : error} onRetry={refresh} rows={3} height={64}>
    {#if current}
      <Card variant="hero" backdrop="raid">
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
          detail="{fmt(current.hpRemaining)} / {fmt(current.hpGlobal)} ({pct(current.hpPercent)}%)"
        />
        <p class="ui-card__hint">
          {#if current.myContribution}
            Tu contribución: <b>{fmt(current.myContribution.damageDealt)}</b> de daño · {current.myContribution.attacks} ataques ·
            {pct(current.myContribution.percentage)}%
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

      <SectionHeader title="Top contribuciones" icon="medal" onRefresh={refresh} {loading} />
      <div class="ui-list">
        {#each board?.entries ?? [] as e (e.rank)}
          <ListRow
            rank={e.rank}
            highlight={e.mine}
            title={e.displayName}
            sub="{e.petName} · Nv. {e.petLevel} · {e.attacks} ataques · {pct(e.percentage)}% del daño"
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
