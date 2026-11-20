<script lang="ts">
  /** Jugar › Torneo en el escritorio: carga e inscribe; la pantalla es `TournamentView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { TournamentView, tournamentEnterText } from '@pockai/ui';
  import { api, type TournamentCurrent, type TournamentStandings, type TournamentBracket } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: TournamentCurrent | null = null;
  let standings: TournamentStandings | null = null;
  let bracket: TournamentBracket | null = null;
  let error = '';
  let loading = true;
  let busy = false;
  let bracketError = false;
  let enterMsg = '';

  async function load() {
    loading = true;
    error = '';
    try {
      [current, standings] = await Promise.all([api.getTournamentCurrent(), api.getTournamentStandings(20)]);
      // El cuadro solo existe cuando el torneo ya pasó la fase de inscripción.
      bracketError = false;
      bracket = current.status !== 'entry' ? await api.getTournamentBracket().catch(() => ((bracketError = true), null)) : null;
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar el torneo.');
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
      enterMsg = tournamentEnterText(await api.tournamentEnter(pet.id));
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo completar la inscripción.');
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<TournamentView {pet} {current} {standings} {bracket} {bracketError} {loading} {error} {busy} {enterMsg} on:refresh={load} on:enter={enter} />
