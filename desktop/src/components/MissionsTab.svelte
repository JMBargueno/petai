<script lang="ts">
  /** Progreso › Misiones en el escritorio: carga y reclama; la pantalla es `MissionsView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { MissionsView, missionRewardLabel } from '@pockai/ui';
  import { api, type Mission, type MissionList, type MissionSummary } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  let data: MissionList | null = null;
  let summary: MissionSummary | null = null;
  let error = '';
  let loading = true;
  let busyId = '';
  let claimedMsg = '';

  /** `keepMsg`: recarga tras reclamar, sin borrar el aviso de la recompensa. */
  async function load(keepMsg = false) {
    loading = true;
    error = '';
    if (!keepMsg) claimedMsg = '';
    try {
      [data, summary] = await Promise.all([api.getMissions(), api.getMissionsSummary()]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudieron cargar las misiones.');
    } finally {
      loading = false;
    }
  }

  async function claim(m: Mission) {
    busyId = m.id;
    error = '';
    claimedMsg = '';
    try {
      const res = await api.claimMission(m.id);
      claimedMsg = `Has recibido ${missionRewardLabel(m)}.` + (res.dailyChestUnlocked ? ' ¡Y has desbloqueado el cofre diario! Ábrelo en Tienda › Cofres.' : '');
      await load(true);
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo reclamar la recompensa.');
    } finally {
      busyId = '';
    }
  }

  onMount(() => load());
</script>

<MissionsView {data} {summary} {loading} {error} {busyId} {claimedMsg} on:refresh={() => load()} on:claim={(e) => claim(e.detail)} />
