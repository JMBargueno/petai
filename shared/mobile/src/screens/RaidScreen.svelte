<script lang="ts">
  /** Jugar › Raid: pide los datos al núcleo y ataca; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { RaidView, RAID_SETTLED, raidHitText } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null }: { pet?: any } = $props();

  let current = $state<any>(null);
  let board = $state<any>(null);
  let history = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let lastHit = $state('');
  let settledMsg = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      [current, board, history] = (await Promise.all([
        query({ type: 'getRaidCurrent' }),
        query({ type: 'getRaidLeaderboard', limit: 10 }),
        query({ type: 'getRaidHistory', limit: 5 }),
      ])) as [any, any, any[]];
    } catch (e) {
      error = failureText(e, 'No se pudo cargar la raid.');
    } finally {
      loading = false;
    }
  }

  /** La mascota y el saldo los pone al día el núcleo. */
  async function attack() {
    if (!pet || busy) return;
    busy = true;
    error = '';
    lastHit = '';
    settledMsg = '';
    try {
      const res = (await act({ type: 'raidAttack', petId: String(pet.id) })) as any;
      lastHit = raidHitText(res);
      if (res?.settled) settledMsg = RAID_SETTLED;
      await load();
    } catch (e) {
      error = failureText(e, 'No se pudo atacar.');
    } finally {
      busy = false;
    }
  }

  onMount(() => void load());
</script>

<RaidView {pet} {current} {board} {history} {loading} {error} {busy} {lastHit} {settledMsg} on:refresh={() => load()} on:attack={attack} />
