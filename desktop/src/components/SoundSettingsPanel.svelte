<script lang="ts">
  /**
   * Ajustes › Sonido (spec 40): interruptor y volumen general, cada tipo de sonido con su
   * interruptor y su volumen, cómo suena fuera del panel y audio reducido. Al soltar un volumen
   * suena una muestra de ese tipo.
   */
  import type { Bus } from '@pockai/audio';
  import { audioSettings, sfx, updateAudioSettings } from '../lib/audio';
  import { SectionHeader, Slider, Switch } from './ui';

  const TYPES: { bus: Bus; label: string; sub: string; icon: string; preview: string }[] = [
    { bus: 'pet', label: 'Tu Pockai', sub: 'Su voz, comer, dormir, pasos y caricias', icon: 'paw', preview: 'pet.happy.chirp' },
    { bus: 'sfx', label: 'Efectos y juegos', sub: 'Portales, logros, cofres, minijuegos, cocina y combate', icon: 'magic', preview: 'reward.mission' },
    { bus: 'ui', label: 'Interfaz', sub: 'Botones, pestañas, avisos y compras', icon: 'settings', preview: 'ui.confirm' },
    { bus: 'ambient', label: 'Ambiente', sub: 'Salas del hábitat, clima y lugares de las aventuras', icon: 'leaf', preview: 'wx.thunder' },
  ];

  $: s = $audioSettings;
  $: off = !s.enabled;

  function setBusOn(bus: Bus, on: boolean) {
    updateAudioSettings({ busOn: { ...s.busOn, [bus]: on } });
    if (on) sfx(TYPES.find((t) => t.bus === bus)!.preview);
  }
  function setBusVolume(bus: Bus, v: number) {
    updateAudioSettings({ buses: { ...s.buses, [bus]: v } });
    sfx(TYPES.find((t) => t.bus === bus)!.preview);
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
      on:change={(e) => updateAudioSettings({ enabled: e.detail })}
    />
    <Slider
      label="Volumen general"
      icon="volume"
      value={s.master}
      disabled={off}
      on:input={() => sfx('ui.slider_tick')}
      on:change={(e) => updateAudioSettings({ master: e.detail })}
    />
  </div>

  <SectionHeader title="Tipos de sonido" icon="cards" />
  {#each TYPES as t (t.bus)}
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

  <SectionHeader title="En el escritorio" icon="monitor" />
  <div class="ui-list">
    <Switch
      icon="paw"
      label="Sonidos de tu Pockai en el escritorio"
      sub="Con el panel cerrado o mientras usas otras apps"
      checked={s.petOnDesktop}
      disabled={off}
      on:change={(e) => updateAudioSettings({ petOnDesktop: e.detail })}
    />
    <Switch
      icon="leaf"
      label="Ambiente en el escritorio"
      sub="Lluvia, sala o jardín también con el panel cerrado"
      checked={s.ambientOnDesktop}
      disabled={off}
      on:change={(e) => updateAudioSettings({ ambientOnDesktop: e.detail })}
    />
    <Switch
      icon="mute"
      label="Silencio total al usar otras apps"
      sub="Pockai no suena mientras trabajas en otra ventana"
      checked={s.muteWhenUnfocused}
      disabled={off}
      on:change={(e) => updateAudioSettings({ muteWhenUnfocused: e.detail })}
    />
  </div>

  <SectionHeader title="Accesibilidad" icon="bell" />
  <div class="ui-list">
    <Switch
      icon="bell"
      label="Audio reducido"
      sub="Solo la interfaz y los avisos importantes"
      checked={s.reduced}
      disabled={off}
      on:change={(e) => updateAudioSettings({ reduced: e.detail })}
    />
  </div>
</div>

<style>
  .sound-type {
    gap: var(--space-1);
  }
</style>
