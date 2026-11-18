<script lang="ts">
  /** Cantidad de monedas o gemas con su icono. `plain` sin borde (precios dentro de texto o botones). */
  import Ico from '../Ico.svelte';

  export let kind: 'coins' | 'gems' = 'coins';
  export let amount: number | string;
  export let plain = false;
</script>

<span class="ui-currency ui-currency--{kind}" class:ui-currency--plain={plain} title={kind === 'coins' ? 'Monedas' : 'Gemas'}>
  <Ico n={kind === 'coins' ? 'coin' : 'gem'} size={14} />{amount}
</span>
