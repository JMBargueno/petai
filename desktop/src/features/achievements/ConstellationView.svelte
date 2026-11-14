<script lang="ts">
  import type { ConstellationResponse } from './achievements.api';

  /**
   * Constelación visual por categoría (feature 008 / US4). Renderiza un SVG: una estrella por
   * logro (coordenadas normalizadas escaladas a 100x100), coloreada según estado
   * (gris=locked, amarillo=in_progress, brillante=unlocked), y líneas que unen las `connections`.
   * `id` se usa para que `exportPng` pueda localizar el SVG por id.
   */
  export let constellation: ConstellationResponse;
  export let playerId: string = '';
  export let svgId: string = `constellation-${constellation.category}`;

  const SIZE = 100;

  // Map de id -> posición para resolver las conexiones.
  const pos: Record<string, { x: number; y: number }> = {};
  for (const s of constellation.stars) pos[s.id] = { x: s.x * SIZE, y: s.y * SIZE };

  function starColor(status: string): string {
    if (status === 'unlocked') return '#fff7cc'; // brillante
    if (status === 'in_progress') return '#ffd93b'; // amarillo
    return '#5a5f70'; // gris
  }

  function starRadius(tier: string): number {
    return tier === 'legendary' ? 3.2 : tier === 'epic' ? 2.8 : tier === 'rare' ? 2.3 : 1.9;
  }
</script>

<figure class="constellation" aria-label="Constelación {constellation.name}">
  <figcaption class="constellation__title">
    {constellation.name}
    {#if playerId}<span class="constellation__player">· {playerId}</span>{/if}
  </figcaption>

  <svg
    id={svgId}
    class="constellation__svg"
    viewBox={`0 0 ${SIZE} ${SIZE}`}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={`Constelación de ${constellation.name} (${constellation.stars.length} estrellas)`}
  >
    <!-- Conexiones -->
    <g class="constellation__links">
      {#each constellation.connections as [a, b] (a + b)}
        {#if pos[a] && pos[b]}
          <line
            x1={pos[a].x}
            y1={pos[a].y}
            x2={pos[b].x}
            y2={pos[b].y}
            class="constellation__link"
            data-active={pos[a] && pos[b] && true ? 'true' : 'false'}
          />
        {/if}
      {/each}
    </g>

    <!-- Estrellas -->
    <g class="constellation__stars">
      {#each constellation.stars as star (star.id)}
        <g
          class="constellation__star"
          data-id={star.id}
          data-status={star.status}
          transform={`translate(${pos[star.id].x}, ${pos[star.id].y})`}
        >
          <circle
            r={starRadius(star.tier)}
            fill={starColor(star.status)}
            class="constellation__star-dot"
            {data-id}
          />
          {#if star.status === 'unlocked'}
            <circle r={starRadius(star.tier) + 1.6} fill="none" stroke="#fff7cc" stroke-width="0.4" opacity="0.6" />
          {/if}
          <title>{star.name} ({star.status})</title>
        </g>
      {/each}
    </g>
  </svg>
</figure>

<style>
  .constellation {
    margin: 0;
    background: radial-gradient(ellipse at center, #10141f 0%, #0a0d15 100%);
    border-radius: 12px;
    padding: 12px;
    color: #cfd3e0;
    font-family: inherit;
  }
  .constellation__title {
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    color: #e7eaf2;
  }
  .constellation__player {
    font-weight: 400;
    color: #8a90a6;
  }
  .constellation__svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .constellation__link {
    stroke: #2a3040;
    stroke-width: 0.5;
    opacity: 0.7;
  }
  .constellation__star-dot {
    filter: drop-shadow(0 0 2px currentColor);
  }
</style>
