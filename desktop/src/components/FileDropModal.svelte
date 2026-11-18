<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { buildFilePrompt, type AnalyzedFile } from '../lib/fileAnalyzer';
  import Ico from './Ico.svelte';
  import { Badge, Button, Modal, SectionHeader } from './ui';

  export let file: AnalyzedFile;

  const dispatch = createEventDispatcher<{
    close: void;
    sendPrompt: { prompt: string; file: AnalyzedFile };
  }>();

  let customQuestion = '';

  const CATEGORY: Record<string, { icon: string; color: string }> = {
    code: { icon: 'tool', color: 'var(--color-electric-blue)' },
    data: { icon: 'chart', color: 'var(--color-mint-pop)' },
    image: { icon: 'xp', color: 'var(--color-lavender)' },
  };
  $: cat = CATEGORY[file.category] ?? { icon: 'note', color: 'var(--color-sunburst)' };

  // El mensaje se recorta para caber en el límite del chat (si no, el servidor lo rechazaría)
  function handleActionClick(action: string) {
    dispatch('sendPrompt', { prompt: buildFilePrompt(file, action), file });
  }

  function handleCustomSend() {
    if (!customQuestion.trim()) return;
    dispatch('sendPrompt', { prompt: buildFilePrompt(file, customQuestion), file });
  }
</script>

<Modal label="Archivo: {file.name}" on:close={() => dispatch('close')}>
  <div class="ui-feature file-head" style="--feature-tint: {cat.color}">
    <span class="ui-feature__icon" aria-hidden="true"><Ico n={cat.icon} size={22} /></span>
    <div class="ui-feature__body">
      <h3 class="file-name" title={file.name}>{file.name}</h3>
      <div class="badges">
        <Badge size="sm" color={cat.color}>{file.typeLabel}</Badge>
        <Badge size="sm">{file.sizeFormatted}</Badge>
      </div>
    </div>
  </div>

  {#if file.snippet}
    <pre class="snippet"><code>{file.snippet}</code></pre>
  {/if}

  <SectionHeader title="Acciones sugeridas" icon="xp" />
  <div class="actions">
    {#each file.suggestedActions as action}
      <Button size="sm" on:click={() => handleActionClick(action)}>{action}</Button>
    {/each}
  </div>

  <div class="ui-inline">
    <input
      class="input"
      type="text"
      placeholder="O hazle cualquier pregunta sobre el archivo…"
      bind:value={customQuestion}
      on:keydown={(e) => e.key === 'Enter' && handleCustomSend()}
    />
    <Button variant="primary" iconOnly icon="send" label="Enviar pregunta" disabled={!customQuestion.trim()} on:click={handleCustomSend} />
  </div>
</Modal>

<style>
  .file-head {
    margin-top: -40px;
    padding-right: 36px;
  }
  .file-name {
    margin: 0;
    font-size: var(--text-body);
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badges {
    display: flex;
    gap: var(--space-1);
    margin-top: 3px;
  }
  .snippet {
    max-height: 140px;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    overflow: auto;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-2xl);
    background: var(--surface-2);
    color: var(--ink);
    font-size: var(--text-caption);
    line-height: 1.45;
    user-select: text;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
