<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type BattleResponse, type BattleSummary, type CombatProfile, type LeaderboardEntry } from '../lib/api';
  import ReplayViewer from './ReplayViewer.svelte';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  const STATS = [
    { key: 'hp', label: 'Vida', icon: '❤️' },
    { key: 'atk', label: 'Ataque', icon: '⚔️' },
    { key: 'def', label: 'Defensa', icon: '🛡' },
    { key: 'vel', label: 'Velocidad', icon: '💨' },
    { key: 'esp', label: 'Especial', icon: '✨' },
  ] as const;
  const STRATEGIES = [
    { id: 'aggressive', label: '🗡 Agresiva' },
    { id: 'balanced', label: '⚖️ Equilibrada' },
    { id: 'defensive', label: '🛡 Defensiva' },
  ];
  const ELEMENT_ICON: Record<string, string> = { fire: '🔥', water: '💧', plant: '🌿', electric: '⚡', shadow: '🌑', light: '✨' };
  const OUTCOME = { win: '🏆 Victoria', loss: '💔 Derrota', draw: '🤝 Empate' } as const;

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

{#if !pet}
  <p class="muted">Necesitas una mascota para entrar en la arena. Eclosiona un huevo primero.</p>
{:else}
  <div class="seg">
    <button class:active={view === 'fight'} on:click={() => show('fight')}>⚔️ Pelea</button>
    <button class:active={view === 'history'} on:click={() => show('history')}>📜 Historial</button>
    <button class:active={view === 'ranking'} on:click={() => show('ranking')}>🏅 Ranking</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  <!-- ======================= PELEA ======================= -->
  {#if view === 'fight'}
    {#if profile}
      <div class="card head">
        <div>
          <strong>{ELEMENT_ICON[profile.element] ?? ''} {profile.name}</strong>
          <small>Nv. {profile.level}</small>
        </div>
        <div class="league">
          <span class="badge">{profile.league.name}</span>
          <span class="elo">ELO {profile.elo}</span>
        </div>
        {#if profile.league.next}
          <small class="muted-line">{profile.league.toNext} para {profile.league.next.name}</small>
        {/if}
        <small class="muted-line">Peleas 24 h: {profile.battlesToday}/{profile.dailyLimit} · Coste: {profile.energyCost} ⚡ · Ánimo ×{profile.mood.toFixed(2)}</small>
      </div>

      <button class="primary big" disabled={fighting || !profile.canFight} on:click={fight} title={profile.reason ?? ''}>
        {fighting ? 'Buscando rival…' : '⚔️ Buscar rival'}
      </button>
      {#if profile.reason}<p class="muted">{profile.reason}</p>{/if}

      {#if last}
        <div class="card result {last.result.outcome}">
          <strong>{OUTCOME[last.result.outcome]}</strong>
          <span>
            contra {last.opponent.name}{last.opponent.ownerName ? ` (${last.opponent.ownerName})` : ''}
            {#if last.opponent.isBot}· rival fantasma, no puntúa{/if}
          </span>
          <span>
            ELO {last.elo.before} → {last.elo.after} ({sign(last.elo.delta)}) · {last.elo.league.name}
          </span>
          <span>+{last.rewards.xp} XP · +{last.rewards.coins} 🪙 · {sign(last.rewards.happiness)} 😊 · −{last.rewards.energyCost} ⚡</span>
        </div>
      {/if}

      {#if replayLog}
        <div class="card">
          <div class="sec-title">🎬 {replayTitle}</div>
          <ReplayViewer log={replayLog} {skillNames} />
        </div>
      {/if}

      <!-- Estadísticas y puntos -->
      <div class="card">
        <div class="sec-title">
          Estadísticas
          {#if profile.statPoints > 0}<span class="points">{pointsLeft} puntos por repartir</span>{/if}
        </div>
        {#each STATS as s}
          <div class="stat-row">
            <span class="lbl">{s.icon} {s.label}</span>
            <span class="val">
              {profile.stats[s.key]}
              {#if draft[s.key]}<em>+{draft[s.key]}</em>{/if}
            </span>
            {#if profile.statPoints > 0}
              <button class="mini" disabled={!(draft[s.key] > 0)} on:click={() => bump(s.key, -1)}>−</button>
              <button class="mini" disabled={pointsLeft <= 0} on:click={() => bump(s.key, 1)}>+</button>
            {/if}
          </div>
        {/each}
        {#if draftTotal > 0}
          <button class="primary" disabled={busy} on:click={applyPoints}>Aplicar {draftTotal} puntos</button>
        {:else if profile.statPoints === 0}
          <p class="muted">Ganas 3 puntos por nivel para repartir.</p>
        {/if}
      </div>

      <!-- Estrategia y habilidades -->
      <div class="card">
        <div class="sec-title">Estrategia</div>
        <select value={profile.strategy} on:change={changeStrategy}>
          {#each STRATEGIES as st}<option value={st.id}>{st.label}</option>{/each}
        </select>

        <div class="sec-title" style="margin-top:10px">Habilidades ({equipDraft.length}/4)</div>
        <div class="chips">
          {#each profile.unlockedSkills as id}
            {@const sk = skills.find((x) => x.id === id)}
            {#if sk}
              <button
                class="chip"
                class:on={equipDraft.includes(id)}
                title={sk.description ?? ''}
                on:click={() => toggleSkill(id)}
              >
                {ELEMENT_ICON[sk.element] ?? '⚪'} {sk.name}
                <small>{sk.kind === 'attack' ? `${sk.power}` : sk.kind === 'heal' ? '❤️' : '🛡'}{sk.cooldown ? ` · ⏳${sk.cooldown}` : ''}</small>
              </button>
            {/if}
          {/each}
        </div>
        {#if !equipHasAttack}<p class="error">Equipa al menos un ataque.</p>{/if}
        {#if equipDirty}
          <button class="primary" disabled={busy || !equipHasAttack || equipDraft.length === 0} on:click={saveSkills}>Guardar habilidades</button>
        {/if}
        {#if skills.length > 0}
          {@const locked = skills.filter((s) => (s.element === 'neutral' || s.element === profile.element) && s.unlockLevel > profile.level)}
          {#if locked.length}
            <p class="muted">Próximas: {locked.map((s) => `${s.name} (nv. ${s.unlockLevel})`).join(', ')}</p>
          {/if}
        {/if}
      </div>
    {:else}
      <p class="muted">Cargando…</p>
    {/if}

  <!-- ======================= HISTORIAL ======================= -->
  {:else if view === 'history'}
    {#if history.length === 0 && historyLoaded}
      <p class="muted">Aún no hay peleas. ¡Busca tu primer rival!</p>
    {/if}
    {#each history as b (b.id)}
      <button class="row-btn {b.outcome}" on:click={() => openReplay(b)}>
        <span class="o">{b.outcome === 'win' ? '🏆' : b.outcome === 'loss' ? '💔' : '🤝'}</span>
        <span class="who">
          <strong>{b.role === 'defender' ? '🛡 Te retó ' : 'vs '}{b.opponent.name}</strong>
          <small>Nv. {b.opponent.level}{b.opponent.isBot ? ' · bot' : ''} · {fmtDate(b.createdAt)}</small>
        </span>
        <span class="delta" class:pos={b.eloDelta > 0} class:neg={b.eloDelta < 0}>{b.eloDelta ? sign(b.eloDelta) : '–'}</span>
      </button>
    {/each}
    {#if history.length > 0}<p class="muted">Pulsa una pelea para ver su repetición.</p>{/if}

  <!-- ======================= RANKING ======================= -->
  {:else}
    <div class="seg small">
      <button class:active={scope === 'global'} on:click={() => setScope('global')}>Global (ELO)</button>
      <button class:active={scope === 'weekly'} on:click={() => setScope('weekly')}>Semanal</button>
    </div>
    {#if board}
      {#if board.me}
        <p class="mine-line">Tu mascota: puesto <strong>#{board.me.rank}</strong> · {board.me.score} {scope === 'global' ? 'ELO' : 'pts'}</p>
      {:else}
        <p class="muted">Tu mascota aún no figura: ¡pelea para entrar!</p>
      {/if}
      {#each board.entries as e (e.petId)}
        <div class="lb-row" class:me={e.mine}>
          <span class="rk">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : e.rank}</span>
          <span class="who">
            <strong>{e.name}</strong>
            <small>{e.owner ?? 'Anónimo'} · Nv. {e.level} · {e.league}</small>
          </span>
          <span class="score">{e.score}{scope === 'global' ? '' : ' pts'}</span>
        </div>
      {/each}
      {#if board.entries.length === 0}<p class="muted">Todavía no hay peleas en esta clasificación.</p>{/if}
    {:else}
      <p class="muted">Cargando…</p>
    {/if}
  {/if}
{/if}

<style>
  .muted { font-size: 12px; opacity: 0.7; margin: 6px 0; }
  .error { color: #f87171; font-size: 12px; margin: 6px 0; }
  .seg { display: flex; gap: 4px; margin-bottom: 8px; }
  .seg button {
    flex: 1; padding: 6px 4px; font-size: 12px; border-radius: 8px; cursor: pointer; color: inherit;
    background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .seg button.active { background: rgba(56, 189, 248, 0.2); border-color: #38bdf8; }
  .seg.small button { font-size: 11px; padding: 4px; }
  .card {
    padding: 10px; margin-bottom: 8px; border-radius: 12px; font-size: 13px;
    background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex; flex-direction: column; gap: 6px;
  }
  .head { gap: 3px; }
  .head > div:first-child { display: flex; justify-content: space-between; align-items: baseline; }
  .league { display: flex; gap: 8px; align-items: center; }
  .badge { background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 700; }
  .elo { font-weight: 700; }
  .muted-line { opacity: 0.65; font-size: 11px; }
  .primary {
    padding: 8px 12px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700;
    background: #38bdf8; color: #0f172a;
  }
  .primary.big { width: 100%; padding: 11px; font-size: 14px; margin-bottom: 8px; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .result { gap: 3px; }
  .result.win { border-color: rgba(34, 197, 94, 0.5); background: rgba(34, 197, 94, 0.1); }
  .result.loss { border-color: rgba(248, 113, 113, 0.5); background: rgba(248, 113, 113, 0.1); }
  .result.draw { border-color: rgba(250, 204, 21, 0.5); background: rgba(250, 204, 21, 0.1); }
  .sec-title { font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
  .points { font-size: 11px; color: #fbbf24; font-weight: 600; }
  .stat-row { display: flex; align-items: center; gap: 6px; }
  .stat-row .lbl { flex: 1; }
  .stat-row .val { min-width: 54px; text-align: right; font-variant-numeric: tabular-nums; }
  .stat-row em { color: #4ade80; font-style: normal; margin-left: 3px; }
  .mini {
    width: 24px; height: 24px; border-radius: 6px; cursor: pointer; color: inherit; line-height: 1;
    background: rgba(51, 65, 85, 0.9); border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .mini:disabled { opacity: 0.35; cursor: not-allowed; }
  select {
    background: rgba(15, 23, 42, 0.8); color: inherit; border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px; padding: 6px 8px; font: inherit;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip {
    padding: 4px 8px; border-radius: 14px; font-size: 12px; cursor: pointer; color: inherit;
    background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .chip small { opacity: 0.6; margin-left: 3px; }
  .chip.on { background: rgba(56, 189, 248, 0.22); border-color: #38bdf8; }
  .row-btn, .lb-row {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px; margin-bottom: 5px; border-radius: 10px;
    background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(255, 255, 255, 0.1); color: inherit; text-align: left; font-size: 13px;
  }
  .row-btn { cursor: pointer; }
  .row-btn:hover { background: rgba(51, 65, 85, 0.7); }
  .row-btn.win { border-left: 3px solid #22c55e; }
  .row-btn.loss { border-left: 3px solid #ef4444; }
  .row-btn.draw { border-left: 3px solid #facc15; }
  .who { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .who strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who small { opacity: 0.6; font-size: 11px; }
  .delta { font-weight: 700; min-width: 34px; text-align: right; }
  .delta.pos { color: #4ade80; }
  .delta.neg { color: #f87171; }
  .lb-row.me { border-color: #38bdf8; background: rgba(56, 189, 248, 0.12); }
  .rk { width: 26px; text-align: center; font-weight: 700; }
  .score { font-weight: 700; font-variant-numeric: tabular-nums; }
  .mine-line { font-size: 12px; margin: 4px 0 8px; }
</style>
