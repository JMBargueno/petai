<script lang="ts">
  import { DESKTOP_SKILLS, type DesktopSkillDefinition } from '../lib/types/desktopSkills';
  import {
    skillAuthorizations,
    toggleSkillAuthorization,
    skillSyncFailed,
    syncSkillsFromBackend,
    isSkillUnlocked,
    ownedFurniture,
    getPetBonding,
    getPetIntelligenceLevel,
    getPetIntelligenceTierName,
    getPetIntelligenceRequiredPoints,
  } from '../lib/stores/desktopSkillsStore';
  import Ico from './Ico.svelte';
  import { Badge, Button, FeatureHeader, Notice, Segmented } from './ui';
  import PomodoroWidget from './PomodoroWidget.svelte';
  import MixerWidget from './MixerWidget.svelte';
  import {
    DEFAULT_SUMMON_SHORTCUT,
    SUMMON_SKILL_ID,
    captureShortcut,
    changeSummonShortcut,
    formatShortcut,
    summonShortcut,
  } from '../lib/summonShortcut';

  // Ajuste del atajo de «Invocación rápida» (engranaje de su tarjeta)
  let shortcutOpen = false;
  let shortcutDraft = $summonShortcut;
  let recording = false;
  let recordingPreview = '';
  let shortcutErr = '';
  let shortcutMsg = '';
  let shortcutBusy = false;

  function toggleShortcutConfig() {
    shortcutOpen = !shortcutOpen;
    shortcutDraft = $summonShortcut;
    recording = false;
    shortcutErr = '';
    shortcutMsg = '';
  }

  function startRecording() {
    recording = true;
    recordingPreview = '';
    shortcutErr = '';
    shortcutMsg = '';
  }

  function onCaptureKey(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      recording = false;
      return;
    }
    const r = captureShortcut(e);
    if (r.kind === 'pending') {
      recordingPreview = r.preview;
    } else if (r.kind === 'invalid') {
      shortcutErr = r.reason;
    } else {
      shortcutDraft = r.accelerator;
      shortcutErr = '';
      recording = false;
    }
  }

  async function saveShortcut() {
    shortcutBusy = true;
    shortcutErr = '';
    shortcutMsg = '';
    try {
      await changeSummonShortcut(shortcutDraft);
      shortcutMsg = 'Atajo guardado';
    } catch (e: any) {
      shortcutErr = e?.message || 'No se pudo guardar el atajo';
    } finally {
      shortcutBusy = false;
    }
  }

  export let pet: any = null;

  $: if (pet?.desktopSkills) {
    syncSkillsFromBackend(pet.desktopSkills);
  }

  $: petBonding = getPetBonding(pet);
  $: petIntelligencePoints = typeof pet?.intelligence === 'number' ? pet.intelligence : 0;
  $: petIntelligenceLevel = getPetIntelligenceLevel(petIntelligencePoints);

  let activeCategory: 'all' | 'playful' | 'productivity' = 'all';

  $: filteredSkills = DESKTOP_SKILLS.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });
</script>

<div class="ui-stack">
  <FeatureHeader
    icon="shield"
    title="Habilidades"
    sub="Tu mascota aprende nuevas capacidades según su vínculo e inteligencia. Autoriza cuáles permites que use en tu pantalla."
  />
  {#if $skillSyncFailed}
    <Notice tone="warning">El cambio se ha guardado en este equipo, pero no se pudo enviar al servidor. Se reintentará la próxima vez que cambies una habilidad.</Notice>
  {/if}

  <Segmented
    bind:value={activeCategory}
    label="Categoría"
    options={[
      { value: 'all', label: 'Todas' },
      { value: 'playful', label: 'Pantalla y juego', icon: 'gamepad' },
      { value: 'productivity', label: 'Productividad', icon: 'brain' },
    ]}
  />

  <div class="ui-list">
    {#each filteredSkills as skill (skill.id)}
      {@const unlocked = isSkillUnlocked(skill, petBonding, petIntelligencePoints, $ownedFurniture)}
      {@const furnMet = !skill.requiredFurniture || $ownedFurniture.includes(skill.requiredFurniture.id)}
      {@const enabled = !!$skillAuthorizations[skill.id]}
      {@const bondMet = petBonding >= skill.requiredBonding}
      {@const reqTierPoints = getPetIntelligenceRequiredPoints(skill.requiredIntelligence)}
      {@const reqTierName = getPetIntelligenceTierName(skill.requiredIntelligence)}
      {@const intMet = petIntelligenceLevel >= skill.requiredIntelligence}

      <div class="ui-card ui-card--sm skill" class:locked={!unlocked} class:enabled={unlocked && enabled}>
        <div class="skill-top">
          <div class="skill-title">
            <span class="ui-card__title">{skill.name}</span>
            {#if !unlocked}
              <Badge size="sm" icon="lock">Bloqueada</Badge>
            {:else if enabled}
              <Badge size="sm" tone="success" icon="xp">Activa</Badge>
            {:else}
              <Badge size="sm" tone="neutral">Pausada</Badge>
            {/if}
          </div>
          <div class="skill-action">
            {#if skill.id === SUMMON_SKILL_ID && unlocked}
              <Button
                variant={shortcutOpen ? 'ink' : 'ghost'}
                size="sm"
                iconOnly
                icon="settings"
                label="Configurar atajo de teclado"
                class="ui-ibtn"
                on:click={toggleShortcutConfig}
              />
            {/if}
            <button
              type="button"
              class="toggle"
              role="switch"
              aria-checked={unlocked && enabled}
              aria-label={(enabled ? 'Desactivar ' : 'Activar ') + skill.name}
              title={unlocked ? (enabled ? 'Desactivar' : 'Activar') : 'Bloqueada'}
              disabled={!unlocked}
              on:click={() => toggleSkillAuthorization(skill.id, pet?.id)}
            >
              <span class="ui-switch__track"><i></i></span>
            </button>
          </div>
        </div>

        <p class="ui-card__hint">{skill.description}</p>

        {#if !unlocked}
          <div class="reqs">
            <span class="label-caps muted">Requisitos</span>
            {#if skill.requiredBonding > 0}
              <Badge size="sm" tone={bondMet ? 'success' : 'warning'} icon={bondMet ? 'check' : 'lock'}>
                Vínculo {skill.requiredBonding} · {petBonding}/{skill.requiredBonding}
              </Badge>
            {/if}
            {#if skill.requiredIntelligence > 1}
              <Badge size="sm" tone={intMet ? 'success' : 'warning'} icon={intMet ? 'check' : 'lock'}>
                IA {reqTierName} · {petIntelligencePoints}/{reqTierPoints}
              </Badge>
            {/if}
            {#if skill.requiredFurniture}
              <Badge size="sm" tone={furnMet ? 'success' : 'warning'} icon={furnMet ? 'check' : 'lock'}>
                Compra el {skill.requiredFurniture.name} en el hábitat
              </Badge>
            {/if}
          </div>
        {:else}
          <p class="met"><Ico n="check" size={12} />
            {#if skill.requiredBonding > 0 && skill.requiredIntelligence > 1}
              Vínculo {skill.requiredBonding}+ pts · IA {reqTierName}
            {:else if skill.requiredBonding > 0}
              Vínculo {skill.requiredBonding}+ pts
            {:else if skill.requiredIntelligence > 1}
              IA {reqTierName} ({reqTierPoints}+ pts)
            {:else if skill.requiredFurniture}
              {skill.requiredFurniture.name} en tu hábitat
            {:else}
              Habilidad básica disponible
            {/if}
          </p>
        {/if}

        {#if skill.permissionNotice}
          <Notice tone="info" icon="info">{skill.permissionNotice}</Notice>
        {/if}

        {#if skill.id === SUMMON_SKILL_ID && unlocked}
          <p class="met"><Ico n="tool" size={12} /> Atajo: <kbd>{formatShortcut($summonShortcut)}</kbd></p>
          {#if shortcutOpen}
            <div class="shortcut" data-testid="summon-shortcut-config">
              <span class="form-label">Atajo de teclado global</span>
              <button
                type="button"
                class="input shortcut-capture"
                class:recording
                on:click={startRecording}
                on:keydown={onCaptureKey}
                on:blur={() => (recording = false)}
              >
                {#if recording}
                  {recordingPreview ? formatShortcut(recordingPreview) + ' + …' : 'Pulsa la combinación… (Esc cancela)'}
                {:else}
                  {formatShortcut(shortcutDraft)}
                {/if}
              </button>
              <span class="form-hint">Haz clic y pulsa la nueva combinación (con Ctrl, Alt o Win).</span>
              {#if shortcutErr}<Notice tone="error">{shortcutErr}</Notice>{/if}
              {#if shortcutMsg}<Notice tone="ok">{shortcutMsg}</Notice>{/if}
              <div class="row">
                <Button variant="primary" size="sm" disabled={shortcutBusy || recording || shortcutDraft === $summonShortcut} on:click={saveShortcut}>
                  Guardar
                </Button>
                <Button
                  size="sm"
                  disabled={shortcutBusy || shortcutDraft === DEFAULT_SUMMON_SHORTCUT}
                  on:click={() => {
                    shortcutDraft = DEFAULT_SUMMON_SHORTCUT;
                    recording = false;
                  }}
                >
                  Restablecer
                </Button>
              </div>
            </div>
          {/if}
        {/if}

        {#if skill.id === 'pomodoro_companion' && unlocked && enabled}
          <PomodoroWidget />
        {/if}
        {#if skill.id === 'ambient_mixer' && unlocked && enabled}
          <MixerWidget />
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .skill.locked {
    border-style: dashed;
    border-color: var(--line-soft);
    box-shadow: none;
    background: color-mix(in srgb, var(--surface-2) 60%, var(--surface));
  }
  .skill.enabled {
    border-color: var(--line);
    box-shadow: var(--shadow-pop);
  }
  .skill-top {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .skill-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }
  .skill-action {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }
  .toggle {
    min-width: var(--hit-min);
    min-height: var(--control-h-icon);
    display: grid;
    place-items: center;
    padding: var(--space-1);
    border: none;
    background: none;
    cursor: pointer;
  }
  .toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .toggle[aria-checked='true'] .ui-switch__track {
    background: var(--success);
  }
  .toggle[aria-checked='true'] .ui-switch__track i {
    translate: 16px 0;
  }
  .reqs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .reqs .label-caps {
    font-size: var(--text-caption);
    margin-right: 2px;
  }
  .met {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    font-size: var(--text-caption);
    color: var(--success-ink);
  }
  kbd {
    padding: 1px var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--text-caption);
    font-weight: 700;
  }
  .shortcut {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
  }
  .shortcut-capture {
    font-weight: 700;
    text-align: center;
    cursor: pointer;
  }
  .shortcut-capture.recording {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
</style>
