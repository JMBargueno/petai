<script lang="ts">
  /** Progreso › Misiones: pide los datos al núcleo y reclama; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query, stateRefresh } from '@pockai/client';
  import { MissionsView, missionRewardLabel } from '@pockai/ui';
  import { act, failureText } from '../core';

  let data = $state<any>(null);
  let summary = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let busyId = $state('');
  let claimedMsg = $state('');

  /** `keepMsg`: recarga tras reclamar, sin borrar el aviso de la recompensa. */
  async function load(keepMsg = false) {
    loading = true;
    error = '';
    if (!keepMsg) claimedMsg = '';
    try {
      [data, summary] = await Promise.all([query({ type: 'getMissions' }), query({ type: 'getMissionsSummary' })]);
    } catch (e) {
      error = failureText(e, 'No se pudieron cargar las misiones.');
    } finally {
      loading = false;
    }
  }

  async function claim(mission: any) {
    busyId = mission.id;
    error = '';
    claimedMsg = '';
    try {
      const res = (await act({ type: 'claimMission', id: String(mission.id) })) as any;
      claimedMsg = `Has recibido ${missionRewardLabel(mission)}.` + (res?.dailyChestUnlocked ? ' ¡Y has desbloqueado el cofre diario!' : '');
      await load(true);
      // El saldo ha cambiado: que el núcleo lo ponga al día.
      void stateRefresh('user').catch(() => {});
    } catch (e) {
      error = failureText(e, 'No se pudo reclamar la recompensa.');
    } finally {
      busyId = '';
    }
  }

  onMount(() => void load());
</script>

<MissionsView {data} {summary} {loading} {error} {busyId} {claimedMsg} on:refresh={() => load()} on:claim={(e) => claim(e.detail)} />
