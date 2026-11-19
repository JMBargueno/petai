/**
 * Sonidos sintetizados en tiempo real (`source: "synth"` en el manifiesto): los que tienen que ir
 * exactos al tempo o seguir una escala, y que no merece la pena gastar en ElevenLabs.
 */
export interface SynthArgs {
  ctx: BaseAudioContext;
  /** Nodo al que conectar (ya con volumen del bus y de la voz). */
  out: AudioNode;
  /** Momento de inicio en el reloj del contexto. */
  when: number;
  /** Índice de nota (escala) o de paso de combo, si el sonido lo usa. */
  note?: number;
  step?: number;
}

export type SynthFn = (a: SynthArgs) => number;

/** Pentatónica mayor desde La4: suena bien en cualquier orden (cifrado, combos). */
const PENTA = [0, 2, 4, 7, 9];
export function pentatonic(index: number, base = 440): number {
  const oct = Math.floor(index / PENTA.length);
  const deg = PENTA[((index % PENTA.length) + PENTA.length) % PENTA.length];
  return base * Math.pow(2, (oct * 12 + deg) / 12);
}

function blip(a: SynthArgs, freq: number, dur: number, type: OscillatorType, peak = 0.5): number {
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.when);
  env.gain.setValueAtTime(0.0001, a.when);
  env.gain.exponentialRampToValueAtTime(peak, a.when + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, a.when + dur);
  osc.connect(env).connect(a.out);
  osc.start(a.when);
  osc.stop(a.when + dur + 0.02);
  return dur;
}

/** Recetas por id. Un id `synth` del manifiesto sin receta aquí no suena (la validación lo avisa). */
export const SYNTHS: Record<string, SynthFn> = {
  'ui.slider_tick': (a) => blip(a, 1800, 0.03, 'sine', 0.25),
  'mg.countdown.tick': (a) => blip(a, 660, 0.12, 'triangle', 0.5),
  'mg.countdown.go': (a) => blip(a, 990, 0.3, 'triangle', 0.6),
  'mg.pulso_voltaico.metronome': (a) => blip(a, (a.step ?? 0) % 4 === 0 ? 1320 : 880, 0.05, 'square', 0.18),
  'mg.cifrado.glyph': (a) => blip(a, pentatonic(a.note ?? 0), 0.35, 'triangle', 0.45),
  'mg.combo.step': (a) => blip(a, pentatonic(Math.min(a.step ?? 0, 14), 523.25), 0.12, 'sine', 0.4),
};
