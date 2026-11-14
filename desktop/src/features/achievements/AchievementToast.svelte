<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { AchievementUnlockedPayload } from './achievements.api';

  /**
   * Toast de desbloqueo de logro (feature 008 / US6). Al recibir `achievement:unlocked` (emitido
   * por el backend vía WebSocket) muestra una tarjeta con el nombre, tier y recompensa, con una
   * animación de aparición que se autodisipa tras unos segundos.
   */
  export let payload: AchievementUnlockedPayload | null = null;
  export let visible: boolean = false;
  export let onDismiss: () => void = () => {};

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function show() {
    visible = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible = false;
      onDismiss();
    }, 4500);
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

{#if visible && payload}
  <div class="toast" role="alert" on:click={dismiss}>
    <div class="toast__badge" data-tier={payload.tier}>🏆</div>
    <div class="toast__body">
      <div class="toast__title">¡Logro desbloqueado!</div>
      <div class="toast__name">{payload.name}</div>
      <div class="toast__reward">
        {#if payload.reward.coins > 0}<span>+{payload.reward.coins} 🪙</span>{/if}
        {#if payload.reward.gems > 0}<span>+{payload.reward.gems} 💎</span>{/if}
        {#if payload.reward.xp > 0}<span>+{payload.reward.xp} ✨</span>{/if}
        {#if payload.reward.itemId}<span class="toast__item">+ Item exclusivo</span>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 12px;
    background: linear-gradient(135deg, #1c2333 0%, #12151f 100%);
    border: 1px solid #3a4a70;
    border-radius: 12px;
    padding: 12px 18px;
    min-width: 240px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    animation: slideIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3);
    color: #e7eaf2;
    font-family: inherit;
  }
  .toast__badge {
    font-size: 2rem;
    filter: drop-shadow(0 0 6px #ffd93b);
  }
  .toast__badge[data-tier='legendary'] { filter: drop-shadow(0 0 10px #ff9d3b); }
  .toast__title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #8a90a6; }
  .toast__name { font-weight: 700; font-size: 1rem; margin-top: 2px; }
  .toast__reward { display: flex; gap: 8px; margin-top: 6px; font-size: 0.85rem; }
  .toast__item { color: #b98cff; }
  @keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>
