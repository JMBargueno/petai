<script lang="ts">
  import type { EnvironmentalStatus, FestivalInfo, WeatherInfo, TimeOfDay, ActivityInfo } from '../lib/environmental';
  import { speak } from '../lib/speech-queue';

  /**
   * Overlay ambiental (feature 005): dibuja un accesorio sobre la mascota según el clima real
   * (paraguas si llueve, gorro si hace frío/nieva) y la festividad activa (sombrerito, corona…),
   * más una etiqueta de micro-momento. Recibe el `EnvironmentalStatus` completo y deriva lo que
   * necesita. `accessory` puede forzarse (p. ej. desde una animación).
   */
  export let environmental: EnvironmentalStatus | null = null;
  export let accessory: string | null = null; // clave de accesorio forzada
  /**
   * Qué parte gestionar: el accesorio va dentro del cuerpo de la mascota (gira con ella); el texto
   * ambiental no se pinta aquí, se dice por la cola de habla (ver `caption` abajo).
   */
  export let part: 'all' | 'accessory' | 'caption' = 'all';
  /** La lluvia o la nieve ya se pintan como efecto (@pockai/scene/effects, clima): sin emoji para ellas. */
  export let weatherFx = false;

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
    if (weatherFx && (cond === 'rain' || cond === 'snow')) return null;
    if (cond) return WEATHER_ACCESSORY[cond] ?? null;
    return null;
  }

  $: acc = resolveAccessory();
  $: accEmoji = acc ? ACCESSORY_EMOJI[acc] ?? '🎀' : null;
  $: timeLabel = environmental ? TIME_LABEL[environmental.timeOfDay as TimeOfDay] ?? '' : '';
  $: festMessage = environmental?.festival?.message ?? '';
  $: isSolo = (environmental?.activity as ActivityInfo | undefined)?.mode === 'solo';
  $: soloLabel = isSolo ? 'Estás un poco aburrido aquí… 🥺' : '';

  $: caption = festMessage || soloLabel || timeLabel;

  // El texto ambiental se dice una vez, por la cola de habla, cuando cambia; no es un bocadillo fijo.
  let lastSaid = '';
  $: if (part !== 'accessory' && caption && caption !== lastSaid) {
    lastSaid = caption;
    speak(caption, { key: 'env-caption', durationMs: 4000, maxWaitMs: 60_000 });
  }
</script>

{#if accEmoji && part !== 'caption'}
  <div class="env-overlay" aria-hidden="true">
    <span class="env-accessory">{accEmoji}</span>
  </div>
{/if}

<style>
  .env-overlay {
    position: absolute;
    top: -18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-overlay);
    pointer-events: none;
  }

  .env-accessory {
    display: inline-block;
    font-size: 42px;
    line-height: 1;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
    animation: bob 3.2s ease-in-out infinite;
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
