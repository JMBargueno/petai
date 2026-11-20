<script lang="ts">
  /**
   * Ajustes › Sonido en el escritorio: la vista es `SoundSettingsView`, de `@pockai/ui`, con todos los
   * tipos de sonido y lo propio del escritorio (cómo suena con el panel cerrado o en otras apps).
   */
  import { SoundSettingsView } from '@pockai/ui';
  import { audioSettings, sfx, updateAudioSettings } from '../lib/audio';
</script>

<SoundSettingsView settings={$audioSettings} desktop on:change={(e) => updateAudioSettings(e.detail)} on:preview={(e) => sfx(e.detail)} />
