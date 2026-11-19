<script lang="ts">
  /** Ajustes › Aplicación: tema, sonido, arranque con Windows y cómo funciona la bandeja. */
  import { onMount } from 'svelte';
  import type { Bus } from '@pockai/audio';
  import { audioSettings, sfx, updateAudioSettings } from '../lib/audio';
  import { isAutostartEnabled, isAutostartSupported, setAutostart } from '../lib/autostart';
  import { setTheme, theme, type ThemeChoice } from '../lib/theme';
  import { Notice, Segmented, SectionHeader, Skeleton, Slider, Switch } from './ui';

  /** Volúmenes por bus que se enseñan (la música aún no existe). Al soltar suena una muestra. */
  const VOLUME_ROWS: { bus: Bus; label: string; icon: string; preview: string }[] = [
    { bus: 'pet', label: 'Tu Pockai', icon: 'paw', preview: 'pet.happy.chirp' },
    { bus: 'sfx', label: 'Efectos y juegos', icon: 'magic', preview: 'reward.mission' },
    { bus: 'ui', label: 'Interfaz', icon: 'settings', preview: 'ui.confirm' },
    { bus: 'ambient', label: 'Ambiente', icon: 'leaf', preview: 'hab.furniture.wall_clock' },
  ];

  const THEME_OPTIONS = [
    { value: 'system', label: 'Sistema', icon: 'monitor' },
    { value: 'light', label: 'Claro', icon: 'sun' },
    { value: 'dark', label: 'Oscuro', icon: 'moon' },
  ];

  const supported = isAutostartSupported();
  let autostart = false;
  let loading = true;
  let saving = false;
  let notice = '';
  let noticeOk = true;

  function flash(text: string, ok = true) {
    notice = text;
    noticeOk = ok;
    setTimeout(() => (notice = ''), 2500);
  }

  async function refresh() {
    loading = true;
    try {
      autostart = await isAutostartEnabled();
    } catch {
      autostart = false;
    } finally {
      loading = false;
    }
  }

  async function toggle(value: boolean) {
    saving = true;
    try {
      await setAutostart(value);
      autostart = await isAutostartEnabled();
      flash(autostart ? 'Pockai se abrirá al iniciar Windows' : 'Pockai ya no se abrirá al iniciar Windows');
    } catch {
      autostart = !value;
      flash('No se pudo cambiar el inicio automático', false);
    } finally {
      saving = false;
    }
  }

  onMount(refresh);
</script>

<div class="ui-stack" role="group" aria-label="Ajustes de la aplicación">
  <SectionHeader title="Apariencia" icon="sun" />
  <Segmented label="Tema" options={THEME_OPTIONS} value={$theme} on:change={(e) => setTheme(e.detail as ThemeChoice)} />
  <p class="form-hint theme-hint">«Sistema» sigue el modo claro u oscuro de tu equipo.</p>

  <SectionHeader title="Sonido" icon="volume" />
  <div class="ui-list">
    <Switch
      icon={$audioSettings.enabled ? 'volume' : 'mute'}
      label="Sonido"
      sub="Efectos de la interfaz, de tu Pockai y de los juegos"
      checked={$audioSettings.enabled}
      on:change={(e) => updateAudioSettings({ enabled: e.detail })}
    />
    <Slider
      label="Volumen general"
      icon="volume"
      value={$audioSettings.master}
      disabled={!$audioSettings.enabled}
      on:input={() => sfx('ui.slider_tick')}
      on:change={(e) => updateAudioSettings({ master: e.detail })}
    />
    {#each VOLUME_ROWS as row (row.bus)}
      <Slider
        label={row.label}
        icon={row.icon}
        value={$audioSettings.buses[row.bus]}
        disabled={!$audioSettings.enabled}
        on:change={(e) => {
          updateAudioSettings({ buses: { ...$audioSettings.buses, [row.bus]: e.detail } });
          sfx(row.preview);
        }}
      />
    {/each}
    <Switch
      icon="paw"
      label="Sonidos de tu Pockai en el escritorio"
      sub="Con el panel cerrado o mientras usas otras apps"
      checked={$audioSettings.petOnDesktop}
      disabled={!$audioSettings.enabled}
      on:change={(e) => updateAudioSettings({ petOnDesktop: e.detail })}
    />
    <Switch
      icon="leaf"
      label="Ambiente en el escritorio"
      sub="Lluvia, sala o jardín también con el panel cerrado"
      checked={$audioSettings.ambientOnDesktop}
      disabled={!$audioSettings.enabled}
      on:change={(e) => updateAudioSettings({ ambientOnDesktop: e.detail })}
    />
    <Switch
      icon="mute"
      label="Silencio total al usar otras apps"
      sub="Pockai no suena mientras trabajas en otra ventana"
      checked={$audioSettings.muteWhenUnfocused}
      disabled={!$audioSettings.enabled}
      on:change={(e) => updateAudioSettings({ muteWhenUnfocused: e.detail })}
    />
    <Switch
      icon="bell"
      label="Audio reducido"
      sub="Solo la interfaz y los avisos importantes"
      checked={$audioSettings.reduced}
      disabled={!$audioSettings.enabled}
      on:change={(e) => updateAudioSettings({ reduced: e.detail })}
    />
  </div>

  <SectionHeader title="Inicio" icon="settings" />

  {#if loading}
    <Skeleton rows={1} height={46} />
  {:else}
    <div class="ui-list">
      <Switch
        icon="settings"
        label="Iniciar Pockai al iniciar Windows"
        sub="Tu Pockai aparece solo al encender el ordenador"
        checked={autostart}
        disabled={saving || !supported}
        on:change={(e) => toggle(e.detail)}
      />
    </div>
    {#if !supported}<p class="form-hint">Solo disponible en la app instalada (no en la versión de navegador).</p>{/if}
    {#if notice}<Notice tone={noticeOk ? 'ok' : 'error'}>{notice}</Notice>{/if}
  {/if}

  <SectionHeader title="Segundo plano" icon="note" />
  <Notice tone="info">
    Al cerrar la ventana, Pockai sigue en la bandeja del sistema (los iconos junto al reloj). Haz clic en su icono
    para que vuelva; para salir del todo, clic derecho › «Salir de Pockai».
  </Notice>
  <Notice tone="info">
    ¿No ves el icono? Windows lo guarda en la flecha <strong>^</strong> de iconos ocultos: arrástralo desde ahí a
    la barra de tareas para tenerlo siempre a la vista.
  </Notice>
</div>
