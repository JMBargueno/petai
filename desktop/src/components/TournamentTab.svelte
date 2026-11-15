<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type TournamentCurrent, type TournamentStandings, type TournamentBracket } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: TournamentCurrent | null = null;
  let standings: TournamentStandings | null = null;
  let bracket: TournamentBracket | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let enterMsg = '';

  const STATUS_LABEL: Record<string, string> = {
    entry: 'Inscripción abierta', bracket: 'Bracket en curso', active: 'En curso', finished: 'Terminado',
  };
  const ELEMENT_ICON: Record<string, string> = {
    fire: '🔥', water: '💧', plant: '🌿', electric: '⚡', shadow: '🌑', light: '☀️',
  };

  function elIcon(e: string): string { return ELEMENT_ICON[e] ?? '🎭'; }
  function statusLabel(s: string): string { return STATUS_LABEL[s] ?? s; }
  function fmt(n: number): string { return n?.toLocaleString?.() ?? String(n); }

  async function load() {
    loading = true;
    error = '';
    enterMsg = '';
    try {
      current = await api.getTournamentCurrent();
      standings = await api.getTournamentStandings(20);
      // El bracket solo existe cuando el torneo ya pasó la fase de inscripción.
      bracket = current.status !== 'entry'
        ? await api.getTournamentBracket().catch(() => null)
        : null;
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function enter() {
    if (!pet) return;
    busy = true;
    error = '';
    enterMsg = '';
    try {
      const res = await api.tournamentEnter(pet.id);
      enterMsg = `✅ Inscripción confirmada (pet ELO ${res.elo}, cuota ${res.feePaid} 💎).`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  onMount(load);

  const rounds = (b: TournamentBracket | null): [string, any[]][] =>
    b && b.rounds ? (Object.entries(b.rounds) as [string, any[]][]).sort((a, z) => Number(a[0]) - Number(z[0])) : [];
</script>

{#if loading}
  <div class="empty-msg">Cargando torneo…</div>
{:else if error && !current}
  <div class="error-msg">{error}</div>
{:else if current}
  <div class="status-card">
    <div class="status-head">
      <span class="status-badge">{statusLabel(current.status)}</span>
      <div class="status-info">
        <small>Premio total: <b>{fmt(current.totalPrizePool)}</b> 💎 · Cuota: {current.entryFee} 💎</small>
        <small>{current.entryCount}/{current.bracketSize} inscritos</small>
      </div>
    </div>

    {#if current.status === 'entry'}
      <div class="deadline">Inscripción cierra: {new Date(current.entryDeadline).toLocaleString()}</div>
      <button class="enter" disabled={!pet || busy} on:click={enter}>
        {busy ? 'Inscribiendo…' : pet ? `Inscribir a mi mascota (${current.entryFee} 💎)` : 'Sin mascota activa'}
      </button>
      <small class="req">Requiere ELO ≥ 1700 (liga Diamond)</small>
    {/if}

    {#if current.hasEntered}
      <div class="entered">✅ Estás inscrito{current.myPlacement ? ` · colocación ${current.myPlacement}º` : ''}</div>
    {/if}
    {#if enterMsg}<p class="ok-msg">{enterMsg}</p>{/if}
    {#if error}<div class="error-msg">{error}</div>{/if}
  </div>

  <div class="sec-title">📊 Clasificación (por ELO)</div>
  <div class="stand-list">
    {#each (standings?.entries ?? []) as e (e.rank)}
      <div class="stand-row" class:mine={e.mine}>
        <span class="stand-rank">#{e.rank}</span>
        <span class="stand-name">{e.petName}</span>
        <span class="stand-elo">{fmt(e.elo)} ELO</span>
      </div>
    {:else}
      <div class="empty-msg">Aún sin competidores clasificados.</div>
    {/each}
  </div>

  {#if rounds(bracket).length > 0}
    {#each rounds(bracket) as [round, matches] (round)}
      <div class="sec-title">Ronda {round}</div>
      <div class="match-list">
        {#each matches as m (m.id)}
          <div class="match-row">
            <span class="match-pet left">{m.petA ? elIcon(m.petA.element) + ' ' + m.petA.name + ' (' + m.petA.elo + ')' : '—'}</span>
            <span class="match-vs">{m.status === 'resolved' ? '✓' : 'vs'}</span>
            <span class="match-pet right">{m.petB ? elIcon(m.petB.element) + ' ' + m.petB.name + ' (' + m.petB.elo + ')' : '—'}</span>
          </div>
        {/each}
      </div>
    {/each}
  {/if}

  <style>
    .status-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.1); }
    .status-head { display: flex; gap: 10px; align-items: center; }
    .status-badge { font-size: 12px; font-weight: 700; color: #0f172a; background: #38bdf8; padding: 4px 10px; border-radius: 8px; white-space: nowrap; }
    .status-info { display: flex; flex-direction: column; gap: 2px; }
    .status-info small { color: #cbd5e1; font-size: 11px; }
    .deadline { font-size: 12px; color: #eab308; }
    .enter { padding: 10px; border: none; border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 13px; background: linear-gradient(90deg, #38bdf8, #818cf8); color: #0f172a; }
    .enter:disabled { opacity: 0.5; cursor: not-allowed; }
    .req { color: #94a3b8; font-size: 10px; text-align: center; }
    .entered { font-size: 13px; color: #4ade80; font-weight: 600; text-align: center; }
    .ok-msg { font-size: 12px; color: #4ade80; text-align: center; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 10px; padding: 8px; margin: 0; }
    .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 8px; border-radius: 8px; font-size: 12px; }
    .empty-msg { font-size: 12px; color: #64748b; text-align: center; padding: 10px 0; }
    .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
    .stand-list, .match-list { display: flex; flex-direction: column; gap: 5px; }
    .stand-row { display: flex; gap: 8px; align-items: center; padding: 7px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); }
    .stand-row.mine { border-color: rgba(56, 189, 248, 0.5); }
    .stand-rank { width: 34px; text-align: center; font-weight: 700; color: #38bdf8; font-size: 12px; }
    .stand-name { flex: 1; font-size: 12px; font-weight: 600; }
    .stand-elo { font-size: 11px; color: #eab308; }
    .match-row { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 8px; background: rgba(15, 23, 42, 0.4); }
    .match-pet { flex: 1; font-size: 11px; }
    .match-pet.left { text-align: right; }
    .match-pet.right { text-align: left; }
    .match-vs { font-size: 11px; color: #64748b; }
    .primary { margin-top: 12px; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; background: #38bdf8; color: #0f172a; width: 100%; }
  </style>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}
