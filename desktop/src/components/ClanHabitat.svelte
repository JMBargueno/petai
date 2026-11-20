<script lang="ts">
  /**
   * El hábitat del clan vive en `@pockai/ui` (`ClanHabitat`). Este envoltorio le da cómo traerlo y el
   * clima local del escritorio; el resto (props, el evento `xp` y la cabecera del clan, en el hueco)
   * pasa tal cual.
   */
  import { ClanHabitat } from '@pockai/ui';
  import { api } from '../lib/api';
  import { environmentalStatus } from '../lib/environmental';

  export let clanId: string;
  export let xp = 0;
  export let refreshKey = 0;
</script>

<ClanHabitat {clanId} {xp} {refreshKey} loadHabitat={(id) => api.getClanHabitat(id)} weather={$environmentalStatus?.weather ?? null} on:xp>
  <slot />
</ClanHabitat>
