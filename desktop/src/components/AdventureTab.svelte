<script lang="ts">
  /** Jugar › Aventura en el escritorio: carga el día, empieza y responde; la narración es `AdventureView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { AdventureView } from '@pockai/ui';
  import { friendlyError } from '../lib/ui/errors';
  import { environmentalStatus } from '../lib/environmental';
  import { api, type StoryAnswer, type StoryHistoryEntry, type StoryPlayState, type StorySummary, type StoryToday } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let today: StoryToday | null = null;
  let history: StoryHistoryEntry[] = [];
  let loading = true;
  let loadError = '';
  let error = '';
  let busy = false;
  let started: StoryPlayState | null = null;
  let answered: StoryAnswer | null = null;

  async function load() {
    loading = !today;
    loadError = '';
    try {
      [today, history] = await Promise.all([api.storiesToday(), api.storiesHistory(5)]);
    } catch (e: any) {
      loadError = friendlyError(e, 'No se pudo cargar la aventura.');
    } finally {
      loading = false;
    }
  }

  async function open(s: StorySummary) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const state = await api.storyStart(s.id, pet.id);
      if (state.status === 'completed' || !state.scene) {
        // Ya vivida: no se vuelve a jugar, solo se refresca la lista
        await load();
        return;
      }
      started = state;
      if (!s.play) today = today ? { ...today, used: today.used + 1 } : today;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar la historia.');
    } finally {
      busy = false;
    }
  }

  async function choose(d: { storyId: string; sceneIndex: number; optionIndex: number }) {
    busy = true;
    error = '';
    try {
      answered = await api.storyAnswer(d.storyId, d.sceneIndex, d.optionIndex);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo enviar tu elección.');
    } finally {
      busy = false;
    }
  }

  function finished() {
    void load();
    dispatch('refreshPet');
    dispatch('refreshUser');
  }

  onMount(load);
</script>

<AdventureView
  {pet}
  {today}
  {history}
  {loading}
  {loadError}
  {error}
  {busy}
  {started}
  {answered}
  weather={$environmentalStatus?.weather ?? null}
  on:open={(e) => open(e.detail)}
  on:choose={(e) => choose(e.detail)}
  on:finished={finished}
  on:retry={load}
/>
