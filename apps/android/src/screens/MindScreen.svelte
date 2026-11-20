<script lang="ts">
  /** Mascota › Mente: carga la mente y el nivel de charla por el núcleo; la pantalla es la de `@pockai/ui`. */
  import { query } from '@pockai/client';
  import { MindView, type InitiativeSettings } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let data = $state<any>(null);
  let error = $state('');
  let loading = $state(true);
  let talk = $state<InitiativeSettings | null>(null);
  let talkError = $state('');
  let loadedFor = '';

  $effect(() => {
    if (pet?.id && pet.id !== loadedFor) {
      loadedFor = pet.id;
      data = null;
      void loadTalk();
      void load();
    }
  });

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await query({ type: 'getMind', petId: String(pet.id) });
    } catch (e) {
      error = failureText(e, 'No se pudo cargar la mente de tu Pockai.');
    } finally {
      loading = false;
    }
  }

  async function loadTalk() {
    try {
      talk = pet?.id ? ((await query({ type: 'getInitiativeSettings', petId: String(pet.id) })) as InitiativeSettings) : null;
    } catch {
      // Servidor anterior o sin red: la sección no se muestra
      talk = null;
    }
  }

  /** Se refleja al momento y se deshace si el servidor no lo guarda. */
  async function setTalkLevel(level: string) {
    if (!pet?.id || !talk) return;
    const previous = talk;
    talkError = '';
    talk = { ...talk, level: level as InitiativeSettings['level'] };
    try {
      talk = (await act({ type: 'setInitiativeLevel', petId: String(pet.id), level })) as InitiativeSettings;
    } catch {
      talk = previous;
      talkError = 'No se pudo guardar. Inténtalo de nuevo.';
    }
  }
</script>

<MindView {pet} {data} {talk} {loading} {error} {talkError} on:retry={() => load()} on:setTalkLevel={(e) => setTalkLevel(e.detail)} />
