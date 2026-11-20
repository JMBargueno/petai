<script lang="ts">
  /**
   * Ajustes › Sonido (spec 40): interruptor y volumen general, cada tipo de sonido con su
   * interruptor y su volumen, y audio reducido. Al soltar un volumen suena una muestra de ese tipo.
   *
   * Solo pinta: los ajustes llegan por `settings`; los cambios salen por `change` (lo que cambia) y
   * las muestras por `preview` (el id del sonido). Cada app dice qué tipos tiene (`buses`; en el móvil
   * no hay voz de la mascota ni ambiente) y si enseña lo propio del escritorio (`desktop`).
   */
  import { createEventDispatcher } from 'svelte';
  import type { AudioSettings, Bus } from '@pockai/audio';
  import SectionHeader from './SectionHeader.svelte';
  import Slider from './Slider.svelte';
  import Switch from './Switch.svelte';

  export let settings: AudioSettings;
  export let buses: Bus[] = ['pet', 'sfx', 'ui', 'ambient'];
  /** Cómo suena con el panel cerrado o en otras apps (solo el escritorio). */
  export let desktop = false;
  /** La muestra de cada tipo, si la app no lleva la de por defecto (el APK no lleva todos los sonidos). */
  export let previews: Partial<Record<Bus, string>> = {};

  const dispatch = createEventDispatcher<{ change: Partial<AudioSettings>; preview: string }>();

  const TYPES: { bus: Bus; label: string; sub: string; icon: string; preview: string }[] = [
    { bus: 'pet', label: 'Tu Pockai', sub: 'Su voz, comer, dormir, pasos y caricias', icon: 'paw', preview: 'pet.happy.chirp' },
    { bus: 'sfx', label: 'Efectos y juegos', sub: 'Portales, logros, cofres, minijuegos, cocina y combate', icon: 'magic', preview: 'reward.mission' },
    { bus: 'ui', label: 'Interfaz', sub: 'Botones, pestañas, avisos y compras', icon: 'settings', preview: 'ui.confirm' },
    { bus: 'ambient', label: 'Ambiente', sub: 'Salas del hábitat, clima y lugares de las aventuras', icon: 'leaf', preview: 'wx.thunder' },
  ];

  $: s = settings;
  $: off = !s.enabled;
  $: shown = TYPES.filter((t) => buses.includes(t.bus));

  const change = (patch: Partial<AudioSettings>) => dispatch('change', patch);
  const preview = (bus: Bus) => dispatch('preview', previews[bus] ?? TYPES.find((t) => t.bus === bus)!.preview);

  function setBusOn(bus: Bus, on: boolean) {
    change({ busOn: { ...s.busOn, [bus]: on } });
    if (on) preview(bus);
  }
  function setBusVolume(bus: Bus, v: number) {
    change({ buses: { ...s.buses, [bus]: v } });
    preview(bus);
  }
</script>

<div class="ui-stack" role="group" aria-label="Ajustes de sonido">
  <SectionHeader title="Sonido" icon="volume" />
  <div class="ui-list">
    <Switch
      icon={s.enabled ? 'volume' : 'mute'}
      label="Sonido"
      sub="Apágalo para silenciar Pockai por completo"
      checked={s.enabled}
      on:change={(e) => change({ enabled: e.detail })}
    />
    <Slider
      label="Volumen general"
      icon="volume"
      value={s.master}
      disabled={off}
      on:input={() => dispatch('preview', 'ui.slider_tick')}
      on:change={(e) => change({ master: e.detail })}
    />
  </div>

  <SectionHeader title="Tipos de sonido" icon="cards" />
  {#each shown as t (t.bus)}
    <div class="ui-list sound-type">
      <Switch
        icon={t.icon}
        label={t.label}
        sub={t.sub}
        checked={s.busOn[t.bus]}
        disabled={off}
        on:change={(e) => setBusOn(t.bus, e.detail)}
      />
      <Slider
        label="Volumen"
        value={s.buses[t.bus]}
        disabled={off || !s.busOn[t.bus]}
        on:change={(e) => setBusVolume(t.bus, e.detail)}
      />
    </div>
  {/each}

  {#if desktop}
    <SectionHeader title="En el escritorio" icon="monitor" />
    <div class="ui-list">
      <Switch
        icon="paw"
        label="Sonidos de tu Pockai en el escritorio"
        sub="Con el panel cerrado o mientras usas otras apps"
        checked={s.petOnDesktop}
        disabled={off}
        on:change={(e) => change({ petOnDesktop: e.detail })}
      />
      <Switch
        icon="leaf"
        label="Ambiente en el escritorio"
        sub="Lluvia, sala o jardín también con el panel cerrado"
        checked={s.ambientOnDesktop}
        disabled={off}
        on:change={(e) => change({ ambientOnDesktop: e.detail })}
      />
      <Switch
        icon="mute"
        label="Silencio total al usar otras apps"
        sub="Pockai no suena mientras trabajas en otra ventana"
        checked={s.muteWhenUnfocused}
        disabled={off}
        on:change={(e) => change({ muteWhenUnfocused: e.detail })}
      />
    </div>
  {/if}

  <SectionHeader title="Accesibilidad" icon="bell" />
  <div class="ui-list">
    <Switch
      icon="bell"
      label="Audio reducido"
      sub="Solo la interfaz y los avisos importantes"
      checked={s.reduced}
      disabled={off}
      on:change={(e) => change({ reduced: e.detail })}
    />
  </div>
</div>

<style>
  .sound-type {
    gap: var(--space-1);
  }
</style>
