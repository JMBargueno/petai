<script lang="ts">
  /** Jugar › Entrenamiento: habla con el núcleo; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { TRAINING_IDLE, TrainingView, trainingAfterSubmit, trainingGone, trainingResumeFrom, trainingStarted, type TrainingSession } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let session = $state<TrainingSession>(TRAINING_IDLE);
  let buff = $state<any>(null);
  let error = $state('');
  let busy = $state(false);

  async function loadBuff() {
    try {
      buff = await query({ type: 'trainingActiveBuff', petId: pet ? String(pet.id) : null });
    } catch {
      buff = null;
    }
  }

  /** La energía de la mascota y el saldo los pone al día el núcleo. */
  async function start() {
    if (!pet || busy) return;
    busy = true;
    error = '';
    session = TRAINING_IDLE;
    try {
      session = trainingStarted((await act({ type: 'trainingStart', petId: String(pet.id) })) as any);
    } catch (e) {
      const resumed = trainingResumeFrom((e as any)?.message);
      if (resumed) session = resumed;
      else error = failureText(e, 'No se pudo empezar el entrenamiento.');
    } finally {
      busy = false;
    }
  }

  async function pick(element: string, prediction: string | null) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const res = await act({ type: 'trainingSubmit', petId: String(pet.id), element, prediction });
      const next = trainingAfterSubmit(session, res);
      session = next.session;
      if (next.finished) await loadBuff();
    } catch (e) {
      error = failureText(e, 'No se pudo enviar tu elección.');
      if (trainingGone((e as any)?.message)) session = { ...session, active: false };
    } finally {
      busy = false;
    }
  }

  onMount(() => void loadBuff());
</script>

<TrainingView {pet} {buff} {session} {busy} {error} on:start={start} on:pick={(e) => pick(e.detail.element, e.detail.prediction)} />
