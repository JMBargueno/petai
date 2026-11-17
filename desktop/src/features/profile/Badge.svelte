<script lang="ts">
  /**
   * Insignia de un logro: marco SVG cuya forma y color dependen del tier (común = círculo,
   * rara = hexágono, épica = escudo, legendaria = estrella) con el icono lucide del logro dentro.
   * `locked` la pinta en gris (logro aún no conseguido).
   */
  import { badgeIcon } from '../../lib/badge-icons';

  export let icon: string = 'star';
  export let tier: string = 'common';
  export let size = 56;
  export let locked = false;
  /** Texto accesible (nombre del logro). */
  export let label = '';

  const SHAPES: Record<string, string> = {
    common: 'M50 6 A44 44 0 1 1 49.99 6 Z',
    rare: 'M50 5 L89 27.5 L89 72.5 L50 95 L11 72.5 L11 27.5 Z',
    epic: 'M50 5 L88 18 L88 50 C88 72 71 87 50 95 C29 87 12 72 12 50 L12 18 Z',
    legendary: star(12, 46, 37),
  };

  function star(points: number, outer: number, inner: number): string {
    const pts: string[] = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI * i) / points - Math.PI / 2;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join(' L')} Z`;
  }

  $: shape = SHAPES[tier] ?? SHAPES.common;
  $: Cmp = badgeIcon(icon);
  $: iconSize = Math.round(size * (tier === 'legendary' ? 0.38 : 0.42));
</script>

<span
  class="badge tier-{tier}"
  class:locked
  style="--size: {size}px"
  role="img"
  aria-label={label ? `${label}${locked ? ' (bloqueada)' : ''}` : undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
    <path class="shadow" d={shape} transform="translate(3 4)" />
    <path class="frame" d={shape} />
    <path class="shine" d={shape} />
  </svg>
  <span class="glyph"><svelte:component this={Cmp} size={iconSize} strokeWidth={2.25} /></span>
</span>

<style>
  .badge {
    --tier: var(--rarity-common);
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    flex-shrink: 0;
  }
  .tier-rare { --tier: var(--rarity-rare); }
  .tier-epic { --tier: var(--rarity-super-rare); }
  .tier-legendary { --tier: var(--rarity-legendary); }

  svg {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .shadow { fill: var(--color-carbon); }
  .frame {
    fill: var(--tier);
    stroke: var(--color-carbon);
    stroke-width: 4;
    stroke-linejoin: round;
  }
  /* Brillo suave en la mitad superior */
  .shine {
    fill: color-mix(in srgb, white 22%, transparent);
    clip-path: inset(0 0 55% 0);
    pointer-events: none;
  }
  .glyph {
    position: relative;
    display: inline-flex;
    color: var(--color-carbon);
  }
  .tier-legendary .glyph { margin-top: 1px; }

  .locked .frame {
    fill: var(--surface-2);
    stroke: var(--line);
  }
  .locked .shadow { fill: var(--line-soft); }
  .locked .shine { display: none; }
  .locked .glyph { color: var(--ink-muted); opacity: 0.55; }
</style>
