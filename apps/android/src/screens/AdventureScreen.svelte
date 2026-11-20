<script lang="ts">
  /**
   * Jugar › Aventura: carga el día, empieza y responde por el núcleo; la narración es la de
   * `@pockai/ui`. Sin clima local todavía: la escena usa su propio ambiente. El premio lo pone al
   * día el núcleo.
   */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { AdventureView } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let today = $state<any>(null);
  let history = $state<any[]>([]);
  let loading = $state(true);
  let loadError = $state('');
  let error = $state('');
  let busy = $state(false);
  let started = $state<any>(null);
  let answered = $state<any>(null);

  async function load() {
    loading = !today;
    loadError = '';
    try {
      [today, history] = (await Promise.all([query({ type: 'storiesToday' }), query({ type: 'storiesHistory', limit: 5 })])) as [any, any[]];
    } catch (e) {
      loadError = failureText(e, 'No se pudo cargar la aventura.');
    } finally {
      loading = false;
    }
  }

  async function open(s: any) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const state = (await act({ type: 'storyStart', storyId: String(s.id), petId: String(pet.id) })) as any;
      if (state?.status === 'completed' || !state?.scene) {
        // Ya vivida: no se vuelve a jugar, solo se refresca la lista
        await load();
        return;
      }
      started = state;
      if (!s.play && today) today = { ...today, used: today.used + 1 };
    } catch (e) {
      error = failureText(e, 'No se pudo empezar la historia.');
    } finally {
      busy = false;
    }
  }

  async function choose(d: { storyId: string; sceneIndex: number; optionIndex: number }) {
    busy = true;
    error = '';
    try {
      answered = await act({ type: 'storyAnswer', storyId: d.storyId, sceneIndex: d.sceneIndex, optionIndex: d.optionIndex });
    } catch (e) {
      error = failureText(e, 'No se pudo enviar tu elección.');
    } finally {
      busy = false;
    }
  }

  onMount(() => void load());
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
  on:open={(e) => open(e.detail)}
  on:choose={(e) => choose(e.detail)}
  on:finished={() => load()}
  on:retry={load}
/>
