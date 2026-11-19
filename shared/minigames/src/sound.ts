/**
 * Sonido de los minijuegos (spec 40, fase F3). El paquete no lleva motor propio: el anfitrión le da
 * uno (`MountOptions.sound`) y las vistas lo usan con `ctx.sfx`. El escritorio pasa el suyo, con los
 * ajustes del usuario; el embed crea uno con `@pockai/audio` (embed/audio.ts). Sin anfitrión que lo
 * dé, el juego es mudo y funciona igual.
 *
 * Las vistas disparan los sonidos al cambiar el estado (el campo `last` de cada juego y poco más),
 * nunca al pulsar: así suena lo que pasó de verdad. Un id sin fichero todavía no suena ni falla.
 *
 * Solo lo importan el anfitrión y las vistas. La lógica no: el backend la compila sin navegador.
 */

/** Opciones de un disparo: el subconjunto de `PlayOptions` de `@pockai/audio` que usan los juegos. */
export interface SoundOptions {
  /** Panorama −1 (izquierda) … 1 (derecha). */
  pan?: number;
  /** dB extra sobre el del manifiesto. */
  gainDb?: number;
  /** Multiplicador de velocidad. */
  rate?: number;
  /** Para sintetizados: nota de la escala o paso de racha. */
  note?: number;
  step?: number;
}

/** Lo que el anfitrión tiene que saber hacer. `SoundEngine` de `@pockai/audio` lo cumple tal cual. */
export interface MinigameSound {
  play(id: string, opts?: SoundOptions): unknown;
  loop(id: string, opts?: SoundOptions & { key?: string }): unknown;
  stopLoop(key: string, fadeMs?: number): void;
}

/** Lo que recibe una vista: lo mismo, con los bucles a cargo del anfitrión (los corta en pausa y al salir). */
export interface ViewSound {
  play(id: string, opts?: SoundOptions): void;
  /** Mantiene un bucle sonando. Se puede llamar en cada `render`: repetirlo no lo duplica. */
  loop(id: string): void;
  stopLoop(id: string): void;
}

/**
 * Ids de `shared/game-data/sounds.json` que usan los minijuegos. Un test del paquete exige que
 * existan todos en el manifiesto.
 */
export const MG = {
  pause: 'mg.pause',
  timerWarning: 'mg.timer_warning',
  /** Sintetizado: sube por la pentatónica con `step`. Rachas de cualquier juego. */
  streak: 'mg.combo.step',
  catchFood: { good: 'mg.catch_food.good', tide: 'mg.catch_food.tide', static: 'mg.catch_food.static', tideChange: 'mg.catch_food.tide_change' },
  memoryMatch: { peek: 'mg.memory_match.peek', flip: 'mg.memory_match.flip', match: 'mg.memory_match.match', miss: 'mg.memory_match.miss', clear: 'mg.memory_match.clear' },
  reflex: { appear: 'mg.reflex.appear', hit: 'mg.reflex.hit', fast: 'mg.reflex.fast', expire: 'mg.reflex.expire', lure: 'mg.reflex.lure' },
  pulsoVoltaico: {
    perfect: 'mg.pulso_voltaico.perfect',
    good: 'mg.pulso_voltaico.good',
    miss: 'mg.pulso_voltaico.miss',
    comboBreak: 'mg.pulso_voltaico.combo_break',
    /** Sintetizado: va exacto al tempo de la partida. */
    metronome: 'mg.pulso_voltaico.metronome',
  },
  corrienteDatos: { lane: 'mg.corriente_datos.lane', collect: 'mg.corriente_datos.collect', crash: 'mg.corriente_datos.crash' },
  raizFractal: { rotate: 'mg.raiz_fractal.rotate', light: 'mg.raiz_fractal.light', bloom: 'mg.raiz_fractal.bloom' },
  /** `glyph` es sintetizado: un tono de la escala por sello (`note`). */
  cifrado: { glyph: 'mg.cifrado.glyph', wrong: 'mg.cifrado.wrong', round: 'mg.cifrado.round' },
  faroClaridad: { beam: 'mg.faro_claridad.beam', purify: 'mg.faro_claridad.purify', spread: 'mg.faro_claridad.spread', lose: 'mg.faro_claridad.lose' },
  forjaTermica: {
    bellows: 'mg.forja_termica.bellows',
    fire: 'mg.forja_termica.fire',
    goldZone: 'mg.forja_termica.gold_zone',
    temper: 'mg.forja_termica.temper',
    burn: 'mg.forja_termica.burn',
  },
} as const;

/** Todos los ids de `MG`, en plano. */
export function minigameSoundIds(node: unknown = MG): string[] {
  if (typeof node === 'string') return [node];
  return node && typeof node === 'object' ? Object.values(node).flatMap((v) => minigameSoundIds(v)) : [];
}

/** Panorama de una posición horizontal de la arena (0…ancho), suavizado para que no maree. */
export const panAt = (x: number, width: number) => Math.max(-1, Math.min(1, (x / width) * 2 - 1)) * 0.6;

/**
 * El sonido de una partida: reenvía al motor del anfitrión y lleva la cuenta de los bucles para
 * cortarlos al pausar o al terminar. Sin motor, no hace nada.
 */
export function createViewSound(sound: MinigameSound | undefined): ViewSound & { stopAll(): void } {
  const loops = new Set<string>();
  return {
    play(id, opts) {
      sound?.play(id, opts);
    },
    loop(id) {
      if (!sound || loops.has(id)) return;
      loops.add(id);
      sound.loop(id, { key: `mg:${id}` });
    },
    stopLoop(id) {
      if (!loops.delete(id)) return;
      sound?.stopLoop(`mg:${id}`, 250);
    },
    stopAll() {
      for (const id of loops) sound?.stopLoop(`mg:${id}`, 250);
      loops.clear();
    },
  };
}
