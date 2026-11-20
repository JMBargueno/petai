<script lang="ts">
  /**
   * Mascota › Hábitat: la pantalla entera es `HabitatView`, de `@pockai/ui`, hablando con el núcleo.
   * En el móvil la mascota no sale de su hábitat y aún no hay sala isométrica: salas, catálogo,
   * comprar y quitar muebles, y buffs. La mascota y el saldo los pone al día el núcleo.
   */
  import { query } from '@pockai/client';
  import { HabitatView, type HabitatApi } from '@pockai/ui';
  import { act, failureText } from '../core';

  let { pet = null, user = null }: { pet?: any; user?: any } = $props();

  const habitatApi: HabitatApi = {
    getHabitatCatalog: () => query({ type: 'getHabitatCatalog' }),
    getHabitat: () => query({ type: 'getHabitat' }),
    getHabitatBuffs: () => query({ type: 'getHabitatBuffs' }),
    placeHabitatFurniture: (furnitureId, at) => act({ type: 'placeHabitatFurniture', furnitureId, at: at ?? null }) as Promise<any>,
    moveHabitatItem: (itemId, to) => act({ type: 'moveHabitatItem', itemId, to }) as Promise<any>,
    removeHabitatItem: (itemId) => act({ type: 'removeHabitatItem', itemId }),
    setPetInHabitat: (petId, inHabitat) => act({ type: 'setInHabitat', petId, inHabitat }),
    errorText: (e, fallback) => failureText(e, fallback ?? 'Algo ha fallado. Inténtalo de nuevo.'),
  };
</script>

<HabitatView {pet} {user} {habitatApi} canLeave={false} />
