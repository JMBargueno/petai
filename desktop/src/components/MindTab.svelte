<script lang="ts">
  /** Mascota › Mente (spec 36): personalidad en 5 dimensiones, memoria por capas y vida autónoma. */
  import { onMount } from 'svelte';
  import { api, type PetMind } from '../lib/api';
  import { LEVEL_LABEL, TALK_LEVELS, levelHint, talkFactorLabel, type InitiativeSettings, type TalkLevel } from '../lib/initiative';
  import { Segmented } from './ui';
  import { DIMENSIONS, MEMORY_LAYERS, layerUsage, memoryIcon, relativeTime } from '../lib/mind';
  import { describeLearned } from '../lib/brain/learningStore';
  import { AsyncState, Badge, Card, EmptyState, FeatureHeader, ListRow, ProgressBar, SectionHeader } from './ui';

  export let pet: any = null;

  let data: PetMind | null = null;
  $: learned = describeLearned(data?.learned?.prefs);
  let error = '';
  let loading = true;
  let now = new Date();

  const TIER_LABEL: Record<string, string> = { chat: 'Charla', memory: 'Memoria', agent: 'Agente' };
  // El servidor manda claves en inglés para el ánimo y el rango de vínculo.
  const MOOD_LABEL: Record<string, string> = { happy: 'Contento', content: 'A gusto', neutral: 'Tranquilo', sad: 'Triste', angry: 'Enfadado', tired: 'Cansado', excited: 'Emocionado', lonely: 'Solo', anxious: 'Inquieto' };
  const BOND_LABEL: Record<string, string> = { stranger: 'Desconocido', acquaintance: 'Conocido', friend: 'Amigo', close_friend: 'Amigo íntimo', best_friend: 'Mejor amigo', soulmate: 'Alma gemela' };
  const pretty = (map: Record<string, string>, key: string) => map[key?.toLowerCase?.()] ?? key;

  async function load() {
    if (!pet?.id) return;
    loading = true;
    error = '';
    try {
      data = await api.getMind(pet.id);
      now = new Date();
    } catch (e: any) {
      error = e instanceof TypeError ? 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.' : 'No se pudo cargar la mente de tu Pockai.';
    } finally {
      loading = false;
    }
  }

  // Recarga al cambiar de mascota (no en cada actualización del objeto `pet`)
  /** Ánimo de corto plazo, en palabras (el neutro no se muestra). */
  const FEELING_LABEL: Record<string, string> = {
    excited: 'Eufórico',
    content: 'A gusto',
    upset: 'Dolido',
    down: 'Alicaído',
    restless: 'Inquieto',
    sleepy: 'Adormilado',
  };

  /** Cuánto puede interrumpir: tres niveles, que el carácter del Pockai acerca o aleja. */
  let talk: InitiativeSettings | null = null;
  let talkError = '';
  async function loadTalk() {
    try {
      talk = pet?.id ? await api.getInitiativeSettings(pet.id) : null;
    } catch {
      // Servidor anterior o sin red: la sección no se muestra
      talk = null;
    }
  }
  async function setTalkLevel(level: string) {
    if (!pet?.id || !talk || level === talk.level) return;
    const previous = talk;
    talkError = '';
    // Se refleja al momento y se deshace si el servidor no lo guarda
    talk = { ...talk, level: level as TalkLevel };
    try {
      talk = await api.setInitiativeLevel(pet.id, level as TalkLevel);
    } catch {
      talk = previous;
      talkError = 'No se pudo guardar. Inténtalo de nuevo.';
    }
  }

  let loadedFor = '';
  $: if (pet?.id && pet.id !== loadedFor) {
    loadedFor = pet.id;
    void loadTalk();
    data = null;
    load();
  }

  onMount(() => {
    // Las fechas relativas se refrescan solas mientras la vista está abierta
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });
</script>

<div class="ui-stack">
  {#if !pet?.id}
    <EmptyState icon="brain" title="Sin mascota" text="Necesitas una mascota para ver su mente." />
  {:else}
    <AsyncState loading={loading && !data} {error} onRetry={load} rows={4} height={56}>
      {#if data}
        <Card variant="hero">
          <FeatureHeader icon="brain" title="Mente de {pet.nickname || pet.species?.name || 'tu Pockai'}" sub="Así es y así recuerda" tint="var(--theme-ai)">
            <svelte:fragment slot="end">
              <Badge size="sm" icon="brain" tone="tint">{TIER_LABEL[data.intelligenceTier] ?? data.intelligenceTier}</Badge>
            </svelte:fragment>
          </FeatureHeader>
          <div class="chips">
            {#if data.mood}<Badge size="sm" icon="smile" title="Ánimo">{pretty(MOOD_LABEL, data.mood)}</Badge>{/if}
            {#if data.feeling && FEELING_LABEL[data.feeling.label]}<Badge size="sm" icon="heart" title="Cómo se siente ahora mismo">{FEELING_LABEL[data.feeling.label]}</Badge>{/if}
            {#if data.bondingTier}<Badge size="sm" icon="bond" title="Vínculo">{pretty(BOND_LABEL, data.bondingTier)}</Badge>{/if}
          </div>
        </Card>

        <SectionHeader title="Personalidad" icon="smile" onRefresh={load} {loading} />
        <div class="dims">
          {#each DIMENSIONS as d (d.id)}
            {@const dim = data.dimensions[d.id]}
            {#if dim}
              <div class="dim" title={dim.keyword}>
                <ProgressBar
                  value={dim.value}
                  color={d.tint}
                  label={d.label}
                  detail="{dim.label} · {Math.round(dim.value)}/100"
                />
              </div>
            {/if}
          {/each}
        </div>

        {#if talk}
          <SectionHeader title="Cuánto te habla" icon="chat" />
          <div class="talk">
            <Segmented
              label="Cuánto te habla por su cuenta"
              options={TALK_LEVELS.map((id) => ({ value: id, label: LEVEL_LABEL[id] }))}
              value={talk.level}
              on:change={(e) => setTalkLevel(e.detail)}
            />
            <p class="talk-hint">
              {levelHint(talk.levels.find((l) => l.id === talk?.level))}
              {talkFactorLabel(talk.talkFactor)}
            </p>
            {#if talkError}<p class="talk-hint talk-error" role="alert">{talkError}</p>{/if}
          </div>
        {/if}

        {#if learned.likes.length || learned.dislikes.length}
          <SectionHeader title="Lo que ha aprendido de ti" icon="heart" />
          <div class="talk">
            {#if learned.likes.length}<p class="talk-hint">Sabe que te gusta verle {learned.likes.join(', ')}: lo hace algo más a menudo.</p>{/if}
            {#if learned.dislikes.length}<p class="talk-hint">Cree que prefieres que no se ponga a {learned.dislikes.join(', ')}: lo hace algo menos.</p>{/if}
            <p class="talk-hint">Lo aprende de tus gestos en el escritorio (caricias, chocar los cinco, apartarlo) y lo va olvidando si dejas de hacerlos.</p>
          </div>
        {/if}

        <SectionHeader title="Memoria" icon="folder" />
        <div class="ui-list">
          {#each MEMORY_LAYERS as l (l.id)}
            {@const count = data.memory.counts[l.id] ?? 0}
            {@const cap = data.memory.capacity?.[l.id] ?? null}
            <ListRow icon={l.icon} title={l.label} sub={l.hint} wrap>
              <svelte:fragment slot="end">
                <div class="cap">
                  <span class="cap-num">{count}{#if cap !== null}<small>/{cap}</small>{/if}</span>
                  {#if cap !== null}<ProgressBar size="sm" value={layerUsage(count, cap)} color="var(--theme-ai)" />{/if}
                </div>
              </svelte:fragment>
            </ListRow>
          {/each}
        </div>

        <SectionHeader title="Vida reciente" icon="log" count={data.recentLife.length || null} />
        <div class="ui-list ui-list--scroll">
          {#each data.recentLife as e (e.id)}
            <ListRow icon={memoryIcon(e.kind)} sub={e.content} wrap>
              <svelte:fragment slot="end">
                <time class="when" datetime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>{relativeTime(e.createdAt, now)}</time>
              </svelte:fragment>
            </ListRow>
          {:else}
            <EmptyState compact icon="log" text="Aún no ha vivido nada por su cuenta. Mientras no estés, explorará, jugará y conocerá a otros Pockais." />
          {/each}
        </div>
      {/if}
    </AsyncState>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .chips :global(.ui-badge) {
    text-transform: capitalize;
  }
  .dims {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .cap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
    min-width: 64px;
  }
  .cap :global(.ui-progress) {
    width: 64px;
  }
  .cap-num {
    font-weight: 800;
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .cap-num small {
    font-size: var(--text-caption);
    font-weight: 600;
    color: var(--ink-muted);
  }
  .when {
    font-size: var(--text-caption);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .talk {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .talk-hint {
    margin: 0;
    font-size: var(--text-caption);
    color: var(--ink-soft, var(--ink));
    text-wrap: pretty;
  }
  .talk-error {
    color: var(--color-danger, #c0392b);
  }
</style>
