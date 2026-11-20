<script lang="ts">
  /** Jugar › Torneo: pide los datos al núcleo e inscribe; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { TournamentView, tournamentEnterText } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let current = $state<any>(null);
  let standings = $state<any>(null);
  let bracket = $state<any>(null);
  let bracketError = $state(false);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let enterMsg = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      [current, standings] = (await Promise.all([
        query({ type: 'getTournamentCurrent' }),
        query({ type: 'getTournamentStandings', limit: 20 }),
      ])) as [any, any];
      // El cuadro solo existe cuando el torneo ya pasó la fase de inscripción.
      bracketError = false;
      bracket = current?.status !== 'entry' ? await query({ type: 'getTournamentBracket' }).catch(() => ((bracketError = true), null)) : null;
    } catch (e) {
      error = failureText(e, 'No se pudo cargar el torneo.');
    } finally {
      loading = false;
    }
  }

  /** El saldo lo pone al día el núcleo. */
  async function enter() {
    if (!pet || busy) return;
    busy = true;
    error = '';
    enterMsg = '';
    try {
      enterMsg = tournamentEnterText((await act({ type: 'tournamentEnter', petId: String(pet.id) })) as any);
      await load();
    } catch (e) {
      error = failureText(e, 'No se pudo completar la inscripción.');
    } finally {
      busy = false;
    }
  }

  onMount(() => void load());
</script>

<TournamentView {pet} {current} {standings} {bracket} {bracketError} {loading} {error} {busy} {enterMsg} on:refresh={() => load()} on:enter={enter} />
