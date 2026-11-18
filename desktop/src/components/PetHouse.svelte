<script lang="ts">
  /**
   * Casa del Pockai en Inicio: su sala activa en isométrico, solo para mirar (la edición está en
   * Mascota › Hábitat). Carga el hábitat y el catálogo una vez por montaje; si fallan, se queda
   * la sala vacía con el Pockai (no bloquea la pantalla de Inicio).
   */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type HabitatFurniture, type HabitatRoom } from '../lib/api';
  import IsoRoomView from './IsoRoomView.svelte';

  export let pet: any = null;
  export let height = 220;
  export let label = 'Casa del Pockai';

  const dispatch = createEventDispatcher<{ petPress: { event: MouseEvent; ghost: HTMLElement } }>();

  /** Sala por defecto mientras carga (o si la API falla): la "sala" sin muebles. */
  const EMPTY_ROOM: HabitatRoom = {
    id: 'sala',
    name: 'Sala',
    description: '',
    gridWidth: 14,
    gridHeight: 10,
    unlocked: true,
    active: true,
    theme: null,
    items: [],
  };

  let room: HabitatRoom = EMPTY_ROOM;
  let furniture: HabitatFurniture[] = [];

  onMount(async () => {
    try {
      const [state, catalog] = await Promise.all([api.getHabitat(), api.getHabitatCatalog()]);
      furniture = catalog.furniture;
      // La sala más avanzada desbloqueada con muebles; si no hay ninguna amueblada, la primera.
      const rooms = state.rooms.filter((r) => r.unlocked && r.active);
      room = [...rooms].reverse().find((r) => r.items.length > 0) ?? rooms[0] ?? EMPTY_ROOM;
    } catch {
      // Sin hábitat (o sin red): sala vacía.
    }
  });
</script>

<div class="pet-house">
  <IsoRoomView
    {pet}
    {room}
    {furniture}
    {label}
    {height}
    activity={pet?.sleeping ? 'sleep' : 'idle'}
    night={!!pet?.sleeping}
    showVisitors
    on:petPress={(e) => dispatch('petPress', e.detail)}
  />
  <slot name="overlay" />
</div>

<style>
  .pet-house {
    color-scheme: light;
    position: relative;
    overflow: hidden;
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-2xl);
    background:
      radial-gradient(80% 70% at 50% 35%, rgb(255 255 255 / 0.65), transparent 75%),
      var(--band-sky, #dceeff);
  }
</style>
