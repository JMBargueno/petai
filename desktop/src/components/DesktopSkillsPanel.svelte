<script lang="ts">
  import { DESKTOP_SKILLS, type DesktopSkillDefinition } from '../lib/types/desktopSkills';
  import {
    skillAuthorizations,
    toggleSkillAuthorization,
    syncSkillsFromBackend,
    isSkillUnlocked,
  } from '../lib/stores/desktopSkillsStore';
  import { ShieldCheck, Sparkles, AlertCircle, Info, Lock } from 'lucide-svelte';
  import PomodoroWidget from './PomodoroWidget.svelte';

  export let pet: any = null;

  $: if (pet?.desktopSkills) {
    syncSkillsFromBackend(pet.desktopSkills);
  }

  $: petBonding = pet?.bonding?.level ?? pet?.bondingLevel ?? 0;
  $: petIntelligence = pet?.intelligence ?? 1;

  let activeCategory: 'all' | 'playful' | 'productivity' = 'all';

  $: filteredSkills = DESKTOP_SKILLS.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });
</script>

<div class="skills-panel">
  <div class="header-desc">
    <div class="header-icon">
      <ShieldCheck size={20} class="text-indigo-400" />
    </div>
    <div>
      <h3 class="panel-title">Habilidades y Autorizaciones</h3>
      <p class="panel-subtitle">
        Tu mascota aprende nuevas capacidades según su vínculo e inteligencia. Autoriza cuáles permites que use en tu pantalla.
      </p>
    </div>
  </div>

  <!-- Filtro por categoría -->
  <div class="category-tabs">
    <button
      class="tab-btn"
      class:active={activeCategory === 'all'}
      on:click={() => (activeCategory = 'all')}
    >
      Todas
    </button>
    <button
      class="tab-btn"
      class:active={activeCategory === 'playful'}
      on:click={() => (activeCategory = 'playful')}
    >
      🎮 Pantalla & Juego
    </button>
    <button
      class="tab-btn"
      class:active={activeCategory === 'productivity'}
      on:click={() => (activeCategory = 'productivity')}
    >
      💼 Productividad & IA
    </button>
  </div>

  <!-- Lista de Habilidades -->
  <div class="skills-list">
    {#each filteredSkills as skill (skill.id)}
      {@const unlocked = isSkillUnlocked(skill, petBonding, petIntelligence)}
      {@const enabled = !!$skillAuthorizations[skill.id]}

      <div
        class="skill-card"
        class:locked={!unlocked}
        class:enabled={unlocked && enabled}
      >
        <div class="skill-info">
          <div class="skill-title-row">
            <span class="skill-name">{skill.name}</span>
            {#if !unlocked}
              <span class="badge locked-badge">
                <Lock size={12} /> Bloqueada
              </span>
            {:else if enabled}
              <span class="badge active-badge">
                <Sparkles size={12} /> Activa
              </span>
            {:else}
              <span class="badge inactive-badge">Pausada</span>
            {/if}
          </div>

          <p class="skill-desc">{skill.description}</p>

          {#if !unlocked}
            <div class="requirement-box">
              <AlertCircle size={14} />
              <span>
                Desbloqueo: Requiere
                {#if skill.requiredBonding > 0}
                  Vínculo Nivel {skill.requiredBonding} (tienes {petBonding})
                {/if}
                {#if skill.requiredBonding > 0 && skill.requiredIntelligence > 1} y {/if}
                {#if skill.requiredIntelligence > 1}
                  IA Nivel {skill.requiredIntelligence} (tienes {petIntelligence})
                {/if}
              </span>
            </div>
          {/if}

          {#if skill.permissionNotice}
            <div class="privacy-note">
              <Info size={13} />
              <span>{skill.permissionNotice}</span>
            </div>
          {/if}

          {#if skill.id === 'pomodoro_companion' && unlocked && enabled}
            <div class="embedded-widget">
              <PomodoroWidget />
            </div>
          {/if}
        </div>

        <div class="skill-action">
          <label class="switch" class:disabled={!unlocked} title={unlocked ? (enabled ? 'Desactivar' : 'Activar') : 'Bloqueada'}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!unlocked}
              on:change={() => toggleSkillAuthorization(skill.id, pet?.id)}
            />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .skills-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    color: #e2e8f0;
  }

  .header-desc {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(99, 102, 241, 0.15);
    border-radius: 8px;
    padding: 6px;
    color: #818cf8;
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
    color: #f8fafc;
  }

  .panel-subtitle {
    font-size: 12px;
    color: #94a3b8;
    margin: 3px 0 0;
    line-height: 1.4;
  }

  .category-tabs {
    display: flex;
    gap: 6px;
    background: rgba(15, 23, 42, 0.6);
    padding: 4px;
    border-radius: 8px;
  }

  .tab-btn {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn.active {
    background: rgba(99, 102, 241, 0.25);
    color: #c7d2fe;
    font-weight: 600;
  }

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .skill-card {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 14px;
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    transition: all 0.2s ease;
  }

  .skill-card.enabled {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(30, 41, 59, 0.7);
  }

  .skill-card.locked {
    opacity: 0.6;
    background: rgba(15, 23, 42, 0.4);
  }

  .skill-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skill-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .skill-name {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .skill-desc {
    font-size: 12px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 999px;
  }

  .active-badge {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .inactive-badge {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }

  .locked-badge {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .requirement-box {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
    padding: 4px 8px;
    border-radius: 6px;
  }

  .privacy-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #64748b;
    font-style: italic;
  }

  .skill-action {
    display: flex;
    align-items: center;
    padding-top: 2px;
  }

  /* Switch Toggle */
  .switch {
    position: relative;
    display: inline-block;
    width: 38px;
    height: 22px;
  }

  .switch.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #334155;
    transition: 0.2s;
    border-radius: 22px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background-color: #ffffff;
    transition: 0.2s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: #6366f1;
  }

  input:checked + .slider:before {
    transform: translateX(16px);
  }

  .embedded-widget {
    margin-top: 10px;
    width: 100%;
  }
</style>
