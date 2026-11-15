<script lang="ts">
  import Ico from './Ico.svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type TrainingElement, type TrainingFloor, type TrainingSubmit, type TrainingBuff } from '../lib/api';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  const ELEMENTS: { id: TrainingElement; icon: string; label: string }[] = [
    { id: 'fire', icon: '🔥', label: 'Fuego' },
    { id: 'water', icon: '💧', label: 'Agua' },
    { id: 'plant', icon: '🌿', label: 'Planta' },
    { id: 'electric', icon: '⚡', label: 'Eléctrico' },
    { id: 'shadow', icon: '🌑', label: 'Sombra' },
    { id: 'light', icon: '☀️', label: 'Luz' },
  ];
  const elIcon = (e: string) => ELEMENTS.find((x) => x.id === e)?.icon ?? '❔';
  const elLabel = (e: string) => ELEMENTS.find((x) => x.id === e)?.label ?? e;

  /** Pisos de la mazmorra; `null` si se retoma una sesión iniciada en otro momento. */
  let floors: TrainingFloor[] | null = null;
  let active = false;
  let hearts = 3;
  let currentFloor = 0;
  /** Elemento real de cada piso ya jugado (se descubre al enviar). */
  let revealed: Record<number, TrainingElement> = {};
  let prediction: TrainingElement | '' = '';
  let last: TrainingSubmit | null = null;
  let finalMsg = '';
  let buff: TrainingBuff | null = null;
  let error = '';
  let busy = false;

  const TOTAL_FLOORS = 5;
  $: isLastFloor = currentFloor === TOTAL_FLOORS - 1;

  async function loadBuff() {
    try {
      buff = await api.trainingActiveBuff(pet?.id);
    } catch {
      buff = null;
    }
  }

  async function start() {
    if (!pet) return;
    busy = true;
    error = '';
    finalMsg = '';
    last = null;
    try {
      const res = await api.trainingStart(pet.id);
      floors = res.floors;
      hearts = res.hearts;
      currentFloor = res.currentFloor;
      revealed = {};
      prediction = '';
      active = true;
      dispatch('refreshPet');
    } catch (e: any) {
      if (/sesión de entrenamiento activa/i.test(e.message ?? '')) {
        // Hay una sesión a medias: se puede seguir eligiendo, aunque sin datos de los pisos.
        floors = null;
        active = true;
        error = 'Tienes un entrenamiento a medias: continúa donde lo dejaste.';
      } else {
        error = e.message;
      }
    } finally {
      busy = false;
    }
  }

  async function pick(element: TrainingElement) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    try {
      const res = await api.trainingSubmit(pet.id, element, isLastFloor && prediction ? prediction : undefined);
      last = res;
      revealed = { ...revealed, [res.floor]: res.enemyElement };
      hearts = res.hearts;
      currentFloor = res.currentFloor;
      if (res.status !== 'active') {
        active = false;
        finalMsg =
          res.status === 'completed'
            ? `¡Mazmorra superada! +${res.xp ?? 0} XP, +${res.coins ?? 0} monedas` +
              (res.buff ? ` · buff ×${(1 + res.buff.multiplier).toFixed(2)} durante 24 h` : '') +
              (res.predictionBonus ? ' · ¡predicción acertada!' : '')
            : `Te has quedado sin corazones en el piso ${res.floor + 1}.` +
              (res.xp ? ` +${res.xp} XP, +${res.coins ?? 0} monedas` : '');
        await loadBuff();
        dispatch('refreshPet');
        dispatch('refreshUser');
      }
    } catch (e: any) {
      error = e.message;
      if (/no hay sesión|expirado/i.test(e.message ?? '')) active = false;
    } finally {
      busy = false;
    }
  }

  function resultText(r: TrainingSubmit): string {
    const vs = `${elIcon(r.playerElement)} contra ${elIcon(r.enemyElement)} ${elLabel(r.enemyElement)}`;
    if (r.result === 'advanced' || r.result === 'completed') return `${vs}: ¡ventaja elemental! Piso superado.`;
    return `${vs}: sin ventaja, pierdes un corazón.`;
  }

  onMount(loadBuff);
</script>

<div class="card">
  <div class="head">
    <span class="big">🏯</span>
    <div class="title">
      <div class="name">Mazmorra elemental</div>
      <small>5 pisos · elige el elemento con ventaja sobre cada rival · cuesta 10 de energía</small>
    </div>
  </div>

  {#if buff?.active && buff.buff}
    <div class="ok-msg">
      Buff activo: ×{(1 + buff.buff.multiplier).toFixed(2)} a {buff.buff.stats.join(' y ')}
      · {Math.ceil(buff.buff.remainingMs / 3_600_000)} h restantes
    </div>
  {/if}

  {#if active}
    <div class="hearts">
      {#each Array(3) as _, i}<span class:lost={i >= hearts}>❤️</span>{/each}
      <small>Piso {Math.min(currentFloor + 1, TOTAL_FLOORS)} de {TOTAL_FLOORS}</small>
    </div>

    {#if floors}
      <div class="floors">
        {#each floors as f (f.floor)}
          <div class="floor" class:current={f.floor === currentFloor} class:done={f.floor < currentFloor}>
            <span class="floor-n">{f.floor + 1}</span>
            <span class="floor-el">{revealed[f.floor] ? elIcon(revealed[f.floor]) : '❔'}</span>
            <span class="floor-name">{f.enemyName}</span>
            <small>Nv {f.enemyLevel}</small>
          </div>
        {/each}
      </div>
    {/if}

    {#if isLastFloor}
      <label class="pred">
        Predicción (bonus de buff si aciertas el elemento del jefe):
        <select bind:value={prediction}>
          <option value="">Sin predicción</option>
          {#each ELEMENTS as el}<option value={el.id}>{el.icon} {el.label}</option>{/each}
        </select>
      </label>
    {/if}

    <div class="sec-title">¿Con qué elemento atacas?</div>
    <div class="elements">
      {#each ELEMENTS as el}
        <button class="el-btn" disabled={busy} on:click={() => pick(el.id)}>
          <span>{el.icon}</span><small>{el.label}</small>
        </button>
      {/each}
    </div>
  {:else}
    <button class="primary" disabled={!pet || busy} on:click={start}>
      {#if busy}Preparando…{:else if pet}<Ico n="swords" /> Entrar en la mazmorra{:else}Sin mascota activa{/if}
    </button>
  {/if}

  {#if last && active}<p class="info-msg">{resultText(last)}</p>{/if}
  {#if finalMsg}<p class="ok-msg">{finalMsg}</p>{/if}
  {#if error}<div class="error-msg">{error}</div>{/if}
</div>

<style>
  .card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .head { display: flex; gap: 12px; align-items: center; }
  .big { font-size: 34px; }
  .title { display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 16px; font-weight: 700; }
  .title small { color: var(--ink-muted); font-size: 11px; }
  .hearts { display: flex; gap: 4px; align-items: center; font-size: 16px; }
  .hearts .lost { filter: grayscale(1); opacity: 0.35; }
  .hearts small { margin-left: auto; font-size: 11px; color: var(--ink-muted); }
  .floors { display: flex; flex-direction: column; gap: 4px; }
  .floor { display: flex; gap: 8px; align-items: center; padding: 6px 8px; border-radius: var(--radius-2xl); background: var(--surface); border: 1px solid var(--line-soft); font-size: 12px; }
  .floor.current { border-color: var(--accent); }
  .floor.done { opacity: 0.6; }
  .floor-n { width: 18px; font-weight: 700; color: var(--accent-ink); }
  .floor-name { flex: 1; font-weight: 600; }
  .floor small { color: var(--ink-muted); font-size: 10px; }
  .pred { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ink-muted); }
  .pred select { padding: 6px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); color: var(--ink); }
  .sec-title { font-weight: 700; font-size: 13px; }
  .elements { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .el-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: var(--radius-2xl); border: 1px solid var(--line-soft); background: var(--surface); color: var(--ink); cursor: pointer; font-size: 20px; }
  .el-btn small { font-size: 10px; color: var(--ink-muted); }
  .el-btn:hover:not(:disabled) { border-color: var(--accent); }
  .el-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { padding: 10px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .info-msg { font-size: 12px; text-align: center; margin: 0; color: var(--ink); }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
</style>
