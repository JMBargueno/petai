<script lang="ts">
  /**
   * Mascota › Inicio en el escritorio. La ficha (constantes, cuidados, comida) es la de `@pockai/ui`,
   * la misma que usa el móvil; aquí se añade lo propio del escritorio: la casita, de la que se puede
   * sacar al Pockai arrastrándolo hacia fuera.
   * Las acciones las ejecuta ControlPanel (necesitan el canal de errores y los eventos del panel).
   */
  import { createEventDispatcher } from 'svelte';
  import { Badge, Button, Card, PetHomeView } from '@pockai/ui';
  import PetHouse from '../PetHouse.svelte';
  import { startHabitatExitDrag, type RoomPetDrag } from '../../lib/habitatExitDrag';

  export let pet: any = null;
  export let inventory: any[] = [];
  export let pets: any[] = [];
  export let busy: string | null = null;

  const dispatch = createEventDispatcher<{ toggleHabitat: boolean; go: { dest: string; sub?: string } }>();

  $: name = pet?.nickname || pet?.species?.name;

  /** Arrastrar al Pockai fuera de su casa lo saca al escritorio (como en Mascota › Hábitat). */
  function handlePetPress(e: CustomEvent<{ event: MouseEvent; ghost: HTMLElement; room: RoomPetDrag }>) {
    startHabitatExitDrag(e.detail.event, e.detail.ghost, e.detail.room);
  }
</script>

<PetHomeView {pet} {inventory} {pets} {busy} on:clean on:toggleSleep on:toggleHabitat on:feed on:selectPet on:go>
  <svelte:fragment slot="habitat">
    <Card variant="pop" size="sm">
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="home-house"
        title="Arrastra a {name} hacia el escritorio o pulsa Enter para sacarlo"
        on:keydown={(e) => e.key === 'Enter' && dispatch('toggleHabitat', false)}
      >
        <PetHouse
          {pet}
          height={210}
          label="Casa de {name}. Arrastra a {name} hacia el escritorio o pulsa Enter para sacarlo"
          on:petPress={handlePetPress}
        >
          <svelte:fragment slot="overlay">
            <span class="house-sign">Casa de {name}</span>
            <span class="drag-hint">⇄ Arrastra a {name} fuera para liberarlo</span>
          </svelte:fragment>
        </PetHouse>
      </div>
      <div class="home-details">
        <Badge color={pet.sleeping ? 'var(--color-lavender)' : 'var(--color-mint-pop)'} icon={pet.sleeping ? 'moon' : 'home'}>
          {pet.sleeping ? 'Durmiendo en casa' : 'Descansando en casa'}
        </Badge>
        <p class="ui-card__hint">No paseará por tu escritorio mientras esté dentro.</p>
        <div class="row">
          <Button variant="primary" size="sm" icon="external" on:click={() => dispatch('toggleHabitat', false)}>Sacar al escritorio</Button>
          <Button variant="ghost" size="sm" icon="home" on:click={() => dispatch('go', { dest: 'pet', sub: 'habitat' })}>Decorar casa</Button>
        </div>
      </div>
    </Card>
  </svelte:fragment>
</PetHomeView>

<style>
  .home-house {
    position: relative;
  }
  .house-sign {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: calc(var(--z-raised) + 1);
    max-width: 62%;
    padding: 3px var(--space-2);
    border: 1.5px solid var(--on-color);
    border-radius: var(--radius-pills);
    background: var(--color-sunburst);
    box-shadow: 2px 2px 0 var(--on-color);
    color: var(--on-color);
    font-family: var(--font-display);
    font-size: var(--text-caption);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .drag-hint {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: calc(var(--z-raised) + 1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-pills);
    background: rgb(255 255 255 / 0.8);
    color: var(--on-color);
    font-size: var(--text-caption);
    font-weight: 700;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--dur-1) ease;
  }
  .home-house:hover .drag-hint,
  .home-house:focus-within .drag-hint {
    opacity: 1;
  }
  .home-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
