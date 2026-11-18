<script lang="ts">
  /** Ajustes › Aplicación: tema, arranque con Windows y cómo funciona la bandeja. */
  import { onMount } from 'svelte';
  import { isAutostartEnabled, isAutostartSupported, setAutostart } from '../lib/autostart';
  import { setTheme, theme, type ThemeChoice } from '../lib/theme';
  import { Notice, Segmented, SectionHeader, Skeleton, Switch } from './ui';

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

<div class="ui-stack" aria-label="Ajustes de la aplicación">
  <SectionHeader title="Apariencia" icon="sun" />
  <Segmented label="Tema" options={THEME_OPTIONS} value={$theme} on:change={(e) => setTheme(e.detail as ThemeChoice)} />
  <p class="form-hint theme-hint">«Sistema» sigue el modo claro u oscuro de tu equipo.</p>

  <SectionHeader title="Inicio" icon="settings" />

  {#if loading}
    <Skeleton rows={1} height={46} />
  {:else}
    <div class="ui-list">
      <Switch
        icon="settings"
        label="Iniciar Pockai al iniciar Windows"
        sub="Tu pockai aparece solo al encender el ordenador"
        checked={autostart}
        disabled={saving || !supported}
        on:change={(e) => toggle(e.detail)}
      />
    </div>
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
