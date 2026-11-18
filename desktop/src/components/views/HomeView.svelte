<script lang="ts">
  /**
   * Mascota › Inicio: ficha, casita (si está en el Hábitat), vitales, cuidados y comida.
   * Las acciones las ejecuta ControlPanel (necesitan el canal de errores y los eventos del panel).
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';
  import PetHouse from '../PetHouse.svelte';
  import { startHabitatExitDrag } from '../../lib/habitatExitDrag';
  import { elementMeta, rarityMeta } from '../../lib/ui/maps';
  import { Badge, Button, Card, EmptyState, ProgressBar, SectionHeader } from '../ui';

  export let pet: any = null;
  export let inventory: any[] = [];

  const dispatch = createEventDispatcher<{
    clean: void;
    toggleSleep: void;
    toggleHabitat: boolean;
    feed: string;
    go: { dest: string; sub?: string };
  }>();

  $: name = pet?.nickname || pet?.species?.name;
  $: vitals = pet
    ? [
        { label: 'Hambre', icon: 'drumstick', value: pet.hunger, color: 'var(--color-ember)' },
        { label: 'Felicidad', icon: 'xp', value: pet.happiness, color: 'var(--color-sunburst)' },
        { label: 'Energía', icon: 'energy', value: pet.energy, color: 'var(--color-electric-blue)' },
        { label: 'Higiene', icon: 'water', value: pet.hygiene, color: 'var(--color-mint-pop)' },
      ]
    : [];

  /** Arrastrar al Pockai fuera de su casa lo saca al escritorio (como en Mascota › Hábitat). */
  function handlePetPress(e: CustomEvent<{ event: MouseEvent; ghost: HTMLElement }>) {
    startHabitatExitDrag(e.detail.event, e.detail.ghost);
  }
</script>

<div class="ui-stack">
  {#if pet}
    {@const el = elementMeta(pet.species?.element)}
    {@const rar = rarityMeta(pet.rarity)}
    <Card variant="hero" class="pet-hero">
      <div class="hero-row">
        <div class="hero-info">
          <div class="hero-title">
            <span class="pet-title">{name}</span>
            {#if pet.inHabitat}<Badge color="var(--color-mint-pop)" icon="home" title="Descansando en su Hábitat">En casa</Badge>{/if}
          </div>
          <div class="hero-tags">
            {#if pet.species?.element}<Badge size="sm" color={el.color} icon={el.icon}>{el.label}</Badge>{/if}
            {#if pet.rarity}<Badge size="sm" color={rar.color} solid>{rar.label}</Badge>{/if}
          </div>
        </div>
        <span class="level-tag">Nv. {pet.level}</span>
      </div>
    </Card>

    {#if pet.inHabitat}
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
    {/if}

    <div class="vitals">
      {#each vitals as v (v.label)}
        <div class="vital" class:low={v.value < 25}>
          <div class="vital-label">
            <span><span class="vital-icon" style="background: {v.color}"><Ico n={v.icon} size={13} /></span>{v.label}</span>
            <span class="vital-value">{Math.round(v.value)}%</span>
          </div>
          <ProgressBar value={v.value} color={v.color} size="sm" label="" />
        </div>
      {/each}
    </div>

    <div class="row">
      <Button size="lg" icon="water" class="grow" on:click={() => dispatch('clean')}>Bañar</Button>
      <Button size="lg" icon={pet.sleeping ? 'sun' : 'moon'} class="grow" on:click={() => dispatch('toggleSleep')}>
        {pet.sleeping ? 'Despertar' : 'Dormir'}
      </Button>
      {#if !pet.inHabitat}
        <Button size="lg" icon="home" class="grow" title="Llevar al Hábitat" on:click={() => dispatch('toggleHabitat', true)}>A casa</Button>
      {/if}
    </div>

    <SectionHeader title="Alimentar" icon="food" count={inventory.length || null} />
    {#if inventory.length}
      <div class="food">
        {#each inventory as item}
          <button class="food-chip" on:click={() => dispatch('feed', item.itemId)}>
            <Ico n="drumstick" size={13} /> {item.item.name} <span class="qty">{item.qty}</span>
          </button>
        {/each}
      </div>
    {:else}
      <EmptyState compact icon="food" text="No tienes alimentos.">
        <Button size="sm" icon="shop" on:click={() => dispatch('go', { dest: 'shop', sub: 'store' })}>Ir a la tienda</Button>
      </EmptyState>
    {/if}
  {:else}
    <EmptyState icon="egg" title="Sin mascota" text="No tienes una mascota activa.">
      <Button variant="primary" icon="egg" on:click={() => dispatch('go', { dest: 'pet', sub: 'hatch' })}>Ir a eclosionar un huevo</Button>
    </EmptyState>
  {/if}
</div>

<style>
  .hero-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .hero-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .hero-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .pet-title {
    font-family: var(--font-display);
    font-size: var(--text-subheading);
    line-height: 1.05;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .level-tag {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--on-color);
    border-radius: var(--radius-pills);
    background: var(--color-sunburst);
    box-shadow: 2px 2px 0 var(--on-color);
    color: var(--on-color);
    font-size: var(--text-label);
    font-weight: 800;
  }
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
  .row :global(.grow) {
    flex: 1;
  }
  .vitals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }
  .vital {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface);
  }
  .vital.low {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  }
  .vital-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-muted);
    font-size: var(--text-caption);
    font-weight: 700;
  }
  .vital-label > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .vital-icon {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1px solid var(--on-color);
    border-radius: var(--radius-sm);
    color: var(--on-color);
  }
  .vital-value {
    color: var(--ink);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .vital.low .vital-value {
    color: var(--danger-ink);
  }
  .food {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .food-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
    border: 1px solid var(--on-color);
    border-radius: var(--radius-pills);
    background: var(--color-mint-pop);
    color: var(--on-color);
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
    transition: translate var(--dur-1), box-shadow var(--dur-1);
  }
  .food-chip:hover {
    translate: -1px -1px;
    box-shadow: 2px 2px 0 var(--line);
  }
  .qty {
    min-width: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pills);
    background: var(--ink);
    color: var(--bg);
    font-size: var(--text-caption);
    font-weight: 800;
    text-align: center;
  }
</style>
