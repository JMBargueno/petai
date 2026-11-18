<script lang="ts">
  import Ico from '../../components/Ico.svelte';
  import Badge from '../profile/Badge.svelte';
  import { onDestroy } from 'svelte';
  import type { AchievementUnlockedPayload } from './achievements.api';

  /**
   * Aviso de logro desbloqueado. Al recibir `achievement:unlocked` (WebSocket) muestra la insignia,
   * el nombre y la recompensa; se cierra solo a los pocos segundos o al pulsarlo. Cada payload nuevo
   * reinicia el temporizador.
   */
  export let payload: AchievementUnlockedPayload | null = null;
  export let onDismiss: () => void = () => {};

  const HIDE_MS = 5000;
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shown: AchievementUnlockedPayload | null = null;

  $: if (payload && payload !== shown) show(payload);

  function show(p: AchievementUnlockedPayload) {
    shown = p;
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, HIDE_MS);
  }

  /** Con el ratón encima o el foco dentro no se cierra solo: da tiempo a leerlo. */
  function hold() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }
  function release() {
    if (!visible) return;
    hold();
    hideTimer = setTimeout(dismiss, HIDE_MS);
  }

  function dismiss() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    visible = false;
    onDismiss();
  }

  onDestroy(() => {
    if (hideTimer) clearTimeout(hideTimer);
  });
</script>

<div role="status" aria-live="polite">
{#if visible && shown}
  <button type="button" class="toast" title="Cerrar" on:click={dismiss} on:mouseenter={hold} on:mouseleave={release} on:focus={hold} on:blur={release}>
    <Badge icon={shown.badgeIcon ?? 'trophy'} tier={shown.tier} size={48} />
    <span class="toast__body">
      <span class="toast__title">¡Insignia desbloqueada!</span>
      <span class="toast__name">{shown.name}</span>
      <span class="toast__reward">
        {#if shown.reward.coins > 0}<span>+{shown.reward.coins} <Ico n="coin" /><span class="sr-only"> monedas</span></span>{/if}
        {#if shown.reward.gems > 0}<span>+{shown.reward.gems} <Ico n="gem" /><span class="sr-only"> gemas</span></span>{/if}
        {#if shown.reward.xp > 0}<span>+{shown.reward.xp} <Ico n="xp" /><span class="sr-only"> de experiencia</span></span>{/if}
        {#if shown.reward.itemId}<span class="toast__item">+ Objeto exclusivo</span>{/if}
      </span>
    </span>
  </button>
{/if}
</div>

<style>
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: var(--z-toast);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4) var(--space-2) var(--space-3);
    min-width: 240px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    box-shadow: 3px 4px 0 var(--line);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    animation: slideIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .toast__body {
    display: flex;
    flex-direction: column;
  }
  .toast__title {
    font-size: var(--text-caption);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
  }
  .toast__name {
    font-weight: 800;
    font-size: var(--text-body-lg);
    margin-top: 1px;
  }
  .toast__reward {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
    font-size: var(--text-label);
  }
  .toast__item {
    color: var(--color-voltage-violet);
  }
  @keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>
