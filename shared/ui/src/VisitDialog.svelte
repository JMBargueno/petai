<script lang="ts">
  /**
   * Hablar con el Pockai del amigo al que estás visitando (spec 37 §6.2). Por menú: el servidor
   * decide qué contesta y qué opciones hay; aquí solo se muestran y se envía la elegida. Cómo se
   * habla con el servidor lo pone cada app (`interact`: el núcleo en Android, la API en el escritorio).
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import Ico from './Ico.svelte';
  import type { VisitInteraction } from './social/types';
  import { optionIcon, visitorStageLabel } from './social/visitDialog';

  /** Amigo al que se visita (su userId). */
  export let ownerId: string;
  /** Empieza la charla (sin `choice`) o envía la opción elegida con el turno de la respuesta anterior. */
  export let interact: (ownerId: string, choice?: number, turn?: number) => Promise<VisitInteraction>;
  export let errorText: (error: unknown, fallback: string) => string;

  /** `reply`: cada respuesta del Pockai, para que la sala del amigo la represente. */
  const dispatch = createEventDispatcher<{ reply: VisitInteraction }>();

  let reply: VisitInteraction | null = null;
  let error = '';
  let loading = true;
  /** Índice de la opción enviada, mientras se espera la respuesta. */
  let sending = -1;

  async function start() {
    loading = true;
    error = '';
    try {
      reply = await interact(ownerId);
    } catch (e) {
      error = errorText(e, 'No se pudo hablar con el Pockai.');
    } finally {
      loading = false;
    }
  }

  async function choose(index: number) {
    if (!reply || sending >= 0) return;
    sending = index;
    error = '';
    try {
      // El turno evita que un doble clic o un reintento repita el efecto (p. ej. gastar dos premios)
      reply = await interact(ownerId, index, reply.turn);
      dispatch('reply', reply);
    } catch (e) {
      error = errorText(e, 'No se pudo enviar tu elección.');
    } finally {
      sending = -1;
    }
  }

  onMount(start);
</script>

<section class="talk" aria-label="Hablar con el Pockai de tu amigo">
  {#if loading}
    <div class="ui-skel talk-skel"></div>
  {:else if reply}
    <div class="talk-head">
      <span class="label-caps">{reply.petName}</span>
      {#if visitorStageLabel(reply.stage)}<span class="chip ui-chip">{visitorStageLabel(reply.stage)}</span>{/if}
    </div>
    <p class="talk-line" aria-live="polite">{reply.line}</p>
    {#if reply.options.length}
      <div class="talk-options">
        {#each reply.options as o, i (o.id)}
          <button class="talk-opt" class:bye={o.id === 'bye'} disabled={sending >= 0} aria-busy={sending === i || undefined} on:click={() => choose(i)}>
            {#if sending === i}<span class="ui-spinner" aria-hidden="true"></span>{:else}<Ico n={optionIcon(o.id)} size={14} />{/if}
            <span>{o.label}</span>
          </button>
        {/each}
      </div>
      {#if !reply.ended && reply.remaining <= 2}
        <p class="talk-hint">{reply.remaining === 0 ? 'Ya ha tenido bastante por hoy.' : `Le quedan ganas para ${reply.remaining} cosa${reply.remaining === 1 ? '' : 's'} más.`}</p>
      {/if}
    {:else}
      <p class="talk-hint">Os habéis despedido. Tu Pockai sigue de visita hasta que la termines.</p>
    {/if}
  {/if}
  {#if error}
    <p class="talk-error" role="alert">{error} {#if !reply}<button class="btn btn--ghost btn--sm" on:click={start}>Reintentar</button>{/if}</p>
  {/if}
</section>

<style>
  .talk {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
  }
  .talk-skel {
    height: 96px;
  }
  .talk-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .talk-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--text-body);
    line-height: 1.45;
    text-wrap: pretty;
  }
  .talk-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .talk-opt {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-full, 999px);
    background: var(--surface-1, transparent);
    color: var(--ink);
    font-size: var(--text-caption);
    font-weight: 700;
    cursor: pointer;
  }
  .talk-opt:hover:not(:disabled) {
    border-color: var(--theme-social, var(--line-strong));
  }
  .talk-opt:focus-visible {
    outline: 2px solid var(--theme-social, currentColor);
    outline-offset: 2px;
  }
  .talk-opt:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .talk-opt.bye {
    color: var(--ink-soft, var(--ink));
    font-weight: 600;
  }
  .talk-hint,
  .talk-error {
    margin: 0;
    font-size: var(--text-caption);
    color: var(--ink-soft, var(--ink));
  }
  .talk-error {
    color: var(--color-danger, #c0392b);
  }
</style>
