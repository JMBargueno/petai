import { cleanText } from './memory';
import { isPrivateAddress } from './ssrf';
import { isIP } from 'net';
import { DESKTOP_SKILL_IDS, getDesktopSkill } from './desktop-skills';

/**
 * Definiciones y validación de las herramientas del agente (intelligence >= 500).
 *
 * Reglas de seguridad:
 *  - El identificador del usuario y de la mascota viene SIEMPRE de la sesión,
 *    nunca de los argumentos que genera el modelo.
 *  - Los argumentos se validan de forma estricta en el servidor.
 *  - Las herramientas con efectos no se ejecutan: se proponen al usuario y solo
 *    se ejecutan cuando él las confirma (ver AgentService).
 *  - El texto de confirmación lo genera el servidor a partir de los argumentos
 *    ya validados; el modelo no puede mostrar una descripción distinta.
 */

export const MAX_REMINDER_TEXT = 200;
export const MAX_PENDING_REMINDERS = 20;
const MIN_LEAD_MS = 30 * 1000;
const MAX_LEAD_MS = 366 * 24 * 3600 * 1000;

export type ValidationResult<T> = { ok: true; args: T } | { ok: false; error: string };

export interface ToolSpec<A = any> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  /**
   * Herramienta que ejecuta la app de escritorio, no el servidor. El servidor solo
   * valida los argumentos, pide la confirmación y los devuelve al cliente.
   * Solo se ofrece al modelo si el cliente declara que la soporta.
   */
  clientSide?: boolean;
  validate(raw: unknown, now: Date): ValidationResult<A>;
  /** Texto para la tarjeta de confirmación (solo herramientas con efectos). */
  describe?(args: A, timeZone: string): string;
}

const noArgs = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const acceptNoArgs = (raw: unknown): ValidationResult<{}> =>
  raw === null || raw === undefined || (typeof raw === 'object' && !Array.isArray(raw))
    ? { ok: true, args: {} }
    : { ok: false, error: 'Argumentos no válidos' };

export const TOOLS: ToolSpec[] = [
  {
    name: 'get_my_status',
    description: 'Consulta tu estado actual: hambre, felicidad, energía, higiene, salud, nivel y si estás enfermo o durmiendo.',
    parameters: noArgs,
    requiresConfirmation: false,
    validate: acceptNoArgs,
  },
  {
    name: 'request_food',
    description: 'Mira qué comida necesitas y cuál tiene tu entrenador en el inventario (incluida tu favorita).',
    parameters: noArgs,
    requiresConfirmation: false,
    validate: acceptNoArgs,
  },
  {
    name: 'suggest_minigame',
    description: 'Sugiere un minijuego adecuado a tu estado actual (energía y ánimo).',
    parameters: noArgs,
    requiresConfirmation: false,
    validate: acceptNoArgs,
  },
  {
    name: 'search_memory',
    description: 'Busca en tus recuerdos de conversaciones pasadas con el entrenador.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Qué quieres recordar (palabras clave)' } },
      required: ['query'],
      additionalProperties: false,
    },
    requiresConfirmation: false,
    validate(raw) {
      const q = (raw as any)?.query;
      if (typeof q !== 'string' || cleanText(q, 100).length < 2) {
        return { ok: false, error: 'query debe ser un texto de al menos 2 caracteres' };
      }
      return { ok: true, args: { query: cleanText(q, 100) } };
    },
  },
  {
    name: 'get_lore',
    description:
      'Consulta lo que sabes de tu mundo, el Éter Digital: el origen de los huevos, las rarezas, los patrones, los elementos, el Despertar, el Coliseo, los Nexos (clanes)… Úsala cuando el entrenador pregunte por el universo de Pockai.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Sobre qué quieres saber, p. ej. «origen de los huevos», «elementos» o «clanes»' } },
      required: ['topic'],
      additionalProperties: false,
    },
    requiresConfirmation: false,
    validate(raw) {
      const t = (raw as any)?.topic;
      if (typeof t !== 'string' || cleanText(t, 60).length < 2) {
        return { ok: false, error: 'topic debe ser un texto de al menos 2 caracteres' };
      }
      return { ok: true, args: { topic: cleanText(t, 60) } };
    },
  },
  {
    name: 'list_reminders',
    description: 'Lista los recordatorios pendientes del entrenador.',
    parameters: noArgs,
    requiresConfirmation: false,
    validate: acceptNoArgs,
  },
  {
    name: 'create_reminder',
    description:
      'Crea un recordatorio para el entrenador. REQUIERE su confirmación: se le mostrará una tarjeta y solo se creará si acepta. Usa la hora actual indicada en tus instrucciones para calcular due_at.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: `Qué hay que recordar (máx. ${MAX_REMINDER_TEXT} caracteres)` },
        due_at: { type: 'string', description: 'Fecha y hora en ISO 8601 con zona horaria, p. ej. 2026-11-14T09:30:00+01:00' },
      },
      required: ['text', 'due_at'],
      additionalProperties: false,
    },
    requiresConfirmation: true,
    validate(raw, now) {
      const a = raw as any;
      if (!a || typeof a.text !== 'string' || typeof a.due_at !== 'string') {
        return { ok: false, error: 'Se requieren text y due_at (texto)' };
      }
      const text = cleanText(a.text, MAX_REMINDER_TEXT);
      if (text.length < 2) return { ok: false, error: 'El texto del recordatorio está vacío' };
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.due_at)) {
        return { ok: false, error: 'due_at debe ser una fecha ISO 8601, p. ej. 2026-11-14T09:30:00+01:00' };
      }
      const due = new Date(a.due_at);
      if (Number.isNaN(due.getTime())) return { ok: false, error: 'due_at no es una fecha válida' };
      const lead = due.getTime() - now.getTime();
      if (lead < MIN_LEAD_MS) return { ok: false, error: 'due_at debe estar en el futuro' };
      if (lead > MAX_LEAD_MS) return { ok: false, error: 'due_at no puede superar un año' };
      return { ok: true, args: { text, due_at: due.toISOString() } };
    },
    describe(args: { text: string; due_at: string }, timeZone: string) {
      const when = new Intl.DateTimeFormat('es-ES', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(args.due_at));
      return `Crear el recordatorio «${args.text}» para el ${when}`;
    },
  },
];

// ---------- Herramientas del escritorio (siempre con confirmación) ----------

export const MAX_URL_CHARS = 2000;

/** Destinos que open_url nunca abre: loopback, redes privadas y nombres internos. */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h) return true;
  if (isIP(h)) return isPrivateAddress(h);
  return h === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/.test(h) || !h.includes('.');
}

TOOLS.push(
  {
    name: 'open_url',
    description:
      'Abre un enlace web (http/https) en el navegador del entrenador. REQUIERE su confirmación y solo funciona en la app de escritorio. No uses direcciones locales.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL completa, p. ej. https://es.wikipedia.org/wiki/Axolote' } },
      required: ['url'],
      additionalProperties: false,
    },
    requiresConfirmation: true,
    clientSide: true,
    validate(raw) {
      const u = (raw as any)?.url;
      if (typeof u !== 'string' || u.length > MAX_URL_CHARS || /[\u0000-\u0020\u007f]/.test(u.trim())) {
        return { ok: false, error: 'url debe ser un texto sin espacios ni caracteres de control (máx. 2000)' };
      }
      let url: URL;
      try {
        url = new URL(u.trim());
      } catch {
        return { ok: false, error: 'url no es una URL válida' };
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Solo se permiten enlaces http o https' };
      }
      if (url.username || url.password) return { ok: false, error: 'La URL no puede incluir credenciales' };
      if (isBlockedHost(url.hostname)) {
        return { ok: false, error: 'No se pueden abrir direcciones locales o privadas' };
      }
      return { ok: true, args: { url: url.toString() } };
    },
    describe(args: { url: string }) {
      return `Abrir este enlace en tu navegador: ${args.url} (ábrelo solo si lo reconoces)`;
    },
  },
  {
    name: 'read_clipboard',
    description:
      'Lee el texto del portapapeles del entrenador para ayudarle con él. REQUIERE su confirmación y solo funciona en la app de escritorio.',
    parameters: noArgs,
    requiresConfirmation: true,
    clientSide: true,
    validate: acceptNoArgs,
    describe() {
      return 'Leer el texto de tu portapapeles y compartirlo con tu mascota (y con tu proveedor de IA)';
    },
  },
);

// ---------- Herramientas sobre la propia mascota (siempre con confirmación) ----------
// set_in_habitat la ejecuta el servidor; el resto, la app de escritorio.
// El servidor valida los argumentos; AgentService comprueba además el estado de la mascota
// (habilidad desbloqueada, Pomodoro activo…) antes de proponer la tarjeta.

export const MIN_POMODORO_MINUTES = 5;
export const MAX_POMODORO_MINUTES = 120;
export const MAX_BREAK_MINUTES = 30;

/** Temas y capas del reproductor MP3 (spec 42; mismos ids que @pockai/audio → mixer.ts). */
export const AMBIENT_TRACKS = ['night', 'tea', 'bits', 'none'] as const;
export const AMBIENT_LAYERS = ['rain', 'thunder', 'wind', 'crickets', 'birds'] as const;
const TRACK_NAME: Record<string, string> = { night: 'Noche tranquila', tea: 'Tarde de té', bits: 'Lluvia de bits' };
const LAYER_NAME: Record<string, string> = { rain: 'lluvia', thunder: 'trueno', wind: 'viento', crickets: 'grillos', birds: 'pájaros' };

const intArg = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

TOOLS.push(
  {
    name: 'toggle_desktop_skill',
    description:
      'Activa o desactiva una de tus habilidades de escritorio. REQUIERE la confirmación del entrenador. Solo puedes activar habilidades ya desbloqueadas.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', enum: DESKTOP_SKILL_IDS, description: 'Id de la habilidad' },
        enabled: { type: 'boolean', description: 'true para activarla, false para desactivarla' },
      },
      required: ['skill_id', 'enabled'],
      additionalProperties: false,
    },
    requiresConfirmation: true,
    clientSide: true,
    validate(raw) {
      const a = raw as any;
      if (!a || typeof a.skill_id !== 'string' || !getDesktopSkill(a.skill_id)) {
        return { ok: false, error: `skill_id debe ser uno de: ${DESKTOP_SKILL_IDS.join(', ')}` };
      }
      if (typeof a.enabled !== 'boolean') return { ok: false, error: 'enabled debe ser true o false' };
      return { ok: true, args: { skill_id: a.skill_id, enabled: a.enabled } };
    },
    describe(args: { skill_id: string; enabled: boolean }) {
      const skill = getDesktopSkill(args.skill_id)!;
      const base = `${args.enabled ? 'Activar' : 'Desactivar'} la habilidad «${skill.name}»`;
      return args.enabled && skill.sensitive ? `${base} (usa un permiso del sistema: revisa Mascota → Habilidades)` : base;
    },
  },
  {
    name: 'start_pomodoro',
    description: `Inicia un temporizador Pomodoro de foco en el escritorio. REQUIERE confirmación. Minutos de foco entre ${MIN_POMODORO_MINUTES} y ${MAX_POMODORO_MINUTES} (por defecto 25) y de descanso entre 1 y ${MAX_BREAK_MINUTES} (por defecto 5).`,
    parameters: {
      type: 'object',
      properties: {
        work_minutes: { type: 'integer', minimum: MIN_POMODORO_MINUTES, maximum: MAX_POMODORO_MINUTES },
        break_minutes: { type: 'integer', minimum: 1, maximum: MAX_BREAK_MINUTES },
      },
      additionalProperties: false,
    },
    requiresConfirmation: true,
    clientSide: true,
    validate(raw) {
      const a = (raw ?? {}) as any;
      if (typeof a !== 'object' || Array.isArray(a)) return { ok: false, error: 'Argumentos no válidos' };
      const work = a.work_minutes === undefined ? 25 : intArg(a.work_minutes, MIN_POMODORO_MINUTES, MAX_POMODORO_MINUTES);
      const rest = a.break_minutes === undefined ? 5 : intArg(a.break_minutes, 1, MAX_BREAK_MINUTES);
      if (work === undefined) return { ok: false, error: `work_minutes debe ser un entero entre ${MIN_POMODORO_MINUTES} y ${MAX_POMODORO_MINUTES}` };
      if (rest === undefined) return { ok: false, error: `break_minutes debe ser un entero entre 1 y ${MAX_BREAK_MINUTES}` };
      return { ok: true, args: { work_minutes: work, break_minutes: rest } };
    },
    describe(args: { work_minutes: number; break_minutes: number }) {
      return `Empezar un Pomodoro de ${args.work_minutes} min de foco y ${args.break_minutes} min de descanso`;
    },
  },
  {
    name: 'stop_pomodoro',
    description: 'Detiene el Pomodoro en curso en el escritorio. REQUIERE confirmación.',
    parameters: noArgs,
    requiresConfirmation: true,
    clientSide: true,
    validate: acceptNoArgs,
    describe() {
      return 'Detener el Pomodoro en curso';
    },
  },
  {
    name: 'play_ambient',
    description:
      'Pone música en tu reproductor MP3 del escritorio: un tema lofi en bucle (night = noche tranquila, tea = tarde de té, bits = lluvia de bits, none = sin música) y capas de ambiente que se suman (rain, thunder, wind, crickets, birds). REQUIERE confirmación. Sin argumentos sigue con la última mezcla.',
    parameters: {
      type: 'object',
      properties: {
        track: { type: 'string', enum: [...AMBIENT_TRACKS] },
        layers: { type: 'array', items: { type: 'string', enum: [...AMBIENT_LAYERS] }, maxItems: AMBIENT_LAYERS.length },
      },
      additionalProperties: false,
    },
    requiresConfirmation: true,
    clientSide: true,
    validate(raw) {
      const a = (raw ?? {}) as any;
      if (typeof a !== 'object' || Array.isArray(a)) return { ok: false, error: 'Argumentos no válidos' };
      if (a.track !== undefined && !(AMBIENT_TRACKS as readonly string[]).includes(a.track)) {
        return { ok: false, error: `track debe ser uno de: ${AMBIENT_TRACKS.join(', ')}` };
      }
      if (a.layers !== undefined && (!Array.isArray(a.layers) || a.layers.some((l: unknown) => !(AMBIENT_LAYERS as readonly unknown[]).includes(l)))) {
        return { ok: false, error: `layers debe ser una lista con: ${AMBIENT_LAYERS.join(', ')}` };
      }
      const args: { track?: string; layers?: string[] } = {};
      if (a.track !== undefined) args.track = a.track;
      if (a.layers !== undefined) args.layers = [...new Set<string>(a.layers)];
      return { ok: true, args };
    },
    describe(args: { track?: string; layers?: string[] }) {
      const parts: string[] = [];
      if (args.track && args.track !== 'none') parts.push(`«${TRACK_NAME[args.track]}»`);
      if (args.layers?.length) parts.push(args.layers.map((l) => LAYER_NAME[l]).join(', '));
      return parts.length ? `Poner en el MP3: ${parts.join(' con ')}` : 'Poner música en el MP3';
    },
  },
  {
    name: 'stop_ambient',
    description: 'Pausa la música y los sonidos de ambiente de tu reproductor MP3. REQUIERE confirmación.',
    parameters: noArgs,
    requiresConfirmation: true,
    clientSide: true,
    validate: acceptNoArgs,
    describe() {
      return 'Pausar la música del MP3';
    },
  },
  {
    name: 'set_in_habitat',
    description:
      'Vete a tu casita (hábitat) a descansar o sal de ella al escritorio. REQUIERE confirmación. in_habitat=true para entrar, false para salir.',
    parameters: {
      type: 'object',
      properties: { in_habitat: { type: 'boolean' } },
      required: ['in_habitat'],
      additionalProperties: false,
    },
    requiresConfirmation: true,
    validate(raw) {
      const v = (raw as any)?.in_habitat;
      return typeof v === 'boolean' ? { ok: true, args: { in_habitat: v } } : { ok: false, error: 'in_habitat debe ser true o false' };
    },
    describe(args: { in_habitat: boolean }) {
      return args.in_habitat ? 'Mandar a tu mascota a su casita a descansar' : 'Sacar a tu mascota de su casita al escritorio';
    },
  },
);

export const CLIENT_TOOL_NAMES =TOOLS.filter((t) => t.clientSide).map((t) => t.name);

/** Interpreta la lista de herramientas de cliente que declara la app: solo nombres conocidos. */
export function sanitizeClientTools(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((n): n is string => typeof n === 'string' && CLIENT_TOOL_NAMES.includes(n)))];
}

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Parseo tolerante de los argumentos JSON que devuelve el modelo. */
export function parseToolArguments(raw: string): unknown {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Herramientas del servidor y, solo si el cliente las declara, las suyas. */
export function toolDefinitions(clientTools: string[] = []) {
  return TOOLS.filter((t) => !t.clientSide || clientTools.includes(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
