<script lang="ts">
  /**
   * La sala isométrica vive en `@pockai/ui` (`IsoRoomView`). Este envoltorio le pone lo que solo
   * sabe el escritorio: el clima local, el paisaje elegido, la personalidad que da su cerebro y el
   * aviso al servidor cuando la mascota usa un mueble. El resto (props, eventos, `selectedId` y
   * `rotate()`) pasa tal cual, así que quien lo usa no cambia.
   */
  import { IsoRoomView } from '@pockai/ui';
  import { api } from '../lib/api';
  import { environmentalStatus } from '../lib/environmental';
  import { habitatBackdrop } from '../lib/habitatBackdrop';
  import { fallbackDims, loadDims, petDims } from '../lib/brain/personalityStore';

  export let pet: any = null;
  export let selectedId: string | null = null;

  let inner: any;
  /** Gira el mueble seleccionado (botón «Girar» del panel). */
  export function rotate() {
    inner?.rotate();
  }

  // La personalidad es la última que dio el servidor para esta mascota; `$petDims` solo se lee para
  // refrescar cuando llega una nueva.
  function dimsOf(p: any, _latest: unknown) {
    return p ? (loadDims(typeof localStorage === 'undefined' ? null : localStorage, p.id) ?? fallbackDims(p)) : null;
  }
  $: dims = dimsOf(pet, $petDims);
</script>

<IsoRoomView
  bind:this={inner}
  bind:selectedId
  {pet}
  {dims}
  weather={$environmentalStatus?.weather ?? null}
  backdrop={$habitatBackdrop}
  useItem={(itemId) => api.useHabitatItem(itemId)}
  {...$$restProps}
  on:move
  on:select
  on:petTap
  on:petPress
  on:furnitureUsed
/>
