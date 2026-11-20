<script lang="ts">
  /**
   * La sala isométrica de `@pockai/ui` con lo del móvil: el uso de un mueble se avisa al núcleo.
   * Sin clima local ni personalidad todavía (la sala usa los valores por defecto). El resto (props,
   * eventos, `selectedId` y `rotate()`) pasa tal cual, como el envoltorio del escritorio.
   */
  import { IsoRoomView } from '@pockai/ui';
  import { act } from '../core';

  export let selectedId: string | null = null;

  let inner: any;
  /** Gira el mueble seleccionado (botón «Girar» del panel). */
  export function rotate() {
    inner?.rotate();
  }

  const useItem = (itemId: string) => act({ type: 'useHabitatItem', itemId }) as Promise<any>;
</script>

<IsoRoomView bind:this={inner} bind:selectedId {useItem} {...$$restProps} on:move on:select on:petTap on:petPress on:furnitureUsed />
