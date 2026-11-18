<script lang="ts">
  /** Avatar de jugador para Social (amigos, clan, visitas): iniciales sobre un color estable
   *  derivado del nombre, con punto de presencia opcional en la esquina. */
  export let name = '';
  export let size = 36;
  export let presence: 'online' | 'offline' | 'unknown' | null = null;
  export let selected = false;

  const PALETTE = [
    'var(--color-sunburst)',
    'var(--color-mint-pop)',
    'var(--color-electric-blue)',
    'var(--color-lavender)',
    'var(--color-ember)',
  ];

  function initials(n: string): string {
    const parts = n.trim().split(/[\s._@-]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function colorFor(n: string): string {
    let h = 0;
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  $: label = initials(name);
  $: bg = colorFor(name);
</script>

<span
  class="avatar"
  class:selected
  style="--size: {size}px; --bg: {bg}; font-size: {Math.round(size * 0.3)}px"
  aria-hidden="true"
>
  {label}
  {#if presence}<i class="presence {presence}"></i>{/if}
</span>

<style>
  .avatar {
    position: relative;
    flex-shrink: 0;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--bg);
    color: var(--on-color);
    border: 1.5px solid var(--on-color);
    font-family: var(--font-display);
    line-height: 1;
    letter-spacing: 0.02em;
    transition: box-shadow var(--dur-1), translate var(--dur-1);
  }
  .avatar.selected {
    box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--theme-social);
  }
  .presence {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 30%;
    height: 30%;
    min-width: 9px;
    min-height: 9px;
    border-radius: 50%;
    border: 2px solid var(--surface);
    background: var(--ink-muted);
  }
  .presence.online {
    background: var(--theme-social);
  }
  .presence.unknown {
    opacity: 0.5;
  }
</style>
