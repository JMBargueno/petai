<script lang="ts">
  /** Vive en `shared/ui` (@pockai/ui); este fichero mantiene la ruta de siempre. */
  import { PetMiniAvatar } from '@pockai/ui';

  export let pet: any;
</script>

<PetMiniAvatar {pet} {...$$restProps} />
