import { describe, it, expect } from 'vitest';
import { formatFileSize, detectFileType } from './fileAnalyzer';

describe('fileAnalyzer', () => {
  it('formatea tamaños de archivo de forma legible', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('detecta archivos de código y sugiere acciones relevantes', () => {
    const meta = detectFileType('App.svelte');
    expect(meta.category).toBe('code');
    expect(meta.isText).toBe(true);
    expect(meta.suggestedActions.length).toBeGreaterThan(0);
    expect(meta.suggestedActions[0]).toContain('código');
  });

  it('detecta archivos de datos como JSON o CSV', () => {
    const meta = detectFileType('users.json');
    expect(meta.category).toBe('data');
    expect(meta.isText).toBe(true);
    expect(meta.suggestedActions[0]).toContain('estructura');
  });

  it('detecta documentos de texto markdown', () => {
    const meta = detectFileType('README.md');
    expect(meta.category).toBe('document');
    expect(meta.isText).toBe(true);
  });
});
