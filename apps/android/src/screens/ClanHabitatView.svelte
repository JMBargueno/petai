<script lang="ts">
  /**
   * El hábitat del clan de `@pockai/ui` con lo de Android: se trae por el núcleo. Sin clima local
   * todavía (el cielo sigue la hora). La cabecera del clan llega en el hueco y el evento `xp` pasa.
   */
  import { query } from '@pockai/client';
  import { ClanHabitat } from '@pockai/ui';

  export let clanId: string;
  export let xp = 0;
  export let refreshKey = 0;

  const loadHabitat = (id: string) => query({ type: 'getClanHabitat', clanId: id }) as Promise<any>;
</script>

<ClanHabitat {clanId} {xp} {refreshKey} {loadHabitat} on:xp>
  <slot />
</ClanHabitat>
