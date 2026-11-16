import { derived, writable, type Readable } from 'svelte/store';

/**
 * Cola única de habla del pockai.
 *
 * Todo lo que la mascota "dice" (reacciones, barks, recordatorios, avisos, respuestas del chat de
 * IA…) pasa por aquí: los mensajes se encolan y se muestran de uno en uno en el bocadillo, cada
 * uno el tiempo que necesita según su longitud. Los textos largos se trocean por frases.
 */

export type SpeechPriority = 'low' | 'normal' | 'high';

export interface SpeakOptions {
  /**
   * `low`: relleno (barks, comentarios espontáneos). Solo entra si no hay nada diciéndose ni en cola.
   * `normal`: lo habitual. `high`: se antepone a lo pendiente (recordatorios, avisos importantes).
   */
  priority?: SpeechPriority;
  /** Duración fija por trozo; por defecto depende de la longitud. */
  durationMs?: number;
  /** Clave de deduplicación: si ya hay un mensaje con la misma clave en pantalla o en cola, se ignora. */
  key?: string;
  /** Se llama cuando el (primer) trozo aparece en pantalla, p. ej. para animar `talk`. */
  onShow?: () => void;
  /**
   * Caducidad: si el mensaje no ha empezado a mostrarse en este tiempo, se descarta (reacciones
   * inmediatas como las caricias, que no tienen sentido un minuto después).
   */
  maxWaitMs?: number;
  /** Máximo de bocadillos para este mensaje; el último acaba en `overflowNote` si se recorta. */
  maxChunks?: number;
  overflowNote?: string;
}

export interface Speech {
  id: number;
  /** Mensaje (llamada a `speak`) al que pertenece el trozo. */
  group: number;
  text: string;
  priority: SpeechPriority;
  durationMs: number;
  key?: string;
  onShow?: () => void;
  expiresAt?: number;
}

export const MAX_CHUNK = 160;
/** Máximo de mensajes pendientes (no de trozos): un mensaje troceado nunca se recorta a medias. */
export const MAX_QUEUE = 8;
/** Máximo de bocadillos por mensaje por defecto. */
export const MAX_CHUNKS = 8;
/** Pausa entre mensajes para que se note el cambio de bocadillo. */
export const GAP_MS = 400;

const RANK: Record<SpeechPriority, number> = { low: 0, normal: 1, high: 2 };

/** Duración de lectura según la longitud del texto (3–12 s). */
export function durationFor(text: string): number {
  return Math.min(12_000, Math.max(3_000, 2_500 + 55 * text.length));
}

function splitWords(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (word.length > max) {
      if (cur) out.push(cur);
      cur = '';
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      continue;
    }
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > max) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Trocea un texto en fragmentos de como mucho `max` caracteres, respetando frases cuando se puede. */
export function splitForSpeech(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= max && !clean.includes('\n')) return [clean];

  // Frases: terminadas en . ! ? … (con comillas/paréntesis de cierre opcionales) o por salto de línea
  const sentences = clean
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?…]+(?:[.!?…]+["'»)\]]*|$)/g) ?? [line])
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) out.push(cur);
      cur = '';
      out.push(...splitWords(s, max));
      continue;
    }
    const next = cur ? `${cur} ${s}` : s;
    if (next.length > max) {
      out.push(cur);
      cur = s;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** Quita bloques de razonamiento y el markdown más común para que se lea bien en el bocadillo. */
export function toSpeakable(text: string): string {
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|`|~~)(.+?)\1/g, '$2')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .trim();
}

export function createSpeechQueue() {
  const current = writable<Speech | null>(null);
  let shown: Speech | null = null;
  let queue: Speech[] = [];
  let seq = 0;
  let groupSeq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gap = false;

  function setShown(s: Speech | null) {
    shown = s;
    current.set(s);
  }

  function next() {
    timer = null;
    // Se descartan los mensajes caducados que no llegaron a empezar
    const now = Date.now();
    while (queue.length && queue[0].expiresAt !== undefined && queue[0].expiresAt < now) {
      const g = queue[0].group;
      queue = queue.filter((q) => q.group !== g);
    }
    const s = queue.shift();
    if (!s) {
      setShown(null);
      return;
    }
    setShown(s);
    try {
      s.onShow?.();
    } catch (err) {
      console.warn('[habla] onShow falló:', err);
    }
    timer = setTimeout(finish, s.durationMs);
  }

  function finish() {
    timer = null;
    if (queue.length === 0) {
      setShown(null);
      return;
    }
    // Pausa breve sin bocadillo entre mensajes
    setShown(null);
    gap = true;
    timer = setTimeout(() => {
      gap = false;
      next();
    }, GAP_MS);
  }

  function busy() {
    return shown !== null || gap || queue.length > 0;
  }

  function trim() {
    for (;;) {
      // Mensajes completos pendientes (sin contar el que ya se está diciendo)
      const groups = [...new Set(queue.map((q) => q.group))].filter((g) => g !== shown?.group);
      if (groups.length <= MAX_QUEUE) return;
      // Primero se descarta lo de menor prioridad; a igualdad, lo más antiguo. Siempre el mensaje entero
      let victim = groups[0];
      let rank = RANK[queue.find((q) => q.group === victim)!.priority];
      for (const g of groups) {
        const r = RANK[queue.find((q) => q.group === g)!.priority];
        if (r < rank) {
          victim = g;
          rank = r;
        }
      }
      queue = queue.filter((q) => q.group !== victim);
    }
  }

  function speak(text: string, opts: SpeakOptions = {}): boolean {
    const priority = opts.priority ?? 'normal';
    let chunks = splitForSpeech(text ?? '');
    if (chunks.length === 0) return false;
    const maxChunks = Math.max(1, opts.maxChunks ?? MAX_CHUNKS);
    if (chunks.length > maxChunks) {
      const note = opts.overflowNote ?? '…';
      chunks = chunks.slice(0, maxChunks);
      const last = chunks[maxChunks - 1];
      const room = MAX_CHUNK - note.length - 1;
      chunks[maxChunks - 1] = `${last.length > room ? last.slice(0, room).trimEnd() : last} ${note}`;
    }
    if (opts.key && (shown?.key === opts.key || queue.some((q) => q.key === opts.key))) return false;
    if (priority === 'low' && busy()) return false;

    const group = ++groupSeq;
    const expiresAt = opts.maxWaitMs !== undefined ? Date.now() + opts.maxWaitMs : undefined;
    const items: Speech[] = chunks.map((c, i) => ({
      id: ++seq,
      group,
      expiresAt,
      text: c,
      priority,
      durationMs: opts.durationMs ?? durationFor(c),
      key: opts.key,
      onShow: i === 0 ? opts.onShow : undefined,
    }));

    if (priority === 'high') {
      // Se coloca detrás de los `high` ya pendientes y delante del resto
      const at = queue.findIndex((q) => q.priority !== 'high');
      queue.splice(at === -1 ? queue.length : at, 0, ...items);
      // Si lo que se está diciendo es relleno, se corta
      if (shown?.priority === 'low' && timer) {
        clearTimeout(timer);
        const cut = shown.group;
        queue = queue.filter((q) => q.group !== cut);
        trim();
        finish();
        return true;
      }
    } else {
      queue.push(...items);
    }
    trim();
    if (!shown && !gap && !timer) next();
    return true;
  }

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    gap = false;
    queue = [];
    setShown(null);
  }

  const isSpeaking: Readable<boolean> = derived(current, (c) => c !== null);

  return {
    current: { subscribe: current.subscribe } as Readable<Speech | null>,
    isSpeaking,
    speak,
    clear,
    /** ¿Hay algo en pantalla o pendiente? (incluye la pausa entre mensajes) */
    busy,
    pending: () => queue.length,
  };
}

const defaultQueue = createSpeechQueue();

export const currentSpeech = defaultQueue.current;
export const isSpeaking = defaultQueue.isSpeaking;
export const speak = defaultQueue.speak;
export const clearSpeech = defaultQueue.clear;
export const speechBusy = defaultQueue.busy;
