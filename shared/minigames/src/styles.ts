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
.pmg-card.is-hint { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #7c5cff) 55%, transparent); }

/* Escenario y pausa */
.pmg-stage { position: relative; display: grid; gap: 8px; }
.pmg-pause {
  position: absolute; inset: 0; z-index: 5; display: grid; place-content: center; gap: 12px; text-align: center;
  border-radius: var(--radius-2xl, 20px); background: color-mix(in srgb, var(--surface, #fff) 82%, transparent); backdrop-filter: blur(3px);
}
.pmg-pause[hidden] { display: none; }
.pmg-btn {
  font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 9999px; cursor: pointer; color: inherit;
  background: var(--surface-2, #f3f1fb); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
}
.pmg-btn:disabled { opacity: 0.5; cursor: default; }
.pmg-btn--big { padding: 12px 20px; font-size: 1.05em; background: color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--surface, #fff)); touch-action: none; }
.pmg-feedback { position: absolute; left: 0; right: 0; top: 8px; text-align: center; font-weight: 800; pointer-events: none; }

/* Pulso Voltaico */
.pmg-arena--volt { background: linear-gradient(180deg, #14122b, color-mix(in srgb, var(--elem-electric, #f5c400) 18%, #14122b)); color: #fff; }
.pmg-lane { position: absolute; top: 0; bottom: 0; border-left: 1px dashed rgba(255, 255, 255, 0.12); }
.pmg-hitline { position: absolute; left: 0; right: 0; height: 3px; background: var(--elem-electric, #f5c400); box-shadow: 0 0 10px var(--elem-electric, #f5c400); }
.pmg-note { font-size: 28px; }
.pmg-note.is-miss { opacity: 0.3; filter: grayscale(1); }
.pmg-pads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.pmg-pad {
  font: inherit; font-weight: 800; min-height: 48px; border-radius: 14px; cursor: pointer; color: inherit; touch-action: none;
  background: var(--surface-2, #f3f1fb); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
}
.pmg-pad.is-hit { background: color-mix(in srgb, var(--elem-electric, #f5c400) 45%, var(--surface, #fff)); }

/* Corriente de Datos */
.pmg-arena--stream { background: linear-gradient(180deg, color-mix(in srgb, var(--elem-water, #2f8fff) 30%, #0d1b33), #0d1b33); }
.pmg-lane-sep { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.12); }
.pmg-swimmer { font-size: 32px; transition: left 0.08s; }
.pmg-swimmer.is-stunned { animation: pmg-shake 0.2s infinite; filter: grayscale(0.8); }
@keyframes pmg-shake { 50% { transform: translate(-46%, -50%) rotate(8deg); } }

/* Raíz Fractal */
.pmg-roots { display: grid; gap: 4px; padding: 8px; border-radius: var(--radius-2xl, 20px); background: color-mix(in srgb, var(--elem-plant, #3fae5a) 10%, var(--surface-2, #f3f1fb)); }
.pmg-root {
  aspect-ratio: 1; padding: 0; border-radius: 8px; cursor: pointer; color: color-mix(in srgb, var(--ink, #0b0a14) 45%, transparent);
  background: var(--surface, #fff); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
}
.pmg-root svg { width: 100%; height: 100%; display: block; }
.pmg-root path { stroke: currentColor; stroke-width: 16; stroke-linecap: round; fill: none; }
.pmg-root circle { fill: currentColor; }
.pmg-root.is-lit { color: var(--elem-plant, #3fae5a); }
.pmg-root.is-source { position: relative; overflow: visible; box-shadow: inset 4px 0 0 var(--elem-plant, #3fae5a); }
.pmg-root.is-source::before { content: '🌱'; position: absolute; left: -4px; top: 50%; transform: translate(-50%, -50%); font-size: 13px; }
.pmg-root.is-hint { outline: 3px solid var(--accent, #7c5cff); outline-offset: -3px; }
.pmg-root.is-bloom { background: color-mix(in srgb, #ff8fc8 30%, var(--surface, #fff)); }

/* Cifrado */
.pmg-arena--shadow { background: radial-gradient(circle at 50% 50%, #2a2347, #0b0a14); }
.pmg-glyphs { aspect-ratio: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px; }
.pmg-glyph {
  aspect-ratio: 1; font-size: 34px; border-radius: 18px; cursor: pointer; color: inherit; opacity: 0.45; filter: grayscale(0.7);
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); transition: opacity 0.1s, transform 0.1s;
}
.pmg-glyph.is-lit { opacity: 1; filter: none; transform: scale(1.06); box-shadow: 0 0 18px rgba(200, 180, 255, 0.6); }
.pmg-glyph.is-wrong { opacity: 1; filter: none; box-shadow: 0 0 0 3px var(--danger, #e5484d); }
.pmg--cifrado .pmg-feedback { position: static; min-height: 1.4em; }

/* Faro de Claridad */
.pmg-arena--dark { background: #07060d; }
.pmg-cells { display: grid; gap: 2px; padding: 4px; cursor: crosshair; }
.pmg-cell {
  position: relative; display: grid; place-items: center; font-size: 18px; border-radius: 6px; background: rgba(255, 255, 255, 0.03);
}
.pmg-cell.is-bad { background: color-mix(in srgb, #b4247a 35%, transparent); }
.pmg-cell.is-beam { background: radial-gradient(circle, color-mix(in srgb, var(--elem-light, #ffd76a) 85%, transparent), transparent 75%); }
.pmg-cell.is-beam::after {
  content: ''; position: absolute; left: 10%; right: 10%; bottom: 6%; height: 3px; border-radius: 3px;
  background: #fff; transform-origin: left; transform: scaleX(var(--p, 0));
}

/* Forja Térmica */
.pmg-arena--forge { background: linear-gradient(180deg, #2a1410, #120806); color: #fff; }
.pmg-gauge { position: absolute; left: 12%; top: 8%; bottom: 8%; width: 34px; border-radius: 17px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.pmg-gauge__zone { position: absolute; left: 0; right: 0; background: color-mix(in srgb, #ffc94a 55%, transparent); }
.pmg-gauge__temp { position: absolute; left: 30%; right: 30%; bottom: 0; border-radius: 6px; background: #ff7a3c; transition: height 0.05s linear; }
.pmg-gauge__temp.is-ok { background: #ffd34a; }
.pmg-gauge__temp.is-hot { background: #ff2e2e; }
.pmg-ember { position: absolute; left: 58%; top: 42%; font-size: 52px; transform: translate(-50%, -50%); filter: grayscale(0.6); }
.pmg-ember.is-glow { filter: drop-shadow(0 0 14px #ffb347); }
.pmg-heat { position: absolute; left: 34%; right: 8%; bottom: 14%; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.pmg-heat__fill { height: 100%; background: #ffd34a; }
`;

export function ensureStyles(doc: Document = document) {
  if (doc.getElementById('pockai-minigames-css')) return;
  const style = doc.createElement('style');
  style.id = 'pockai-minigames-css';
  style.textContent = CSS;
  doc.head.append(style);
}
