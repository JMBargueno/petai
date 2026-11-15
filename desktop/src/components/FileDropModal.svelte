<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AnalyzedFile } from '../lib/fileAnalyzer';
  import { FileText, Code2, Database, Image, File, X, Sparkles, Send } from 'lucide-svelte';

  export let file: AnalyzedFile;

  const dispatch = createEventDispatcher<{
    close: void;
    sendPrompt: { prompt: string; file: AnalyzedFile };
  }>();

  let customQuestion = '';

  function handleActionClick(action: string) {
    const prompt = `Sobre el archivo "${file.name}" (${file.typeLabel}):\n${action}${
      file.snippet ? `\n\nContenido:\n\`\`\`\n${file.snippet}\n\`\`\`` : ''
    }`;
    dispatch('sendPrompt', { prompt, file });
  }

  function handleCustomSend() {
    if (!customQuestion.trim()) return;
    const prompt = `Sobre el archivo "${file.name}" (${file.typeLabel}):\n${customQuestion.trim()}${
      file.snippet ? `\n\nContenido:\n\`\`\`\n${file.snippet}\n\`\`\`` : ''
    }`;
    dispatch('sendPrompt', { prompt, file });
  }
</script>

<div
  class="file-modal-overlay"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  on:click|self={() => dispatch('close')}
  on:keydown={(e) => e.key === 'Escape' && dispatch('close')}
>
  <div class="file-card panel-card">
    <div class="card-header">
      <div class="file-icon-wrapper">
        {#if file.category === 'code'}
          <Code2 size={24} class="text-blue-400" />
        {:else if file.category === 'data'}
          <Database size={24} class="text-emerald-400" />
        {:else if file.category === 'image'}
          <Image size={24} class="text-purple-400" />
        {:else}
          <FileText size={24} class="text-amber-400" />
        {/if}
      </div>

      <div class="file-meta">
        <h4 class="file-name" title={file.name}>{file.name}</h4>
        <div class="file-badges">
          <span class="badge type-badge">{file.typeLabel}</span>
          <span class="badge size-badge">{file.sizeFormatted}</span>
        </div>
      </div>

      <button class="close-btn" on:click={() => dispatch('close')}>
        <X size={18} />
      </button>
    </div>

    {#if file.snippet}
      <div class="snippet-preview">
        <pre><code>{file.snippet}</code></pre>
      </div>
    {/if}

    <div class="actions-section">
      <span class="actions-title">
        <Sparkles size={14} /> Acciones sugeridas para la IA:
      </span>

      <div class="action-buttons">
        {#each file.suggestedActions as action}
          <button class="action-pill" on:click={() => handleActionClick(action)}>
            {action}
          </button>
        {/each}
      </div>
    </div>

    <!-- Pregunta libre -->
    <div class="custom-prompt-row">
      <input
        type="text"
        placeholder="O hazle cualquier pregunta sobre el archivo..."
        bind:value={customQuestion}
        on:keydown={(e) => e.key === 'Enter' && handleCustomSend()}
      />
      <button class="send-btn" on:click={handleCustomSend} disabled={!customQuestion.trim()}>
        <Send size={16} />
      </button>
    </div>
  </div>
</div>

<style>
  .file-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    z-index: 9999;
  }

  .file-card {
    width: 90%;
    max-width: 480px;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: #f8fafc;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .file-icon-wrapper {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .file-meta {
    flex: 1;
    overflow: hidden;
  }

  .file-name {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-badges {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .badge {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .type-badge {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
  }

  .size-badge {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5e1;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
  }

  .close-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.08);
  }

  .snippet-preview {
    max-height: 120px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .snippet-preview pre {
    margin: 0;
    font-family: monospace;
    font-size: 11px;
    color: #cbd5e1;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .actions-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #818cf8;
  }

  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-pill {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #e2e8f0;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .action-pill:hover {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.4);
    color: #ffffff;
  }

  .custom-prompt-row {
    display: flex;
    gap: 8px;
  }

  .custom-prompt-row input {
    flex: 1;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: #f8fafc;
    outline: none;
  }

  .custom-prompt-row input:focus {
    border-color: #6366f1;
  }

  .send-btn {
    background: #4f46e5;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    color: #ffffff;
    cursor: pointer;
    transition: background 0.15s;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
