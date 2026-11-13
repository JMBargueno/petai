import { cleanText } from './memory';
import { isPrivateAddress } from './ssrf';
import { isIP } from 'net';

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

export const CLIENT_TOOL_NAMES = TOOLS.filter((t) => t.clientSide).map((t) => t.name);

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
