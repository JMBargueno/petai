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
.pmg-arena--nocursor { cursor: none; }
/* Arte propio: piezas de pixel art, fondo de arena y la mascota del jugador (assets.ts, pet.ts). Todo
   a la misma densidad: un píxel nativo mide lo mismo en la mascota (64) que en una pieza (32 o 48). */
/* Dos clases: gana a los fondos de reserva de cada arena, que usan el atajo background. */
.pmg-arena.pmg-arena--backdrop { background-size: 100% 100%; background-position: center; background-repeat: no-repeat; border-color: rgba(13, 10, 26, 0.35); }
.pmg-piece { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; user-select: none; }
.pmg-piece--missing { inset: 16%; width: auto; height: auto; border-radius: 3px; outline: 2px solid rgba(13, 10, 26, 0.6); }
.pmg-drop { position: absolute; width: calc(32 / 340 * 100%); aspect-ratio: 1; transform: translate(-50%, -50%); pointer-events: none; }
.pmg-halo { inset: -25%; width: 150%; height: 150%; }
.pmg-pet {
  position: absolute; z-index: 2; width: calc(64 / 340 * 100%); height: auto; image-rendering: pixelated; pointer-events: none;
  /* Anclada por los pies: fila 120 de 128 del frame. */
  transform: translate(-50%, -93.75%) scaleX(var(--pmg-flip, 1));
}
.pmg-pet.is-stunned { animation: pmg-blink 0.16s steps(2, jump-none) infinite; }
@keyframes pmg-blink { from { opacity: 1; } to { opacity: 0.35; } }
.pmg-shadow {
  position: absolute; z-index: 1; width: calc(36 / 340 * 100%); aspect-ratio: 2; transform: translate(-50%, -50%);
  border-radius: 50%; background: rgba(13, 10, 26, 0.38); pointer-events: none;
}
.pmg-drop.is-noise .pmg-piece { animation: pmg-jitter 0.24s steps(2, jump-none) infinite; }
@keyframes pmg-jitter { from { transform: translate(-1px, 0); } to { transform: translate(1px, 1px); } }
.pmg-spark { z-index: 3; inset: auto; width: calc(32 / 340 * 100%); height: auto; aspect-ratio: 1; transform: translate(-50%, -50%); }
.pmg-spark.is-big { width: calc(64 / 340 * 100%); }
.pmg-spark[hidden] { display: none; }
.pmg-hint { font-size: var(--text-caption, 12px); opacity: 0.65; margin: 0; text-align: center; }
.pmg-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

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

.pmg-hint--strong { opacity: 0.9; font-weight: 700; }
.pmg-line { margin: 0; min-height: 1.4em; text-align: center; font-weight: 800; }
.pmg-piece[hidden], .pmg-drop[hidden] { display: none; }
.pmg-drop--big { width: calc(48 / 340 * 100%); }
.pmg-pet--swim { transition: left 0.08s linear; }
.pmg-pet--glide { transition: left 0.15s linear; }
.pmg--reduced .pmg-pet.is-stunned { animation: none; opacity: 0.5; }
.pmg--reduced .pmg-drop.is-noise .pmg-piece, .pmg--reduced .pmg-catch.is-lure .pmg-piece { animation: none; }
.pmg--reduced .pmg-pet--swim, .pmg--reduced .pmg-pet--glide, .pmg--reduced .pmg-catch.is-pop { transition: none; animation: none; }

/* Cosecha del Éter */
.pmg-arena--harvest { background: linear-gradient(180deg, #231a42 0 62%, #17112e 62% 86%, #0d0a1a 86%); cursor: crosshair; }
.pmg-tide {
  position: absolute; inset: 0; pointer-events: none; transition: background-color 0.6s;
  background: linear-gradient(180deg, color-mix(in srgb, var(--pmg-flow, #e9ccff) 16%, transparent), transparent 45%);
}
.pmg-tidechip { position: absolute; z-index: 3; left: 3%; top: 4%; width: calc(32 / 340 * 100%); aspect-ratio: 1; }
.pmg--reduced .pmg-tide { transition: none; }

/* Cristal de Recuerdos */
.pmg-arena--crystal { background: linear-gradient(180deg, #231a42 0 88%, #17112e 88%); }
.pmg-facet {
  position: absolute; width: calc(48 / 340 * 100%); aspect-ratio: 1; padding: 0; border: 0; border-radius: 4px; background: none; cursor: pointer;
}
.pmg-facet:disabled { cursor: default; }
.pmg-facet__face { inset: 16.67%; width: 66.67%; height: 66.67%; }
.pmg-facet:hover:not(:disabled):not(.is-up) { transform: translateY(-2px); }
.pmg-facet.is-ok { outline: 2px solid #a8f0c8; outline-offset: -1px; }
.pmg-facet.is-hint { outline: 3px solid #fff1c2; }
.pmg-facet:focus-visible, .pmg-seal:focus-visible, .pmg-root:focus-visible { outline: 3px solid var(--accent, #7c5cff); outline-offset: 1px; }

/* Pesca de Códices */
.pmg-arena--loom { background: linear-gradient(180deg, #231a42 0 15%, #16233f 15% 82%, #17112e 82%); }
.pmg-catch {
  position: absolute; z-index: 2; width: calc(48 / 340 * 100%); aspect-ratio: 1; padding: 0; border: 0; background: none; cursor: crosshair;
  transform: translate(-50%, -50%);
}
.pmg-catch[hidden] { display: none; }
.pmg-catch__ripple { inset: auto; left: 16.67%; top: 50%; width: 66.67%; height: 66.67%; }
.pmg-catch.is-pop { animation: pmg-pop 0.15s steps(3, jump-none); }
@keyframes pmg-pop { from { transform: translate(-50%, -30%); opacity: 0.4; } to { transform: translate(-50%, -50%); opacity: 1; } }
.pmg-catch.is-lure .pmg-piece:last-child { animation: pmg-jitter 0.24s steps(2, jump-none) infinite; }
.pmg-arena.is-tangled .pmg-catch { cursor: not-allowed; }

/* Pulso Voltaico */
.pmg-arena--volt { background: linear-gradient(180deg, #14122b 0 82%, #0d0a1a 82%); color: #fff; }
.pmg-wire { position: absolute; top: 0; width: 2px; transform: translateX(-50%); background: rgba(255, 215, 49, 0.22); pointer-events: none; }
.pmg-node.is-hit .pmg-piece { transform: translateY(2px); }
.pmg-note.is-miss { opacity: 0.3; }
.pmg-pads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.pmg-pad {
  font: inherit; font-weight: 800; min-height: 48px; border-radius: 14px; cursor: pointer; color: inherit; touch-action: none;
  background: var(--surface-2, #f3f1fb); border: 1px solid var(--line-soft, rgba(11, 10, 20, 0.12));
}
.pmg-pad.is-hit { background: color-mix(in srgb, var(--elem-electric, #f5c400) 45%, var(--surface, #fff)); }

/* Corriente de Datos */
.pmg-arena--stream { background: linear-gradient(180deg, #132a52, #0d1b33); }
.pmg-lane-sep { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(163, 212, 255, 0.14); }

/* Raíz Fractal */
.pmg-arena--soil { background: #241a2b; }
.pmg-roots { position: absolute; display: grid; gap: 2px; aspect-ratio: 1; }
.pmg-root {
  aspect-ratio: 1; padding: 0; border-radius: 3px; cursor: pointer; color: #8a76b8;
  background: rgba(13, 10, 26, 0.55); border: 1px solid rgba(168, 240, 200, 0.14);
}
.pmg-root svg { width: 100%; height: 100%; display: block; }
.pmg-root path { stroke: currentColor; stroke-width: 16; stroke-linecap: butt; fill: none; }
.pmg-root path.pmg-root__rim { stroke: #0c2a1c; stroke-width: 26; }
.pmg-root rect { fill: currentColor; stroke: #0c2a1c; stroke-width: 5; }
.pmg-root.is-lit { color: #55db9c; }
.pmg-root.is-hint { outline: 3px solid #fff1c2; outline-offset: -3px; }
.pmg-root.is-bloom { background: rgba(168, 240, 200, 0.24); }

/* Cifrado */
.pmg-arena--shadow { background: linear-gradient(180deg, #16132a 0 80%, #0d0a1a 80%); }
.pmg-seal {
  position: absolute; width: calc(48 / 340 * 100%); aspect-ratio: 1; padding: 0; border: 0; border-radius: 50%; background: none; cursor: pointer;
  transform: translate(-50%, -50%); opacity: 0.5;
}
.pmg-seal.is-lit { opacity: 1; transform: translate(-50%, calc(-50% - 2px)); box-shadow: 0 0 0 3px var(--pmg-flow, #a99cff), 0 0 0 5px rgba(13, 10, 26, 0.7); }
.pmg-seal.is-wrong { opacity: 1; box-shadow: 0 0 0 3px #7cf5e6; }

/* Faro de Claridad */
.pmg-arena--dark { background: linear-gradient(180deg, #07060d 0 78%, #3d3654 78%); }
.pmg-cells { position: absolute; left: 0; right: 0; top: 0; display: grid; grid-auto-rows: 1fr; cursor: crosshair; }
.pmg-cell { position: relative; }
.pmg-cell__bit { inset: auto; left: 50%; top: 50%; width: calc(32 / 42.5 * 100%); height: auto; aspect-ratio: 1; transform: translate(-50%, -50%); }
.pmg-cell.is-bad { background: rgba(107, 100, 133, 0.2); }
.pmg-cell.is-beam { background: rgba(255, 246, 214, 0.3); }
.pmg-cell.is-beam::after {
  content: ''; position: absolute; left: 10%; right: 10%; bottom: 6%; height: 3px;
  background: #fff; transform-origin: left; transform: scaleX(var(--p, 0));
}
.pmg-shaft { position: absolute; z-index: 1; width: calc(10 / 340 * 100%); transform: translateX(-50%); background: rgba(255, 246, 214, 0.28); pointer-events: none; }
.pmg-shaft[hidden] { display: none; }

/* Forja Térmica */
.pmg-arena--forge { background: linear-gradient(180deg, #2a1410 0 80%, #120806 80%); color: #fff; }
.pmg-gauge { position: absolute; left: 6%; top: 8%; bottom: 26%; width: calc(26 / 340 * 100%); border-radius: 4px; background: rgba(13, 10, 26, 0.7); border: 2px solid #3a0d05; overflow: hidden; }
.pmg-gauge__zone { position: absolute; left: 0; right: 0; background: rgba(255, 209, 102, 0.6); }
.pmg-gauge__temp { position: absolute; left: 30%; right: 30%; bottom: 0; background: #fb4903; }
.pmg-gauge__temp.is-ok { background: #fff1c2; }
.pmg-gauge__temp.is-hot { background: #ff2e2e; }
.pmg-bellows.is-pumped { transform: translateX(2px); }
.pmg-heat { position: absolute; left: 50%; right: 8%; top: 8%; height: 8px; background: rgba(13, 10, 26, 0.7); border: 2px solid #3a0d05; overflow: hidden; }
.pmg-heat__fill { height: 100%; background: #ffd166; }
`;

export function ensureStyles(doc: Document = document) {
  if (doc.getElementById('pockai-minigames-css')) return;
  const style = doc.createElement('style');
  style.id = 'pockai-minigames-css';
  style.textContent = CSS;
  doc.head.append(style);
}
