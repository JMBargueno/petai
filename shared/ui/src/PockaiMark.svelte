<script lang="ts">
  /** Icono de marca de Pockai (el mismo que el icono de la app): círculo amarillo con el huevo. */
  export let size = 28;
  export let tilt = true;
</script>

<svg
  class="pockai-mark"
  class:tilt
  width={size}
  height={size}
  viewBox="0 0 64 64"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
>
  <circle cx="32" cy="32" r="30" fill="#ffd731" stroke="#000" stroke-width="3" />
  <path d="M32 12c-9 0-16 13-16 24a16 16 0 0 0 32 0c0-11-7-24-16-24z" fill="#fff" stroke="#000" stroke-width="3" />
  <circle cx="26" cy="36" r="3" />
  <circle cx="38" cy="36" r="3" />
</svg>

<style>
  .pockai-mark {
    display: block;
    flex-shrink: 0;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.18));
    transition: rotate var(--dur-2) ease, scale var(--dur-2) ease;
  }
  .pockai-mark.tilt {
    rotate: -6deg;
  }
  :global(:hover) > .pockai-mark.tilt {
    rotate: 6deg;
    scale: 1.06;
  }
  @media (prefers-reduced-motion: reduce) {
    .pockai-mark {
      transition: none;
    }
    :global(:hover) > .pockai-mark.tilt {
      rotate: -6deg;
      scale: 1;
    }
  }
</style>
