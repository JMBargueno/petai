<script lang="ts">
  /** Mascota › Mente en el escritorio: carga y guarda; la pantalla es `MindView`, de `@pockai/ui`. */
  import { MindView } from '@pockai/ui';
  import { api, type PetMind } from '../lib/api';
  import type { InitiativeSettings, TalkLevel } from '../lib/initiative';
  import { friendlyError } from '../lib/ui/errors';

  export let pet: any = null;

  let data: PetMind | null = null;
  let error = '';
  let loading = true;
  let talk: InitiativeSettings | null = null;
  let talkError = '';

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getMind(pet.id);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar la mente de tu Pockai.');
    } finally {
      loading = false;
    }
  }

  /** Cuánto puede interrumpir: tres niveles, que el carácter del Pockai acerca o aleja. */
  async function loadTalk() {
    try {
      talk = pet?.id ? await api.getInitiativeSettings(pet.id) : null;
    } catch {
      // Servidor anterior o sin red: la sección no se muestra
      talk = null;
    }
  }

  async function setTalkLevel(level: string) {
    if (!pet?.id || !talk) return;
    const previous = talk;
    talkError = '';
    // Se refleja al momento y se deshace si el servidor no lo guarda
    talk = { ...talk, level: level as TalkLevel };
    try {
      talk = await api.setInitiativeLevel(pet.id, level as TalkLevel);
    } catch {
      talk = previous;
      talkError = 'No se pudo guardar. Inténtalo de nuevo.';
    }
  }

  // Recarga al cambiar de mascota (no en cada actualización del objeto `pet`)
  let loadedFor = '';
  $: if (pet?.id && pet.id !== loadedFor) {
    loadedFor = pet.id;
    void loadTalk();
    data = null;
    load();
  }
</script>

<MindView {pet} {data} {talk} {loading} {error} {talkError} on:retry={load} on:setTalkLevel={(e) => setTalkLevel(e.detail)} />
