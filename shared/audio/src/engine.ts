/**
 * Motor de sonido compartido (WebAudio). Uno por ventana o WebView.
 *
 *   voz: fuente → efectos del perfil → panorama → volumen ─┬→ bus → atenuación (duck) → master → salida
 *                                                          └→ envío de reverb → reverb → master
 *
 * - Un id sin fichero (todavía no generado) o sin receta de síntesis no suena y no falla.
 * - El contexto se crea al primer uso y se reanuda con el primer gesto (`attachAutoUnlock`).
 * - Si todo está en silencio (oculto, sin foco, apagado) el contexto se suspende para ahorrar batería.
 */
import { PlayGate, pickVariant } from './gate';
import { BUSES, type Bus, type SoundDef, type SoundManifest, type SoundPlatform } from './manifest';
import { computeVoice, type FxSpec, type VoiceTraits } from './profiles';
import { defaultAudioSettings, effectiveBusGain, playerBusGain, type AudioEnv, type AudioSettings } from './settings';
import { SYNTHS, type SynthFn } from './synth';

export interface PlayOptions extends VoiceTraits {
  /** Panorama −1 (izquierda) … 1 (derecha). */
  pan?: number;
  /** dB extra sobre el del manifiesto. */
  gainDb?: number;
  /** Multiplicador de velocidad extra (p. ej. el fuego de la forja que sube con la temperatura). */
  rate?: number;
  /** Fuerza una toma concreta. */
  variant?: number;
  /** Retraso en ms (un trueno después del relámpago). */
  delayMs?: number;
  /** Para sintetizados: nota de la escala o paso de combo. */
  note?: number;
  step?: number;
}

export interface LoopOptions extends PlayOptions {
  /** Clave para tener varios loops del mismo id (p. ej. dos fuentes en la sala). Por defecto, el id. */
  key?: string;
  fadeMs?: number;
  /** Volumen propio del loop, 0–1 (las capas del MP3). Por defecto 1. */
  volume?: number;
  /** Lo pone el usuario con el reproductor MP3: no se calla en el escritorio (spec 42). */
  player?: boolean;
}

export interface EngineOptions {
  manifest: SoundManifest;
  /** id → URLs de sus tomas (ver `sourcesFromFiles`). */
  sources: Map<string, string[]>;
  settings?: AudioSettings;
  env?: Partial<AudioEnv>;
  /** Qué sonidos le tocan a este motor (por `platforms` del manifiesto). Por defecto, `scene`. */
  platform?: SoundPlatform;
  createContext?: () => AudioContext | null;
  fetchBuffer?: (url: string) => Promise<ArrayBuffer>;
  now?: () => number;
  rand?: () => number;
  synths?: Record<string, SynthFn>;
}

interface BusNodes {
  gain: GainNode;
  duck: GainNode;
  /** Salida de los loops del reproductor: mismo bus, sin el silencio del escritorio. */
  player: GainNode;
}

interface LoopVoice {
  id: string;
  gain: GainNode;
  /** Volumen al que sube tras el fundido (0–1). */
  level: number;
  player: boolean;
  /** Ya suena (el buffer ha cargado). */
  started: boolean;
  stop: (when: number) => void;
}

/** Un one-shot que tarda más que esto en cargar ya no se reproduce: llegaría a destiempo. */
const MAX_LATE_MS = 250;
const dbToGain = (db: number) => Math.pow(10, db / 20);
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

function defaultContext(): AudioContext | null {
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio ${res.status}: ${url}`);
  return res.arrayBuffer();
}

export class SoundEngine {
  private readonly manifest: SoundManifest;
  private readonly sources: Map<string, string[]>;
  private readonly platform: SoundPlatform;
  private readonly createContext: () => AudioContext | null;
  private readonly fetchBuffer: (url: string) => Promise<ArrayBuffer>;
  private readonly now: () => number;
  private readonly rand: () => number;
  private readonly synths: Record<string, SynthFn>;
  private settings: AudioSettings;
  private env: AudioEnv;

  private ctx: AudioContext | null = null;
  private ctxFailed = false;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private buses = new Map<Bus, BusNodes>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private gate = new PlayGate();
  private lastVariant = new Map<string, number>();
  private loops = new Map<string, LoopVoice>();
  private unlocked = false;
  private disposers: (() => void)[] = [];

  constructor(opts: EngineOptions) {
    this.manifest = opts.manifest;
    this.sources = opts.sources;
    this.platform = opts.platform ?? 'scene';
    this.createContext = opts.createContext ?? defaultContext;
    this.fetchBuffer = opts.fetchBuffer ?? defaultFetch;
    this.now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.rand = opts.rand ?? Math.random;
    this.synths = { ...SYNTHS, ...opts.synths };
    this.settings = opts.settings ?? defaultAudioSettings();
    this.env = { surface: 'app', focused: true, visible: true, ...opts.env };
  }

  // ── Estado ───────────────────────────────────────────────────────────────────────────────────

  getSettings(): AudioSettings {
    return this.settings;
  }

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.applyGains();
  }

  setEnv(env: Partial<AudioEnv>): void {
    this.env = { ...this.env, ...env };
    this.applyGains();
  }

  /** El id existe, le toca a esta plataforma y tiene con qué sonar (fichero o receta). */
  has(id: string): boolean {
    const def = this.manifest.sounds.get(id);
    if (!def || !this.forThisPlatform(def)) return false;
    return def.source === 'synth' ? !!this.synths[id] : (this.sources.get(id)?.length ?? 0) > 0;
  }

  /** Reanuda el audio. Llamar desde un gesto del usuario (los navegadores lo exigen). */
  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    this.unlocked = true;
    if (ctx && ctx.state === 'suspended' && this.audible()) {
      try {
        await ctx.resume();
      } catch {
        /* sin permiso todavía: se reintenta en el siguiente gesto */
      }
    }
  }

  /** Desbloquea con el primer gesto en `target`. Devuelve la función para quitar los oyentes. */
  attachAutoUnlock(target: EventTarget | undefined = typeof document !== 'undefined' ? document : undefined): () => void {
    if (!target) return () => {};
    const events = ['pointerdown', 'keydown', 'touchend'];
    const handler = () => {
      void this.unlock();
      if (this.ctx?.state === 'running') events.forEach((e) => target.removeEventListener(e, handler));
    };
    events.forEach((e) => target.addEventListener(e, handler, { passive: true }));
    const off = () => events.forEach((e) => target.removeEventListener(e, handler));
    this.disposers.push(off);
    return off;
  }

  /** Sigue la visibilidad y el foco de la ventana para silenciar cuando toca. */
  attachWindowState(win: Window | undefined = typeof window !== 'undefined' ? window : undefined): () => void {
    if (!win) return () => {};
    const doc = win.document;
    const sync = () => this.setEnv({ visible: doc.visibilityState !== 'hidden', focused: doc.hasFocus() });
    const onFocus = () => this.setEnv({ focused: true });
    const onBlur = () => this.setEnv({ focused: false });
    doc.addEventListener('visibilitychange', sync);
    win.addEventListener('focus', onFocus);
    win.addEventListener('blur', onBlur);
    sync();
    const off = () => {
      doc.removeEventListener('visibilitychange', sync);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('blur', onBlur);
    };
    this.disposers.push(off);
    return off;
  }

  /** Descarga y decodifica por adelantado (p. ej. al abrir un minijuego). */
  preload(ids: string[]): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();
    const urls = ids.flatMap((id) => this.sources.get(id) ?? []);
    return Promise.all(urls.map((u) => this.load(u))).then(() => undefined);
  }

  // ── Reproducción ─────────────────────────────────────────────────────────────────────────────

  /** Dispara un sonido. Devuelve `false` si no va a sonar (sin fichero, en cooldown, silenciado…). */
  play(id: string, opts: PlayOptions = {}): boolean {
    const def = this.allowed(id);
    if (!def || def.loop) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.unlocked || this.busGain(def.bus) <= 0) return false;
    const t0 = this.now();
    if (!this.gate.canPlay(id, def.bus, def.cooldownMs, t0)) return false;
    this.gate.started(id, def.bus, t0);

    if (def.source === 'synth') {
      const dur = this.startSynth(ctx, def, opts);
      setTimeout(() => this.gate.ended(def.bus), (dur + (opts.delayMs ?? 0) / 1000) * 1000 + 50);
      return true;
    }
    const url = this.pickUrl(def, opts.variant);
    if (!url) {
      this.gate.ended(def.bus);
      return false;
    }
    void this.load(url).then((buf) => {
      if (!buf || this.now() - t0 > MAX_LATE_MS + (opts.delayMs ?? 0)) {
        this.gate.ended(def.bus);
        return;
      }
      const src = this.startBuffer(ctx, def, buf, opts, false);
      src.onended = () => this.gate.ended(def.bus);
    });
    return true;
  }

  /** Empieza (o mantiene) un loop. Repetir la llamada con la misma clave no lo duplica. */
  loop(id: string, opts: LoopOptions = {}): boolean {
    const key = opts.key ?? id;
    if (this.loops.has(key)) return true;
    const def = this.allowed(id);
    if (!def || !def.loop || def.source === 'synth') return false;
    const ctx = this.ensureContext();
    const url = this.pickUrl(def, opts.variant);
    if (!ctx || !url) return false;
    const fade = (opts.fadeMs ?? 600) / 1000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const player = !!opts.player;
    gain.connect(player ? this.busNodes(def.bus).player : this.busNodes(def.bus).gain);
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    const voice: LoopVoice = {
      id,
      gain,
      level: clamp01(opts.volume ?? 1),
      player,
      started: false,
      stop: (when) => {
        stopped = true;
        try {
          source?.stop(when);
        } catch {
          /* ya parado */
        }
      },
    };
    this.loops.set(key, voice);
    if (player) this.applyGains();
    void this.load(url).then((buf) => {
      if (!buf || stopped || this.loops.get(key) !== voice) return;
      source = this.startBuffer(ctx, def, buf, opts, true, gain);
      voice.started = true;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(voice.level, t + fade);
    });
    return true;
  }

  /** Cambia el volumen (0–1) de un loop que ya suena, con una rampa corta. */
  setLoopVolume(key: string, volume: number, rampMs = 200): void {
    const v = this.loops.get(key);
    if (!v) return;
    v.level = clamp01(volume);
    const ctx = this.ctx;
    if (!ctx || !v.started) return;
    const t = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(v.level, t + rampMs / 1000);
  }

  stopLoop(key: string, fadeMs = 600): void {
    const v = this.loops.get(key);
    if (!v) return;
    this.loops.delete(key);
    const ctx = this.ctx;
    if (!ctx) return;
    if (v.player) this.applyGains();
    const t = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    v.stop(t + fadeMs / 1000 + 0.05);
  }

  stopAllLoops(fadeMs = 400): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key, fadeMs);
  }

  activeLoops(): string[] {
    return [...this.loops.keys()];
  }

  /**
   * Sonido de una fase de un efecto visual (shared/scene/src/effects). Busca `fx.<efecto>.<fase>`
   * y, para la entrada, también `fx.<efecto>` a secas.
   */
  cue(effectId: string, phase: 'enter' | 'hold' | 'exit' = 'enter', opts: PlayOptions = {}): boolean {
    const specific = `fx.${effectId}.${phase}`;
    if (this.manifest.sounds.has(specific)) return this.play(specific, opts);
    return phase === 'enter' ? this.play(`fx.${effectId}`, opts) : false;
  }

  /** Baja un bus `db` dB durante `ms` (el ambiente cuando suena una fanfarria) y lo devuelve. */
  duck(bus: Bus, db = -10, ms = 1500): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const g = this.busNodes(bus).duck.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(dbToGain(db), t + 0.12);
    g.setValueAtTime(dbToGain(db), t + ms / 1000);
    g.linearRampToValueAtTime(1, t + ms / 1000 + 0.6);
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.stopAllLoops(0);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.buses.clear();
    this.buffers.clear();
  }

  // ── Interno ──────────────────────────────────────────────────────────────────────────────────

  private forThisPlatform(def: SoundDef): boolean {
    return def.platforms.includes(this.platform) || (this.platform === 'desktop' && def.platforms.includes('scene'));
  }

  private allowed(id: string): SoundDef | null {
    const def = this.manifest.sounds.get(id);
    if (!def || !this.forThisPlatform(def)) return null;
    if (this.settings.reduced && def.bus !== 'ui' && !def.essential) return null;
    return def;
  }

  private busGain(bus: Bus): number {
    return effectiveBusGain(this.settings, bus, this.env);
  }

  private audible(): boolean {
    if (BUSES.some((b) => this.busGain(b) > 0)) return true;
    // El reproductor MP3 sigue sonando aunque el resto esté callado (escritorio, sin foco)
    return [...this.loops.values()].some((v) => v.player && playerBusGain(this.settings, this.manifest.sounds.get(v.id)?.bus ?? 'music', this.env) > 0);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx || this.ctxFailed) return this.ctx;
    const ctx = this.createContext();
    if (!ctx) {
      this.ctxFailed = true;
      return null;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 1.8);
    this.reverb.connect(this.master);
    this.applyGains();
    return ctx;
  }

  private busNodes(bus: Bus): BusNodes {
    let n = this.buses.get(bus);
    if (!n) {
      const ctx = this.ctx!;
      n = { gain: ctx.createGain(), duck: ctx.createGain(), player: ctx.createGain() };
      n.gain.gain.value = this.busGain(bus);
      n.player.gain.value = playerBusGain(this.settings, bus, this.env);
      n.gain.connect(n.duck).connect(this.master!);
      n.player.connect(n.duck);
      this.buses.set(bus, n);
    }
    return n;
  }

  private applyGains(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const b of BUSES) {
      const g = this.busNodes(b).gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(this.busGain(b), t + 0.15);
      const p = this.busNodes(b).player.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(playerBusGain(this.settings, b, this.env), t + 0.15);
    }
    if (!this.audible()) {
      if (ctx.state === 'running') void ctx.suspend().catch(() => {});
    } else if (this.unlocked && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  private pickUrl(def: SoundDef, forced?: number): string | undefined {
    const urls = this.sources.get(def.id);
    if (!urls?.length) return undefined;
    const n = Math.min(urls.length, def.variants);
    const v = forced !== undefined ? Math.min(n - 1, Math.max(0, forced)) : pickVariant(n, this.lastVariant.get(def.id), this.rand);
    this.lastVariant.set(def.id, v);
    return urls[v];
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx;
      p = ctx
        ? this.fetchBuffer(url)
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /** Monta la cadena de una voz y devuelve el nodo de entrada (donde conectar la fuente). */
  private voiceChain(ctx: AudioContext, def: SoundDef, opts: PlayOptions, sink?: AudioNode) {
    const voice = computeVoice(def.profile, opts, this.rand);
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(def.gainDb + voice.gainDb + (opts.gainDb ?? 0));
    gain.connect(sink ?? this.busNodes(def.bus).gain);
    if (voice.reverb > 0 && this.reverb) {
      const send = ctx.createGain();
      send.gain.value = voice.reverb;
      gain.connect(send).connect(this.reverb);
    }
    let head: AudioNode = gain;
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      p.connect(head);
      head = p;
    }
    const oscs: OscillatorNode[] = [];
    const vibratos: FxSpec[] = [];
    for (const fx of [...voice.fx].reverse()) {
      const node = buildFx(ctx, fx, oscs);
      if (!node) {
        if (fx.kind === 'vibrato') vibratos.push(fx);
        continue;
      }
      node.out.connect(head);
      head = node.in;
    }
    return { input: head, voice, oscs, vibratos };
  }

  private startBuffer(ctx: AudioContext, def: SoundDef, buf: AudioBuffer, opts: PlayOptions, loop: boolean, sink?: AudioNode): AudioBufferSourceNode {
    const chain = this.voiceChain(ctx, def, opts, sink);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = chain.voice.rate * (opts.rate ?? 1);
    src.detune.value = chain.voice.detune;
    for (const v of chain.vibratos) {
      if (v.kind !== 'vibrato') continue;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = v.rate;
      depth.gain.value = v.cents;
      lfo.connect(depth).connect(src.detune);
      chain.oscs.push(lfo);
    }
    src.connect(chain.input);
    const when = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    chain.oscs.forEach((o) => o.start(when));
    src.start(when);
    src.addEventListener('ended', () =>
      chain.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ya parado */
        }
      }),
    );
    return src;
  }

  private startSynth(ctx: AudioContext, def: SoundDef, opts: PlayOptions): number {
    const fn = this.synths[def.id];
    if (!fn) return 0;
    const chain = this.voiceChain(ctx, def, opts);
    const when = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    chain.oscs.forEach((o) => o.start(when));
    const dur = fn({ ctx, out: chain.input, when, note: opts.note, step: opts.step });
    chain.oscs.forEach((o) => o.stop(when + dur + 0.05));
    return dur;
  }
}

function buildFx(ctx: AudioContext, fx: FxSpec, oscs: OscillatorNode[]): { in: AudioNode; out: AudioNode } | null {
  switch (fx.kind) {
    case 'biquad': {
      const f = ctx.createBiquadFilter();
      f.type = fx.type;
      f.frequency.value = fx.freq;
      if (fx.q !== undefined) f.Q.value = fx.q;
      if (fx.gain !== undefined) f.gain.value = fx.gain;
      return { in: f, out: f };
    }
    case 'drive': {
      const w = ctx.createWaveShaper();
      w.curve = driveCurve(fx.amount);
      w.oversample = '2x';
      return { in: w, out: w };
    }
    case 'tremolo': {
      const g = ctx.createGain();
      g.gain.value = 1 - fx.depth / 2;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = fx.rate;
      depth.gain.value = fx.depth / 2;
      lfo.connect(depth).connect(g.gain);
      oscs.push(lfo);
      return { in: g, out: g };
    }
    case 'vibrato':
      // Modula el detune de la fuente: lo monta startBuffer.
      return null;
  }
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const k = amount * 50;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Respuesta al impulso de una sala pequeña: ruido con caída exponencial. */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}
