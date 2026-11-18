<script lang="ts">
  /**
   * Guía de primer uso: cuatro pasos que presentan las secciones del panel. Se puede saltar
   * en cualquier momento (botón, Esc o clic fuera) y al terminar ofrece abrir Ajustes.
   */
  import { createEventDispatcher } from 'svelte';
  import Ico from './Ico.svelte';
  import { Button, Modal } from './ui';

  const dispatch = createEventDispatcher<{ done: void; go: { dest: string; sub?: string } }>();

  const STEPS = [
    {
      icon: 'paw',
      tint: 'var(--theme-care)',
      title: 'Cuida de tu pockai',
      text: 'En Mascota ves cómo está: dale de comer, límpialo y déjalo dormir. También puedes arrastrarlo por el escritorio.',
    },
    {
      icon: 'chat',
      tint: 'var(--theme-ai)',
      title: 'Habla con él',
      text: 'En Chat puedes escribirle lo que quieras. Si sueltas un archivo sobre tu pockai, te lo comenta.',
    },
    {
      icon: 'gamepad',
      tint: 'var(--theme-arena)',
      title: 'Juega y progresa',
      text: 'Jugar reúne minijuegos, arena y aventuras. En Progreso están las misiones y la temporada, y en Tienda gastas tus monedas.',
    },
    {
      icon: 'settings',
      tint: 'var(--theme-social)',
      title: 'Hazlo tuyo',
      text: 'El engranaje de arriba abre Ajustes: avisos, tema claro u oscuro y arranque con el sistema. En «Acerca de» puedes volver a ver esta guía.',
    },
  ];

  let i = 0;
  $: step = STEPS[i];
  $: last = i === STEPS.length - 1;

  function finish() {
    dispatch('done');
  }
  function next() {
    if (last) finish();
    else i += 1;
  }
  function openSettings() {
    dispatch('go', { dest: 'settings', sub: 'desktop' });
    finish();
  }
</script>

<Modal label="Guía de primer uso" on:close={finish}>
  <div class="ob" aria-live="polite">
    <span class="ob-icon" style="--ob-tint: {step.tint}" aria-hidden="true"><Ico n={step.icon} size={28} /></span>
    <p class="label-caps ob-count">Paso {i + 1} de {STEPS.length}</p>
    {#key i}
      <div class="ob-copy">
        <h2 class="display ob-title">{step.title}</h2>
        <p class="ob-text">{step.text}</p>
      </div>
    {/key}
    <div class="ob-dots" aria-hidden="true">
      {#each STEPS as _, n}<i class:on={n === i}></i>{/each}
    </div>
  </div>

  <svelte:fragment slot="footer">
    {#if i > 0}
      <Button variant="ghost" on:click={() => (i -= 1)}>Atrás</Button>
    {:else}
      <Button variant="ghost" on:click={finish}>Saltar</Button>
    {/if}
    <span class="ob-spacer"></span>
    {#if last}
      <Button on:click={openSettings}>Abrir Ajustes</Button>
    {/if}
    <button type="button" class="btn btn--primary" data-autofocus on:click={next}>{last ? 'Empezar' : 'Siguiente'}</button>
  </svelte:fragment>
</Modal>

<style>
  .ob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }
  .ob-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 1.5px solid var(--on-color);
    border-radius: var(--radius-cards);
    background: var(--ob-tint);
    color: var(--on-color);
    box-shadow: 3px 4px 0 var(--line);
    transition: background var(--dur-2) var(--ease-out);
  }
  .ob-count {
    margin: var(--space-2) 0 0;
    color: var(--ink-muted);
  }
  .ob-copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 124px;
    animation: ob-in var(--dur-2) var(--ease-out);
  }
  .ob-title {
    margin: 0;
    font-size: var(--text-subheading);
    line-height: var(--leading-tight);
    text-wrap: balance;
  }
  .ob-text {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body);
    line-height: var(--leading-body);
    text-wrap: pretty;
  }
  .ob-dots {
    display: flex;
    gap: var(--space-2);
  }
  .ob-dots i {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pills);
    background: var(--line-soft);
    transition:
      width var(--dur-2) var(--ease-out),
      background var(--dur-2);
  }
  .ob-dots i.on {
    width: 24px;
    background: var(--accent-ink);
  }
  .ob-spacer {
    flex: 1;
  }
  @keyframes ob-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
