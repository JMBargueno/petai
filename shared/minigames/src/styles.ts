/**
 * Estilos de las vistas. Usan los tokens del escritorio (`--surface-2`, `--accent`…) con valores
 * de reserva para la página embed de Android/iOS, que no los define.
 */
const CSS = `
.pmg { display: grid; gap: 8px; width: 100%; max-width: 340px; margin: 0 auto; color: var(--ink, #0b0a14); font: inherit; }
.pmg-hud { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pmg-arena {
  position: relative; overflow: hidden; width: 100%; aspect-ratio: 340 / 260; touch-action: none; user-select: none;
  border-radius: var(--radius-2xl, 20px); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
  background: var(--surface-2, #f3f1fb);
}
.pmg-arena--sky { background: linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 12%, var(--surface, #fff)), var(--surface-2, #f3f1fb)); }
.pmg-arena--radial { background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--theme-arena, #ff7a59) 14%, transparent), var(--surface-2, #f3f1fb)); }
.pmg-arena--nocursor { cursor: none; }
.pmg-sprite { position: absolute; transform: translate(-50%, -50%); font-size: 26px; line-height: 1; pointer-events: none; }
.pmg-basket { font-size: 38px; }
.pmg-target { font-size: 40px; pointer-events: auto; background: none; border: 0; padding: 0; cursor: crosshair; }
.pmg-target[hidden] { display: none; }
.pmg-target.is-pop { animation: pmg-pop 0.15s ease-out; }
@keyframes pmg-pop { from { transform: translate(-50%, -50%) scale(0.4); } to { transform: translate(-50%, -50%) scale(1); } }
.pmg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.pmg-card {
  aspect-ratio: 1; font-size: 28px; border-radius: var(--radius-2xl, 20px); cursor: pointer; color: inherit;
  background: var(--surface-2, #f3f1fb); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
  transition: transform 0.12s, background 0.12s;
}
.pmg-card:hover { transform: translateY(-2px); }
.pmg-card.is-up { background: color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--surface, #fff)); }
.pmg-card.is-ok { background: color-mix(in srgb, var(--success, #2fae66) 22%, var(--surface, #fff)); border-color: var(--success, #2fae66); }
.pmg-card:disabled { cursor: default; }
.pmg-hint { font-size: var(--text-caption, 12px); opacity: 0.65; margin: 0; text-align: center; }
.pmg-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pmg--reduced .pmg-target.is-pop, .pmg--reduced .pmg-card { animation: none; transition: none; }
`;

export function ensureStyles(doc: Document = document) {
  if (doc.getElementById('pockai-minigames-css')) return;
  const style = doc.createElement('style');
  style.id = 'pockai-minigames-css';
  style.textContent = CSS;
  doc.head.append(style);
}
