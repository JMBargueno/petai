<script lang="ts">
  /** Jugar › Entrenamiento en el escritorio: habla con el servidor; la pantalla es `TrainingView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { TRAINING_IDLE, TrainingView, trainingAfterSubmit, trainingGone, trainingResumeFrom, trainingStarted, type TrainingSession } from '@pockai/ui';
  import { api, type TrainingElement, type TrainingBuff } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let session: TrainingSession = TRAINING_IDLE;
  let buff: TrainingBuff | null = null;
  let error = '';
  let busy = false;

  async function loadBuff() {
    try {
      buff = await api.trainingActiveBuff(pet?.id);
    } catch {
      buff = null;
    }
  }

  async function start() {
    if (!pet) return;
    busy = true;
    error = '';
    session = TRAINING_IDLE;
    try {
      session = trainingStarted(await api.trainingStart(pet.id));
      dispatch('refreshPet');
    } catch (e: any) {
      const resumed = trainingResumeFrom(e?.message);
      if (resumed) session = resumed;
      else error = friendlyError(e, 'No se pudo empezar el entrenamiento.');
    } finally {
      busy = false;
    }
  }

  async function pick(element: string, prediction: string | null) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const res = await api.trainingSubmit(pet.id, element as TrainingElement, (prediction ?? undefined) as TrainingElement | undefined);
      const next = trainingAfterSubmit(session, res);
      session = next.session;
      if (next.finished) {
        await loadBuff();
        dispatch('refreshPet');
        dispatch('refreshUser');
      }
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo enviar tu elección.');
      if (trainingGone(e?.message)) session = { ...session, active: false };
    } finally {
      busy = false;
    }
  }

  onMount(loadBuff);
</script>

<TrainingView {pet} {buff} {session} {busy} {error} on:start={start} on:pick={(e) => pick(e.detail.element, e.detail.prediction)} />
