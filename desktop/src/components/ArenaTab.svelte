<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type BattleResponse, type BattleSummary, type CombatProfile, type LeaderboardEntry } from '../lib/api';
  import ReplayViewer from './ReplayViewer.svelte';
  import { elementMeta } from '../lib/ui/maps';
  import { Badge, Button, Card, EmptyState, ListRow, Notice, SectionHeader, Segmented, Skeleton } from './ui';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  const STATS = [
    { key: 'hp', label: 'Vida', icon: 'heart' },
    { key: 'atk', label: 'Ataque', icon: 'swords' },
    { key: 'def', label: 'Defensa', icon: 'shield' },
    { key: 'vel', label: 'Velocidad', icon: 'energy' },
    { key: 'esp', label: 'Especial', icon: 'xp' },
  ] as const;
  const STRATEGIES = [
    { id: 'aggressive', label: 'Agresiva' },
    { id: 'balanced', label: 'Equilibrada' },
    { id: 'defensive', label: 'Defensiva' },
  ];
  const OUTCOME = { win: 'Victoria', loss: 'Derrota', draw: 'Empate' } as const;

  type Skill = { id: string; name: string; element: string; kind: string; power: number; cooldown: number; unlockLevel: number; description?: string };

  let view: 'fight' | 'history' | 'ranking' = 'fight';
  let profile: CombatProfile | null = null;
  let skills: Skill[] = [];
  let skillNames: Record<string, string> = {};
  let error = '';
  let busy = false;

  // Reparto de puntos y equipamiento (borradores hasta pulsar "Aplicar"/"Guardar")
  let draft: Record<string, number> = {};
  let equipDraft: string[] = [];
  let loadedFor = '';

  // Pelea y repetición
  let fighting = false;
  let last: BattleResponse | null = null;
  let replayLog: any = null;
  let replayTitle = '';

  // Historial y clasificación
  let history: BattleSummary[] = [];
  let historyLoaded = false;
  let scope: 'global' | 'weekly' = 'global';
  let board: { entries: LeaderboardEntry[]; me: { rank: number; score: number } | null } | null = null;

  $: draftTotal = Object.values(draft).reduce((n, v) => n + v, 0);
  $: pointsLeft = (profile?.statPoints ?? 0) - draftTotal;
  $: equipDirty = profile ? JSON.stringify([...equipDraft].sort()) !== JSON.stringify([...profile.equippedSkills].sort()) : false;
  $: equipHasAttack = equipDraft.some((id) => skills.find((s) => s.id === id)?.kind === 'attack');
  $: if (pet && pet.id !== loadedFor) {
    loadedFor = pet.id;
    loadProfile();
  }

  onMount(async () => {
    try {
      const catalog: any = await api.getCatalog();
      skills = catalog.skills ?? [];
      skillNames = Object.fromEntries(skills.map((s) => [s.id, s.name]));
    } catch (e: any) {
      error = e.message;
    }
  });

  async function loadProfile() {
    if (!pet) return;
    try {
      profile = await api.getCombatProfile(pet.id);
      draft = {};
      equipDraft = [...profile.equippedSkills];
      error = '';
    } catch (e: any) {
      error = e.message;
    }
  }

  function bump(key: string, delta: number) {
    const next = (draft[key] ?? 0) + delta;
    if (next < 0 || (delta > 0 && pointsLeft <= 0)) return;
    draft = { ...draft, [key]: next };
  }

  async function applyPoints() {
    if (!pet || draftTotal === 0) return;
    busy = true;
    try {
      const points = Object.fromEntries(Object.entries(draft).filter(([, v]) => v > 0));
      profile = await api.allocateStats(pet.id, points);
      draft = {};
      error = '';
      dispatch('refreshPet');
    } catch (e: any) {
      error = e.message;
      await loadProfile();
    } finally {
      busy = false;
    }
  }

  function toggleSkill(id: string) {
    if (equipDraft.includes(id)) equipDraft = equipDraft.filter((x) => x !== id);
    else if (equipDraft.length < 4) equipDraft = [...equipDraft, id];
  }

  async function saveSkills() {
    if (!pet || !equipDirty || !equipHasAttack) return;
    busy = true;
    try {
      profile = await api.equipSkills(pet.id, equipDraft);
      equipDraft = [...profile.equippedSkills];
      error = '';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function changeStrategy(e: Event) {
    if (!pet) return;
    const value = (e.currentTarget as HTMLSelectElement).value;
    try {
      await api.setStrategy(pet.id, value);
      if (profile) profile = { ...profile, strategy: value };
      error = '';
    } catch (err: any) {
      error = err.message;
    }
  }

  async function fight() {
    if (!pet || fighting) return;
    fighting = true;
    error = '';
    last = null;
    replayLog = null;
    try {
      const res = await api.matchmake(pet.id);
      last = res;
      replayLog = res.replay;
      replayTitle = `Contra ${res.opponent.name}`;
      historyLoaded = false;
      dispatch('petUpdated', res.pet);
      dispatch('refreshUser');
      await loadProfile();
    } catch (e: any) {
      error = e.message;
      await loadProfile();
    } finally {
      fighting = false;
    }
  }

  async function loadHistory() {
    try {
      history = await api.getBattles(20);
      historyLoaded = true;
      error = '';
    } catch (e: any) {
      error = e.message;
    }
  }

  async function openReplay(b: BattleSummary) {
    try {
      const d = await api.getBattle(b.id);
      replayLog = d.replay;
      replayTitle = `${b.me.name} vs ${b.opponent.name}`;
      last = null;
      view = 'fight';
    } catch (e: any) {
      error = e.message;
    }
  }

  async function loadBoard() {
    try {
      board = await api.getLeaderboard(scope, pet?.id);
      error = '';
    } catch (e: any) {
      error = e.message;
    }
  }

  async function show(v: typeof view) {
    view = v;
    if (v === 'history' && !historyLoaded) await loadHistory();
    if (v === 'ranking') await loadBoard();
  }

  async function setScope(s: typeof scope) {
    scope = s;
    await loadBoard();
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
</script>

<div class="ui-stack">
  {#if !pet}
    <EmptyState icon="swords" title="Sin mascota" text="Necesitas una mascota para entrar en la arena. Eclosiona un huevo primero." />
  {:else}
    <Segmented
      value={view}
      label="Arena"
      options={[
        { value: 'fight', label: 'Pelea', icon: 'swords' },
        { value: 'history', label: 'Historial', icon: 'log' },
        { value: 'ranking', label: 'Ranking', icon: 'medal' },
      ]}
      on:change={(e) => show(e.detail === 'history' ? 'history' : e.detail === 'ranking' ? 'ranking' : 'fight')}
    />

    {#if error}<Notice tone="error">{error}</Notice>{/if}

    <!-- ======================= PELEA ======================= -->
    {#if view === 'fight'}
      {#if profile}
        {@const el = elementMeta(profile.element)}
        <Card variant="hero">
          <div class="ui-feature">
            <span class="ui-feature__icon" style="--feature-tint: {el.color}" aria-hidden="true"><Ico n={el.icon} size={22} /></span>
            <div class="ui-feature__body">
              <h3 class="ui-feature__title">{profile.name}</h3>
              <p class="ui-feature__sub">Nv. {profile.level} · {el.label}</p>
            </div>
            <div class="ui-feature__end league">
              <Badge color="var(--color-sunburst)" icon="trophy">{profile.league.name}</Badge>
              <strong class="elo">{profile.elo} <small>ELO</small></strong>
            </div>
          </div>
          {#if profile.league.next}
            <p class="ui-card__hint">{profile.league.toNext} para {profile.league.next.name}</p>
          {/if}
          <div class="facts">
            <Badge size="sm" icon="swords">{profile.battlesToday}/{profile.dailyLimit} hoy</Badge>
            <Badge size="sm" icon="energy">{profile.energyCost} energía</Badge>
            <Badge size="sm" icon="smile">ánimo ×{profile.mood.toFixed(2)}</Badge>
          </div>
          <Button variant="primary" size="lg" block icon="swords" loading={fighting} disabled={!profile.canFight} title={profile.reason ?? ''} on:click={fight}>
            {fighting ? 'Buscando rival…' : 'Buscar rival'}
          </Button>
          {#if profile.reason}<p class="ui-card__hint center">{profile.reason}</p>{/if}
        </Card>

        {#if last}
          <Notice
            tone={last.result.outcome === 'win' ? 'ok' : last.result.outcome === 'loss' ? 'error' : 'warning'}
            icon={last.result.outcome === 'win' ? 'trophy' : last.result.outcome === 'loss' ? 'shield' : 'swords'}
          >
            <b>{OUTCOME[last.result.outcome]}</b> contra {last.opponent.name}{last.opponent.ownerName ? ' (' + last.opponent.ownerName + ')' : ''}
            {#if last.opponent.isBot}· rival fantasma, no puntúa{/if}
            <br />ELO {last.elo.before} → {last.elo.after} ({sign(last.elo.delta)}) · {last.elo.league.name}
            <br />+{last.rewards.xp} XP · +{last.rewards.coins} <Ico n="coin" /> · {sign(last.rewards.happiness)} <Ico n="smile" /> · −{last.rewards.energyCost} <Ico n="energy" />
          </Notice>
        {/if}

        {#if replayLog}
          <Card title={replayTitle} icon="replay">
            <ReplayViewer log={replayLog} {skillNames} />
          </Card>
        {/if}

        <!-- Estadísticas y puntos -->
        <Card title="Estadísticas" icon="chart">
          <svelte:fragment slot="title-end">
            {#if profile.statPoints > 0}<span class="title-end"><Badge size="sm" tone="warning">{pointsLeft} por repartir</Badge></span>{/if}
          </svelte:fragment>
          {#each STATS as s}
            <div class="stat-row">
              <span class="lbl"><Ico n={s.icon} /> {s.label}</span>
              <span class="val">
                {profile.stats[s.key]}
                {#if draft[s.key]}<em>+{draft[s.key]}</em>{/if}
              </span>
              {#if profile.statPoints > 0}
                <Button size="sm" iconOnly label="Quitar punto" disabled={!(draft[s.key] > 0)} on:click={() => bump(s.key, -1)}>−</Button>
                <Button size="sm" iconOnly label="Añadir punto" disabled={pointsLeft <= 0} on:click={() => bump(s.key, 1)}>+</Button>
              {/if}
            </div>
          {/each}
          {#if draftTotal > 0}
            <Button variant="primary" block loading={busy} on:click={applyPoints}>Aplicar {draftTotal} puntos</Button>
          {:else if profile.statPoints === 0}
            <p class="ui-card__hint">Ganas 3 puntos por nivel para repartir.</p>
          {/if}
        </Card>

        <!-- Estrategia y habilidades -->
        <Card title="Estrategia" icon="brain">
          <select class="select" value={profile.strategy} on:change={changeStrategy}>
            {#each STRATEGIES as st}<option value={st.id}>{st.label}</option>{/each}
          </select>

          <SectionHeader title="Habilidades" icon="xp" count="{equipDraft.length}/4" />
          <div class="chips">
            {#each profile.unlockedSkills as id}
              {@const sk = skills.find((x) => x.id === id)}
              {#if sk}
                {@const se = elementMeta(sk.element)}
                <button class="skill" class:on={equipDraft.includes(id)} title={sk.description ?? ''} aria-pressed={equipDraft.includes(id)} on:click={() => toggleSkill(id)}>
                  <span style="color: {se.color}"><Ico n={se.icon} /></span>
                  {sk.name}
                  <small>{#if sk.kind === 'attack'}{sk.power}{:else if sk.kind === 'heal'}<Ico n="heart" />{:else}<Ico n="shield" />{/if}{#if sk.cooldown} · <Ico n="wait" />{sk.cooldown}{/if}</small>
                </button>
              {/if}
            {/each}
          </div>
          {#if !equipHasAttack}<Notice tone="warning">Equipa al menos un ataque.</Notice>{/if}
          {#if equipDirty}
            <Button variant="primary" block loading={busy} disabled={!equipHasAttack || equipDraft.length === 0} on:click={saveSkills}>Guardar habilidades</Button>
          {/if}
          {#if skills.length > 0}
            {@const locked = skills.filter((s) => (s.element === 'neutral' || s.element === profile.element) && s.unlockLevel > profile.level)}
            {#if locked.length}
              <p class="ui-card__hint">Próximas habilidades por desbloquear:</p>
              <div class="chips">
                {#each locked as sk}
                  <span
                    class="skill skill--locked"
                    title="{sk.description ? sk.description + ' — ' : ''}Requiere Nivel {sk.unlockLevel} (tienes Nivel {profile.level})"
                  >
                    <Ico n="lock" /> {sk.name}
                    <small class="req-lvl">Nv. {sk.unlockLevel}</small>
                  </span>
                {/each}
              </div>
            {/if}
          {/if}
        </Card>
      {:else}
        <Skeleton rows={3} height={80} />
      {/if}

    <!-- ======================= HISTORIAL ======================= -->
    {:else if view === 'history'}
      {#if !historyLoaded}
        <Skeleton rows={4} />
      {:else if history.length === 0}
        <EmptyState icon="swords" text="Aún no hay peleas. ¡Busca tu primer rival!" />
      {:else}
        <SectionHeader title="Últimas peleas" icon="log" count={history.length} />
        <div class="ui-list">
          {#each history as b (b.id)}
            <button class="ui-row fight-row {b.outcome}" on:click={() => openReplay(b)}>
              <span class="ui-row__lead outcome">{b.outcome === 'win' ? 'V' : b.outcome === 'loss' ? 'D' : 'E'}</span>
              <span class="ui-row__body">
                <span class="ui-row__title">{b.role === 'defender' ? 'Te retó ' : 'vs '}{b.opponent.name}</span>
                <span class="ui-row__sub">Nv. {b.opponent.level}{b.opponent.isBot ? ' · bot' : ''} · {fmtDate(b.createdAt)}</span>
              </span>
              <span class="ui-row__value delta" class:pos={b.eloDelta > 0} class:neg={b.eloDelta < 0}>{b.eloDelta ? sign(b.eloDelta) : '–'}</span>
            </button>
          {/each}
        </div>
        <p class="ui-card__hint center">Pulsa una pelea para ver su repetición.</p>
      {/if}

    <!-- ======================= RANKING ======================= -->
    {:else}
      <Segmented
        variant="pills"
        value={scope}
        label="Clasificación"
        options={[
          { value: 'global', label: 'Global (ELO)' },
          { value: 'weekly', label: 'Semanal' },
        ]}
        on:change={(e) => setScope(e.detail === 'weekly' ? 'weekly' : 'global')}
      />
      {#if board}
        {#if board.me}
          <Notice tone="info" icon="medal">Tu mascota: puesto <strong>#{board.me.rank}</strong> · {board.me.score} {scope === 'global' ? 'ELO' : 'pts'}</Notice>
        {:else}
          <Notice tone="info">Tu mascota aún no figura: ¡pelea para entrar!</Notice>
        {/if}
        <div class="ui-list">
          {#each board.entries as e (e.petId)}
            <ListRow rank={e.rank} highlight={e.mine} title={e.name} sub="{e.owner ?? 'Anónimo'} · Nv. {e.level} · {e.league}" value="{e.score}{scope === 'global' ? '' : ' pts'}" />
          {:else}
            <EmptyState compact icon="medal" text="Todavía no hay peleas en esta clasificación." />
          {/each}
        </div>
      {:else}
        <Skeleton rows={5} />
      {/if}
    {/if}
  {/if}
</div>

<style>
  .center {
    text-align: center;
  }
  .title-end {
    margin-left: auto;
  }
  .league {
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .elo {
    font-size: var(--text-body);
    font-variant-numeric: tabular-nums;
  }
  .elo small {
    font-size: var(--text-caption);
    color: var(--ink-muted);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .stat-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
  }
  .stat-row .lbl {
    flex: 1;
  }
  .stat-row .val {
    min-width: 54px;
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .stat-row em {
    margin-left: 3px;
    color: var(--success-ink);
    font-style: normal;
  }
  .stat-row :global(.btn--icon) {
    min-width: 28px;
    min-height: 28px;
    padding: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .skill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-pills);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-caption);
    font-weight: 600;
    cursor: pointer;
  }
  .skill small {
    color: var(--ink-muted);
  }
  .skill.on {
    border-color: var(--line);
    background: color-mix(in srgb, var(--view-tint) 35%, var(--surface));
    box-shadow: 1px 2px 0 var(--line);
  }
  .skill--locked {
    border-style: dashed;
    color: var(--ink-muted);
    cursor: help;
  }
  .skill--locked .req-lvl {
    color: var(--warning-ink);
    font-weight: 700;
  }
  .fight-row {
    width: 100%;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .outcome {
    font-weight: 800;
    font-size: var(--text-label);
    border: 1px solid var(--line);
  }
  .fight-row.win .outcome {
    background: var(--success);
    color: var(--on-color);
  }
  .fight-row.loss .outcome {
    background: var(--danger);
    color: var(--on-color);
  }
  .fight-row.draw .outcome {
    background: var(--warning);
    color: var(--on-color);
  }
  .delta.pos {
    color: var(--success-ink);
  }
  .delta.neg {
    color: var(--danger-ink);
  }
</style>
