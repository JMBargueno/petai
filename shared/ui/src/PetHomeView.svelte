<script lang="ts">
  /**
   * Inicio de la mascota: ficha, constantes, cuidados y comida. Solo pinta: lo que el jugador pide
   * sale como evento y lo atiende el contenedor de cada app.
   *
   * Si la mascota está en su hábitat, cada app enseña lo suyo en el hueco `habitat` (el escritorio,
   * la casita de la que se la puede sacar arrastrando).
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import { elementMeta, rarityMeta } from './maps';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import EmptyState from './EmptyState.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import Segmented from './Segmented.svelte';

  export let pet: any = null;
  export let inventory: any[] = [];
  /** Solo la comida va a «Alimentar»: el resto (medicinas, Enhebrador…) se usa desde la Mochila. */
  $: foods = inventory.filter((i) => i.qty > 0 && (i.item?.kind ?? 'food') === 'food');
  /** Todas las mascotas: con más de una aparece el selector de mascota activa. */
  export let pets: any[] = [];
  /** Acción en curso en el panel (`clean`, `sleep`, `habitat`, `feed:<id>`), para bloquear su botón. */
  export let busy: string | null = null;
  /** Enseña «A casa». Solo tiene sentido donde la mascota puede estar fuera de su hábitat (el escritorio). */
  export let habitatToggle = true;

  const dispatch = createEventDispatcher<{
    clean: void;
    toggleSleep: void;
    toggleHabitat: boolean;
    feed: string;
    selectPet: string;
    go: { dest: string; sub?: string };
  }>();

  $: name = pet?.nickname || pet?.species?.name;
  $: vitals = pet
    ? [
        { label: 'Saciedad', icon: 'drumstick', value: pet.hunger, color: 'var(--color-ember)' },
        { label: 'Felicidad', icon: 'xp', value: pet.happiness, color: 'var(--color-sunburst)' },
        { label: 'Energía', icon: 'energy', value: pet.energy, color: 'var(--color-electric-blue)' },
        { label: 'Higiene', icon: 'water', value: pet.hygiene, color: 'var(--color-mint-pop)' },
      ]
    : [];

</script>

<div class="ui-stack">
  {#if pets.length > 1 && pet}
    <Segmented
      variant="pills"
      label="Mascota activa"
      value={pet.id}
      options={pets.map((p) => ({ value: p.id, label: p.nickname || p.species?.name || 'Pockai', icon: 'paw' }))}
      on:change={(e) => dispatch('selectPet', e.detail)}
    />
  {/if}
  {#if pet}
    {@const el = elementMeta(pet.species?.element)}
    {@const rar = rarityMeta(pet.rarity)}
    <Card variant="hero" class="pet-hero">
      <div class="hero-row">
        <div class="hero-info">
          <div class="hero-title">
            <span class="pet-title" title={name}>{name}</span>
            {#if pet.inHabitat}<Badge color="var(--color-mint-pop)" icon="home" title="Descansando en su Hábitat">En casa</Badge>{/if}
          </div>
          <div class="hero-tags">
            {#if pet.species?.element}<Badge size="sm" color={el.color} icon={el.icon}>{el.label}</Badge>{/if}
            {#if pet.rarity}<Badge size="sm" color={rar.color} solid>{rar.label}</Badge>{/if}
            {#if pet.pattern}<Badge size="sm" icon="magic" title={pet.pattern.description}>Patrón: {pet.pattern.name ?? pet.pattern.id}</Badge>{/if}
            {#if pet.shiny}<Badge size="sm" color="var(--rarity-legendary)" icon="xp" solid title="Pockai brillante">Shiny</Badge>{/if}
          </div>
        </div>
        <span class="level-tag">Nv. {pet.level}</span>
      </div>
    </Card>

    {#if pet.inHabitat}<slot name="habitat" />{/if}

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
      <Button size="lg" icon="water" class="grow" loading={busy === 'clean'} disabled={!!busy} on:click={() => dispatch('clean')}>Bañar</Button>
      <Button size="lg" icon={pet.sleeping ? 'sun' : 'moon'} class="grow" loading={busy === 'sleep'} disabled={!!busy} on:click={() => dispatch('toggleSleep')}>
        {pet.sleeping ? 'Despertar' : 'Dormir'}
      </Button>
      {#if habitatToggle && !pet.inHabitat}
        <Button size="lg" icon="home" class="grow" title="Llevar a casa (su Hábitat)" loading={busy === 'habitat'} disabled={!!busy} on:click={() => dispatch('toggleHabitat', true)}>A casa</Button>
      {/if}
    </div>

    <SectionHeader title="Alimentar" icon="food" count={foods.length || null} />
    {#if foods.length}
      <div class="food">
        {#each foods as item}
          <button
            class="food-chip"
            disabled={!!busy}
            aria-busy={busy === `feed:${item.itemId}` || undefined}
            aria-label="Dar {item.item.name} (te quedan {item.qty})"
            title="Dar {item.item.name}"
            on:click={() => dispatch('feed', item.itemId)}
          >
            <ItemIcon id={item.itemId} fallback="drumstick" /> {item.item.name} <span class="qty" aria-hidden="true">{item.qty}</span>
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
  .food-chip:hover:not(:disabled) {
    translate: -1px -1px;
    box-shadow: 2px 2px 0 var(--line);
  }
  .food-chip:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  .food-chip {
    min-height: var(--control-h-icon);
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
