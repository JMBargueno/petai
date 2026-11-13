<script lang="ts">
  import type { EnvironmentalStatus, FestivalInfo, WeatherInfo, TimeOfDay, ActivityInfo } from '../lib/environmental';

  /**
   * Overlay ambiental (feature 005): dibuja un accesorio sobre la mascota según el clima real
   * (paraguas si llueve, gorro si hace frío/nieva) y la festividad activa (sombrerito, corona…),
   * más una etiqueta de micro-momento. Recibe el `EnvironmentalStatus` completo y deriva lo que
   * necesita. `accessory` puede forzarse (p. ej. desde una animación).
   */
  export let environmental: EnvironmentalStatus | null = null;
  export let accessory: string | null = null; // clave de accesorio forzada

  const ACCESSORY_EMOJI: Record<string, string> = {
    paraguas: '☔',
    gorro: '🧣',
    bufanda: '🧣',
    sombrero: '👒',
    sombrerito: '🎅',
    corona: '👑',
    calavera: '💀',
    calabaza: '🎃',
    corazon: '💖',
    corazoncito: '💗',
    confeti: '🎉',
    hojas: '🌿',
  };

  const WEATHER_ACCESSORY: Record<string, string> = {
    rain: 'paraguas',
    snow: 'gorro',
    cold: 'gorro',
    cloud: 'paraguas',
  };

  const TIME_LABEL: Record<string, string> = {
    late_night: 'Es de madrugada… 😪',
    morning: 'Buenos días ☀️',
    afternoon: '¡Buena tarde! 😊',
    evening: 'Buenas noches 🌆',
    night: 'Qué noche tan tranquila 🌙',
  };

  function resolveAccessory(): string | null {
    if (accessory) return accessory;
    const fest = environmental?.festival as FestivalInfo | undefined;
    if (fest?.accessory) return fest.accessory;
    const cond = (environmental?.weather as WeatherInfo | undefined)?.condition;
    if (cond) return WEATHER_ACCESSORY[cond] ?? null;
    return null;
  }

  $: acc = resolveAccessory();
  $: accEmoji = acc ? ACCESSORY_EMOJI[acc] ?? '🎀' : null;
  $: timeLabel = environmental ? TIME_LABEL[environmental.timeOfDay as TimeOfDay] ?? '' : '';
  $: festMessage = environmental?.festival?.message ?? '';
  $: isSolo = (environmental?.activity as ActivityInfo | undefined)?.mode === 'solo';
  $: soloLabel = isSolo ? 'Estás un poco aburrido aquí… 🥺' : '';

  function caption(): string {
    if (festMessage) return festMessage;
    if (soloLabel) return soloLabel;
    return timeLabel;
  }
</script>

{#if accEmoji}
  <div class="env-overlay" aria-hidden="true">
    <span class="env-accessory">{accEmoji}</span>
  </div>
{/if}

{#if caption()}
  <div class="env-caption">{caption()}</div>
{/if}

<style>
  .env-overlay {
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    pointer-events: none;
  }

  .env-accessory {
    display: inline-block;
    font-size: 42px;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
    animation: bob 3.2s ease-in-out infinite;
  }

  .env-caption {
    position: absolute;
    top: -52px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 29;
    pointer-events: none;
    max-width: 260px;
    padding: 6px 12px;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #e0f2fe;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    backdrop-filter: blur(6px);
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
</style>
