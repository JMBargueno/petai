<script lang="ts">
  /**
   * Mascota › Hábitat en el escritorio: la pantalla entera es `HabitatView`, de `@pockai/ui`. Aquí
   * se le da cómo hablar con el servidor y lo propio del escritorio: la sala isométrica, arrastrar a
   * la mascota fuera de la ventana, el modo hábitat a pantalla completa, el paisaje, lo que dice el
   * visitante y los muebles que desbloquean habilidades.
   */
  import { createEventDispatcher } from 'svelte';
  import { HabitatView, type HabitatApi, type HabitatHooks } from '@pockai/ui';
  import { api } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';
  import { startHabitatExitDrag } from '../lib/habitatExitDrag';
  import { habitatMode } from '../lib/habitatMode';
  import { habitatBackdrop } from '../lib/habitatBackdrop';
  import { visitorTalk } from '../lib/visitDialog';
  import { ownedFurniture } from '../lib/stores/desktopSkillsStore';
  import IsoRoomView from './IsoRoomView.svelte';

  export let pet: any = null;
  export let user: any = null;

  const dispatch = createEventDispatcher();

  const habitatApi: HabitatApi = {
    getHabitatCatalog: () => api.getHabitatCatalog(),
    getHabitat: () => api.getHabitat(),
    getHabitatBuffs: () => api.getHabitatBuffs(),
    placeHabitatFurniture: (furnitureId, at) => api.placeHabitatFurniture(furnitureId, at),
    moveHabitatItem: (itemId, to) => api.moveHabitatItem(itemId, to),
    removeHabitatItem: (itemId) => api.removeHabitatItem(itemId),
    setPetInHabitat: (petId, inHabitat) => api.setPetInHabitat(petId, inHabitat),
    errorText: (e, fallback) => friendlyError(e, fallback),
  };

  const hooks: HabitatHooks = {
    ownedFurniture: (ids) => ownedFurniture.set(ids),
    petPress: (detail) => startHabitatExitDrag(detail.event, detail.ghost, detail.room),
    enterHabitatMode: (roomId) => habitatMode.enter(roomId),
    backdrop: habitatBackdrop,
    visitorTalk,
  };
</script>

<HabitatView
  {pet}
  {user}
  {habitatApi}
  {hooks}
  room={IsoRoomView}
  on:petUpdated={(e) => dispatch('petUpdated', e.detail)}
  on:refreshUser={() => dispatch('refreshUser')}
/>
