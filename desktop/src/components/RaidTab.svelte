<script lang="ts">
  /** Jugar › Raid en el escritorio: carga y ataca; la pantalla es `RaidView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { RaidView, RAID_SETTLED, raidHitText } from '@pockai/ui';
  import { api, type RaidCurrent, type RaidLeaderboard, type RaidHistoryEntry } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let current: RaidCurrent | null = null;
  let board: RaidLeaderboard | null = null;
  let history: RaidHistoryEntry[] = [];
  let error = '';
  let loading = true;
  let busy = false;
  let lastHit = '';
  let settledMsg = '';

  async function load() {
    loading = true;
    error = '';
    try {
      [current, board, history] = await Promise.all([api.getRaidCurrent(), api.getRaidLeaderboard(10), api.getRaidHistory(5)]);
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo cargar la raid.');
    } finally {
      loading = false;
    }
  }

  async function attack() {
    if (!pet) return;
    busy = true;
    error = '';
    lastHit = '';
    settledMsg = '';
    try {
      const res = await api.raidAttack(pet.id);
      lastHit = raidHitText(res);
      if (res.settled) settledMsg = RAID_SETTLED;
      await load();
      dispatch('refreshPet');
      dispatch('refreshUser');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo atacar.');
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<RaidView {pet} {current} {board} {history} {loading} {error} {busy} {lastHit} {settledMsg} on:refresh={load} on:attack={attack} />
