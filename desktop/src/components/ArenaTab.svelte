<script lang="ts">
  /** Jugar › Arena en el escritorio: carga, pelea y guarda; la pantalla es `ArenaView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { ArenaView } from '@pockai/ui';
  import { api, type BattleResponse, type BattleSummary, type CombatProfile, type LeaderboardEntry } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  export let pet: any = null;

  const dispatch = createEventDispatcher();

  let view: 'fight' | 'history' | 'ranking' = 'fight';
  let profile: CombatProfile | null = null;
  let skills: any[] = [];
  let skillNames: Record<string, string> = {};
  let error = '';
  let busy = false;
  let loadedFor = '';

  let fighting = false;
  let last: BattleResponse | null = null;
  let replayLog: any = null;
  let replayTitle = '';

  let history: BattleSummary[] = [];
  let historyLoaded = false;
  let scope: 'global' | 'weekly' = 'global';
  let board: { entries: LeaderboardEntry[]; me: { rank: number; score: number } | null } | null = null;

  // Errores de carga de cada sección: sin ellos el esqueleto se quedaba para siempre.
  let profileError = '';
  let historyError = '';
  let boardError = '';
  let savingStrategy = false;

  $: if (pet && pet.id !== loadedFor) {
    loadedFor = pet.id;
    loadProfile();
  }

  onMount(async () => {
    try {
      const catalog: any = await api.getCatalog();
      skills = catalog.skills ?? [];
      skillNames = Object.fromEntries(skills.map((s: any) => [s.id, s.name]));
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el catálogo de habilidades.');
    }
  });

  async function loadProfile() {
    if (!pet) return;
    profileError = '';
    try {
      profile = await api.getCombatProfile(pet.id);
      error = '';
    } catch (e: any) {
      if (profile) error = friendlyError(e, 'No se pudo actualizar el perfil de combate.');
      else profileError = friendlyError(e, 'No se pudo cargar el perfil de combate.');
    }
  }

  async function applyPoints(points: Record<string, number>) {
    if (!pet) return;
    busy = true;
    try {
      profile = await api.allocateStats(pet.id, points);
      error = '';
      dispatch('refreshPet');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron repartir los puntos.');
      await loadProfile();
    } finally {
      busy = false;
    }
  }

  async function saveSkills(ids: string[]) {
    if (!pet) return;
    busy = true;
    try {
      profile = await api.equipSkills(pet.id, ids);
      error = '';
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron guardar las habilidades.');
    } finally {
      busy = false;
    }
  }

  async function changeStrategy(value: string) {
    if (!pet) return;
    savingStrategy = true;
    try {
      await api.setStrategy(pet.id, value);
      if (profile) profile = { ...profile, strategy: value };
      error = '';
    } catch (err: any) {
      error = friendlyError(err, 'No se pudo cambiar la estrategia.');
    } finally {
      savingStrategy = false;
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
      error = friendlyError(e, 'No se pudo buscar rival.');
      await loadProfile();
    } finally {
      fighting = false;
    }
  }

  async function loadHistory() {
    historyError = '';
    try {
      history = await api.getBattles(20);
      historyLoaded = true;
      error = '';
    } catch (e: any) {
      historyError = friendlyError(e, 'No se pudo cargar el historial.');
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
      historyError = friendlyError(e, 'No se pudo cargar la repetición.');
    }
  }

  async function loadBoard() {
    boardError = '';
    try {
      board = await api.getLeaderboard(scope, pet?.id);
      error = '';
    } catch (e: any) {
      boardError = friendlyError(e, 'No se pudo cargar la clasificación.');
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
</script>

<ArenaView
  {pet}
  {view}
  {profile}
  {skills}
  {skillNames}
  {error}
  {profileError}
  {busy}
  {savingStrategy}
  {fighting}
  {last}
  {replayLog}
  {replayTitle}
  {history}
  {historyLoaded}
  {historyError}
  {scope}
  {board}
  {boardError}
  on:section={(e) => show(e.detail)}
  on:scope={(e) => setScope(e.detail)}
  on:fight={fight}
  on:applyPoints={(e) => applyPoints(e.detail)}
  on:saveSkills={(e) => saveSkills(e.detail)}
  on:strategy={(e) => changeStrategy(e.detail)}
  on:openReplay={(e) => openReplay(e.detail)}
  on:retryProfile={loadProfile}
  on:retryHistory={loadHistory}
  on:retryBoard={loadBoard}
/>
