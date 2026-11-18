<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { AsyncState, Badge, Button, Card, ConfirmDialog, EmptyState, FeatureHeader, ListRow, Notice, SectionHeader } from './ui';
  import { friendlyError } from '../lib/ui/errors';
  import { api, type AdventureScene, type AdventureHistoryEntry } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const PREMIUM_COST_GEMS = 10;
  const OUTCOME: Record<string, { label: string; icon: string; tone: 'success' | 'warning' | 'neutral' }> = {
    win: { label: 'Victoria', icon: 'trophy', tone: 'success' },
    partial: { label: 'Logro parcial', icon: 'star', tone: 'warning' },
    lose: { label: 'Derrota valiente', icon: 'shield', tone: 'neutral' },
  };
  const outcome = (o: string | null | undefined) => (o ? OUTCOME[o] ?? { label: o, icon: 'star', tone: 'neutral' as const } : null);

  let adventureId: string | null = null;
  let theme = '';
  let sceneCount = 0;
  let scene: AdventureScene | null = null;
  let ending: { outcome: string; rewards: { xp: number; coins: number }; memory: string } | null = null;
  let history: AdventureHistoryEntry[] = [];
  let error = '';
  let loading = true;
  let busy = false;
  let loadError = '';
  /** Confirmación de la aventura premium (gasta gemas). */
  let confirmPremium = false;
  let sceneEl: HTMLElement | null = null;

  async function load() {
    // Con una escena en curso solo se refresca el historial: no se cambia por el esqueleto.
    loading = !adventureId;
    loadError = '';
    try {
      const [cur, hist] = await Promise.all([api.adventureCurrent(), api.adventureHistory(5)]);
      history = hist;
      if (cur.active) {
        adventureId = cur.adventureId;
        theme = cur.theme;
        sceneCount = cur.sceneCount;
        scene = cur.scene;
      }
    } catch (e: any) {
      loadError = friendlyError(e, 'No se pudo cargar la aventura.');
    } finally {
      loading = false;
    }
  }

  async function start(premium: boolean) {
    if (!pet) return;
    busy = true;
    error = '';
    ending = null;
    try {
      const res = await api.adventureStart(pet.id, premium);
      adventureId = res.adventureId;
      theme = res.theme;
      sceneCount = res.sceneCount;
      scene = res.scene;
      if (premium) dispatch('refreshUser');
      focusScene();
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar la aventura.');
    } finally {
      busy = false;
      confirmPremium = false;
    }
  }

  async function choose(i: number) {
    if (!adventureId || busy) return;
    busy = true;
    error = '';
    try {
      const res = await api.adventureChoose(adventureId, i);
      if ('completed' in res) {
        ending = { outcome: res.outcome, rewards: res.rewards, memory: res.memory };
        adventureId = null;
        scene = null;
        history = await api.adventureHistory(5).catch(() => history);
        dispatch('refreshPet');
        dispatch('refreshUser');
      } else {
        scene = res.scene;
        focusScene();
      }
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo enviar tu elección.');
    } finally {
      busy = false;
    }
  }

  /** Al cambiar de escena el foco va al texto nuevo (los botones anteriores ya no existen). */
  async function focusScene() {
    await tick();
    sceneEl?.focus();
  }

  onMount(load);
</script>

<div class="ui-stack">
  <AsyncState {loading} error={loadError} onRetry={load} rows={3} height={64}>
    <Card variant="hero">
      <FeatureHeader
        icon="map"
        title={adventureId ? theme : 'Aventura diaria'}
        sub={adventureId && scene ? `Escena ${scene.order + 1} de ${sceneCount}` : `1 gratis al día · premium: 5 escenas por ${PREMIUM_COST_GEMS} gemas`}
      />

      {#if adventureId && scene}
        <p class="scene-text ui-usertext" tabindex="-1" aria-live="polite" bind:this={sceneEl}>{scene.text}</p>
        <div class="ui-list">
          {#each scene.choices as c, i}
            <button class="ui-row choice" disabled={busy} on:click={() => choose(i)}>
              <span class="ui-row__rank">{i + 1}</span>
              <span class="ui-row__body">
                <span class="ui-row__title">{c.label}</span>
                {#if c.hint}<span class="ui-row__sub ui-row__sub--wrap">{c.hint}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
        {#if busy}<p class="ui-card__hint center">La historia continúa…</p>{/if}
      {:else}
        {#if ending}
          {@const o = outcome(ending.outcome)}
          <Notice tone={ending.outcome === 'lose' ? 'warning' : ending.outcome === 'partial' ? 'info' : 'ok'} icon={o?.icon}>
            <b>{o?.label}</b> · +{ending.rewards.xp} XP, +{ending.rewards.coins} monedas
            <p class="memory">{ending.memory}</p>
          </Notice>
        {/if}
        <div class="row">
          <Button variant="primary" size="lg" icon="map" class="grow" loading={busy} disabled={!pet} on:click={() => start(false)}>
            {pet ? 'Empezar aventura' : 'Sin mascota activa'}
          </Button>
          <Button size="lg" icon="gem" disabled={!pet || busy} title="Aventura de 5 escenas por {PREMIUM_COST_GEMS} gemas" on:click={() => (confirmPremium = true)}>Premium · {PREMIUM_COST_GEMS}</Button>
        </div>
      {/if}
    </Card>

    {#if error}<Notice tone="error">{error}</Notice>{/if}

    <SectionHeader title="Aventuras anteriores" icon="book" count={history.length} onRefresh={load} {loading} />
    <div class="ui-list">
      {#each history as h (h.adventureId)}
        {@const o = outcome(h.outcome)}
        <ListRow
          icon={h.isPremium ? 'gem' : 'map'}
          title={h.theme}
          sub="{new Date(h.startedAt).toLocaleDateString('es-ES')} · +{h.xpAwarded} XP · +{h.coinsAwarded} monedas"
        >
          <svelte:fragment slot="end">
            {#if o}<Badge size="sm" tone={o.tone} icon={o.icon}>{o.label}</Badge>{:else}<Badge size="sm">—</Badge>{/if}
          </svelte:fragment>
        </ListRow>
      {:else}
        <EmptyState compact icon="map" text="Aún no has vivido ninguna aventura." />
      {/each}
    </div>
  </AsyncState>

  {#if confirmPremium}
    <ConfirmDialog
      title="Aventura premium"
      icon="gem"
      confirmLabel="Empezar"
      cost={PREMIUM_COST_GEMS}
      currency="gems"
      loading={busy}
      on:confirm={() => start(true)}
      on:cancel={() => (confirmPremium = false)}
    >
      <p>Una aventura más larga, de 5 escenas, con mejores recompensas. No cuenta para la aventura gratis del día.</p>
    </ConfirmDialog>
  {/if}
</div>

<style>
  .scene-text {
    margin: 0;
    font-size: var(--text-label);
    line-height: 1.55;
    white-space: pre-line;
  }
  .choice {
    width: 100%;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .choice:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .choice .ui-row__title {
    white-space: normal;
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
  .row :global(.grow) {
    flex: 1;
  }
  .memory {
    margin: var(--space-2) 0 0;
    font-size: var(--text-caption);
    font-style: italic;
  }
  .center {
    text-align: center;
  }
</style>
