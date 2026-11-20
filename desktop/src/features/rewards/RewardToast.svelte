<script lang="ts">
  import { onDestroy } from 'svelte';
  import Ico from '../../components/Ico.svelte';
  import type { RewardReceived } from '../../lib/api';
  import { rewardLines, type RewardLineKind } from '../../lib/rewards';

  /**
   * Aviso de recompensa recibida (canje de voucher o regalo del equipo). La mascota ya celebra con
   * su efecto (`pet:action gift_received`); aquí va el desglose de lo recibido, con cada línea
   * entrando escalonada. Se cierra solo o al pulsarlo; con el ratón encima se queda.
   */
  export let payload: RewardReceived | null = null;
  export let onDismiss: () => void = () => {};

  const HIDE_MS = 7000;
  const ICONS: Record<RewardLineKind, string> = { coins: 'coin', gems: 'gem', pro: 'star', chest: 'package', accessory: 'magic' };
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shown: RewardReceived | null = null;

  $: if (payload && payload !== shown) show(payload);
  $: lines = shown ? rewardLines(shown.granted) : [];
  $: title = shown?.source === 'admin_grant' ? '¡Un regalo del equipo!' : '¡Código canjeado!';

  function show(p: RewardReceived) {
    shown = p;
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, HIDE_MS);
  }

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
    {#key shown.redemptionId}
      <button type="button" class="toast" title="Cerrar" on:click={dismiss} on:mouseenter={hold} on:mouseleave={release} on:focus={hold} on:blur={release}>
        <span class="toast__gift" aria-hidden="true">
          <Ico n="gift" size={28} />
          {#each Array(8) as _, i}<span class="spark" style="--i:{i}"></span>{/each}
        </span>
        <span class="toast__body">
          <span class="toast__title">{title}</span>
          {#if shown.note}<span class="toast__note">«{shown.note}»</span>{/if}
          <span class="toast__lines">
            {#each lines as line, i}
              <span class="line line--{line.kind}" style="--d:{i}"><Ico n={ICONS[line.kind]} size={14} /> {line.text}</span>
            {/each}
          </span>
        </span>
      </button>
    {/key}
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: var(--z-toast);
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-3);
    min-width: 260px;
    max-width: 340px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-2xl);
    background: var(--surface);
    box-shadow: 3px 4px 0 var(--line);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    animation: slideIn 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .toast__gift {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--color-sunburst) 30%, var(--surface));
    color: var(--ink);
    animation: wiggle 0.7s ease-in-out 0.35s both;
  }
  .spark {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 1px;
    background: hsl(calc(var(--i) * 45deg) 85% 58%);
    animation: spark 0.9s ease-out 0.5s both;
  }
  .toast__body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .toast__title {
    font-weight: 800;
    font-size: var(--text-body-lg);
  }
  .toast__note {
    margin-top: 2px;
    color: var(--ink-muted);
    font-size: var(--text-caption);
  }
  .toast__lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: var(--space-1);
    font-size: var(--text-label);
    font-weight: 700;
  }
  .line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    animation: lineIn 0.35s ease-out both;
    animation-delay: calc(0.45s + var(--d) * 0.12s);
  }
  .line--coins { color: color-mix(in srgb, var(--reward-coins) 80%, var(--ink)); }
  .line--gems { color: color-mix(in srgb, var(--reward-gems) 80%, var(--ink)); }
  .line--pro { color: var(--reward-pro); }
  .line--chest { color: color-mix(in srgb, var(--reward-chest) 85%, var(--ink)); }
  .line--accessory { color: color-mix(in srgb, var(--reward-accessory) 85%, var(--ink)); }
  @keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes wiggle {
    0%, 100% { transform: rotate(0) scale(1); }
    30% { transform: rotate(-10deg) scale(1.08); }
    60% { transform: rotate(8deg) scale(1.08); }
  }
  @keyframes spark {
    from { opacity: 1; transform: rotate(calc(var(--i) * 45deg)) translateX(0); }
    to { opacity: 0; transform: rotate(calc(var(--i) * 45deg)) translateX(30px) scale(0.4); }
  }
  @keyframes lineIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast, .toast__gift, .line { animation: none; }
    .spark { display: none; }
  }
</style>
