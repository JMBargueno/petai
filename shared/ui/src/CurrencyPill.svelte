<script lang="ts">
  /**
   * Cantidad de monedas o gemas con su icono. `plain` sin borde (precios dentro de texto o botones).
   * `sound`: suena al subir la cantidad (solo el saldo de la cabecera, para no sonar en cada precio).
   */
  import Ico from './Ico.svelte';
  import { emitUiFeedback } from './feedback';

  export let kind: 'coins' | 'gems' = 'coins';
  export let amount: number | string;
  export let plain = false;
  export let sound = false;

  let last: number | null = null;
  $: {
    const n = typeof amount === 'number' ? amount : Number(amount);
    if (sound && Number.isFinite(n)) {
      if (last !== null && n > last) emitUiFeedback(kind === 'coins' ? 'coinGain' : 'gemGain');
      last = n;
    }
  }
</script>

<span class="ui-currency ui-currency--{kind}" class:ui-currency--plain={plain} title={kind === 'coins' ? 'Monedas' : 'Gemas'}>
  <Ico n={kind === 'coins' ? 'coin' : 'gem'} size={14} />{amount}
</span>
