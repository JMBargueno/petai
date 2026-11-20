<script lang="ts">
  /** Jugar › Arena: habla con el núcleo; la pantalla es la de `@pockai/ui`. La mascota y el saldo los pone al día el núcleo. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { ArenaView } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let view = $state<'fight' | 'history' | 'ranking'>('fight');
  let profile = $state<any>(null);
  let skills = $state<any[]>([]);
  let skillNames = $state<Record<string, string>>({});
  let error = $state('');
  let busy = $state(false);
  let fighting = $state(false);
  let last = $state<any>(null);
  let replayLog = $state<any>(null);
  let replayTitle = $state('');
  let history = $state<any[]>([]);
  let historyLoaded = $state(false);
  let scope = $state<'global' | 'weekly'>('global');
  let board = $state<any>(null);
  let profileError = $state('');
  let historyError = $state('');
  let boardError = $state('');
  let savingStrategy = $state(false);
  let loadedFor = '';

  $effect(() => {
    if (pet?.id && pet.id !== loadedFor) {
      loadedFor = pet.id;
      void loadProfile();
    }
  });

  onMount(async () => {
    try {
      const catalog = (await query({ type: 'catalog' })) as any;
      skills = catalog?.skills ?? [];
      skillNames = Object.fromEntries(skills.map((s: any) => [s.id, s.name]));
    } catch (e) {
      error = failureText(e, 'No se pudo cargar el catálogo de habilidades.');
    }
  });

  const petId = () => String(pet.id);

  async function loadProfile() {
    if (!pet) return;
    profileError = '';
    try {
      profile = await query({ type: 'getCombatProfile', petId: petId() });
      error = '';
    } catch (e) {
      if (profile) error = failureText(e, 'No se pudo actualizar el perfil de combate.');
      else profileError = failureText(e, 'No se pudo cargar el perfil de combate.');
    }
  }

  async function applyPoints(points: Record<string, number>) {
    if (!pet || busy) return;
    busy = true;
    try {
      profile = await act({ type: 'allocateStats', petId: petId(), points });
      error = '';
    } catch (e) {
      error = failureText(e, 'No se pudieron repartir los puntos.');
      await loadProfile();
    } finally {
      busy = false;
    }
  }

  async function saveSkills(ids: string[]) {
    if (!pet || busy) return;
    busy = true;
    try {
      profile = await act({ type: 'equipSkills', petId: petId(), skills: ids });
      error = '';
    } catch (e) {
      error = failureText(e, 'No se pudieron guardar las habilidades.');
    } finally {
      busy = false;
    }
  }

  async function changeStrategy(value: string) {
    if (!pet) return;
    savingStrategy = true;
    try {
      await act({ type: 'setStrategy', petId: petId(), strategy: value });
      if (profile) profile = { ...profile, strategy: value };
      error = '';
    } catch (e) {
      error = failureText(e, 'No se pudo cambiar la estrategia.');
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
      const res = (await act({ type: 'matchmake', petId: petId() })) as any;
      last = res;
      replayLog = res?.replay ?? null;
      replayTitle = `Contra ${res?.opponent?.name ?? 'tu rival'}`;
      historyLoaded = false;
      await loadProfile();
    } catch (e) {
      error = failureText(e, 'No se pudo buscar rival.');
      await loadProfile();
    } finally {
      fighting = false;
    }
  }

  async function loadHistory() {
    historyError = '';
    try {
      history = ((await query({ type: 'getBattles', limit: 20 })) as any[]) ?? [];
      historyLoaded = true;
      error = '';
    } catch (e) {
      historyError = failureText(e, 'No se pudo cargar el historial.');
    }
  }

  async function openReplay(b: any) {
    try {
      const d = (await query({ type: 'getBattle', id: String(b.id) })) as any;
      replayLog = d?.replay ?? null;
      replayTitle = `${b.me.name} vs ${b.opponent.name}`;
      last = null;
      view = 'fight';
    } catch (e) {
      historyError = failureText(e, 'No se pudo cargar la repetición.');
    }
  }

  async function loadBoard() {
    boardError = '';
    try {
      board = await query({ type: 'leaderboard', scope, petId: pet ? petId() : null, limit: 20 });
      error = '';
    } catch (e) {
      boardError = failureText(e, 'No se pudo cargar la clasificación.');
    }
  }

  async function show(v: 'fight' | 'history' | 'ranking') {
    view = v;
    if (v === 'history' && !historyLoaded) await loadHistory();
    if (v === 'ranking') await loadBoard();
  }

  async function setScope(s: 'global' | 'weekly') {
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
