<script lang="ts">
  /**
   * Mascota › Inicio: ficha, casita (si está en el Hábitat), vitales, cuidados y comida.
   * Las acciones las ejecuta ControlPanel (necesitan el canal de errores y los eventos del panel).
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from '../Ico.svelte';
  import PetMiniAvatar from '../PetMiniAvatar.svelte';
  import HomeScene from '../HomeScene.svelte';
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

  function handleExitDragStart(e: MouseEvent) {
    const host = e.currentTarget as HTMLElement;
    startHabitatExitDrag(e, host.querySelector<HTMLElement>('.pet-mini-avatar'));
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
        <HomeScene
          label="Casa de {name}"
          mood={pet.sleeping ? 'night' : 'day'}
          class="draggable"
          role="button"
          tabindex="0"
          aria-label="Casa de {name}. Arrastra hacia el escritorio o pulsa Enter para sacarlo"
          title="Arrastra hacia el escritorio o pulsa Enter para sacar a {name}"
          on:mousedown={handleExitDragStart}
          on:keydown={(e) => e.key === 'Enter' && dispatch('toggleHabitat', false)}
        >
          <span class="pet-shadow" aria-hidden="true"></span>
          <div class="home-pet"><PetMiniAvatar {pet} size={104} interactive={false} /></div>
          <span class="home-mood" class:asleep={pet.sleeping} aria-hidden="true">{pet.sleeping ? 'z' : '♥'}</span>
          <span slot="overlay" class="drag-hint">⇄ Arrastra fuera para liberar</span>
        </HomeScene>
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
    gap: 6px;
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
    gap: 6px;
  }
  .pet-title {
    font-family: var(--font-display);
    font-size: 22px;
    line-height: 1.05;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .level-tag {
    flex-shrink: 0;
    padding: 6px 12px;
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    background: var(--color-sunburst);
    box-shadow: 2px 2px 0 var(--color-carbon);
    color: var(--on-color);
    font-size: 13px;
    font-weight: 800;
  }
  :global(.home-scene.draggable) {
    cursor: grab;
  }
  :global(.home-scene.draggable:active) {
    cursor: grabbing;
  }
  .home-pet {
    position: relative;
    z-index: 1;
    transform-origin: 50% 100%;
    animation: homeBreathe 3.2s ease-in-out infinite;
  }
  .pet-shadow {
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 64px;
    height: 12px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: rgb(11 10 20 / 0.28);
    filter: blur(1px);
  }
  .home-mood {
    position: absolute;
    top: 4px;
    right: -6px;
    z-index: 2;
    color: #ff5c8a;
    font-family: var(--font-display);
    font-size: 16px;
    animation: homeFloat 2.6s ease-in-out infinite;
  }
  .home-mood.asleep {
    color: #e9ccff;
  }
  .drag-hint {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 2;
    padding: 2px 8px;
    border-radius: var(--radius-pills);
    background: rgb(255 255 255 / 0.8);
    color: var(--color-carbon);
    font-size: 10px;
    font-weight: 700;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--dur-1) ease;
  }
  :global(.home-scene:hover) .drag-hint,
  :global(.home-scene:focus-visible) .drag-hint {
    opacity: 1;
  }
  @keyframes homeBreathe {
    0%,
    100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.03, 0.97);
    }
  }
  @keyframes homeFloat {
    0% {
      transform: translateY(6px);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translateY(-14px);
      opacity: 0;
    }
  }
  .home-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
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
    gap: 8px;
    padding: 10px 12px;
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
    font-size: 12px;
    font-weight: 700;
  }
  .vital-label > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .vital-icon {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1px solid var(--color-carbon);
    border-radius: 8px;
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
    gap: 6px;
  }
  .food-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
    border: 1px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    background: var(--color-mint-pop);
    color: var(--on-color);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: translate var(--dur-1), box-shadow var(--dur-1);
  }
  .food-chip:hover {
    translate: -1px -1px;
    box-shadow: 2px 2px 0 var(--color-carbon);
  }
  .qty {
    min-width: 20px;
    padding: 0 6px;
    border-radius: var(--radius-pills);
    background: var(--color-carbon);
    color: var(--color-paper-white);
    font-size: 11px;
    font-weight: 800;
    text-align: center;
  }
</style>
