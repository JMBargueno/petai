/**
 * Motor **puro** de las notificaciones con personalidad (feature 007).
 *
 * Sin dependencias de NestJS ni de BD/Redis: solo funciones deterministas (o casi) con parámetros
 * explícitos, para poder probarlas de forma aislada en `notification-rules.spec.ts` (TDD). El
 * orquestador (`NotificationDispatcherService`) consume estas funciones para decidir SI notificar
 * y qué mensaje generar.
 *
 * Estructura de `templates` (de `shared/game-data/notifications.json`):
 *   { [trait]: { [tier]: { [category]: string[] } } }
 * con `neutral` como rasgo de respaldo.
 */

export const NOTIFICATION_CATEGORIES = [
  'vitals_critical',
  'interaction',
  'achievement',
  'arena',
  'event',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Tipo de WS `pet:notification` derivado de la categoría (contrato de api-contract.md). */
export const CATEGORY_TO_TYPE: Record<NotificationCategory, string> = {
  vitals_critical: 'vitals',
  interaction: 'interaction',
  achievement: 'mission',
  arena: 'battle',
  event: 'event',
};

export const DEFAULT_MAX_PER_DAY = 3;

/** Prendido/apagado por categoría + tope diario de notificaciones. */
export interface NotificationPrefs {
  vitals_critical: boolean;
  interaction: boolean;
  achievement: boolean;
  arena: boolean;
  event: boolean;
  maxPerDay: number;
}

/**
 * Resuelve las preferencias completas a partir de un valor parcial/nulo del usuario.
 * `null`/`undefined` ⇒ defaults (todas activas, `maxPerDay=3`). Parcial ⇒ merge sobre defaults.
 */
export function resolveDefaults(prefs?: Partial<NotificationPrefs> | null): NotificationPrefs {
  const base: NotificationPrefs = {
    vitals_critical: true,
    interaction: true,
    achievement: true,
    arena: true,
    event: true,
    maxPerDay: DEFAULT_MAX_PER_DAY,
  };
  if (!prefs) return base;

  const merged: NotificationPrefs = { ...base };
  if (typeof prefs.vitals_critical === 'boolean') merged.vitals_critical = prefs.vitals_critical;
  if (typeof prefs.interaction === 'boolean') merged.interaction = prefs.interaction;
  if (typeof prefs.achievement === 'boolean') merged.achievement = prefs.achievement;
  if (typeof prefs.arena === 'boolean') merged.arena = prefs.arena;
  if (typeof prefs.event === 'boolean') merged.event = prefs.event;
  if (
    typeof prefs.maxPerDay === 'number' &&
    Number.isFinite(prefs.maxPerDay) &&
    prefs.maxPerDay >= 1 &&
    prefs.maxPerDay <= 10
  ) {
    merged.maxPerDay = Math.trunc(prefs.maxPerDay);
  }
  return merged;
}

/** ¿Está `date` dentro de la ventana de quiet hours en la zona horaria dada? (puede cruzar medianoche). */
export function isInQuietHours(date: Date, timezone: string, start: number, end: number): boolean {
  const hour = localHourInTz(date, timezone);
  // `start <= end` ⇒ ventana simple; `start > end` ⇒ cruza la medianoche (p. ej. 23 → 7).
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * ¿Debe aplicarse rate limit? `count` = notificaciones emitidas HOY. `maxPerDay <= 0` ⇒ todo
 * bloqueado. Se bloquea cuando el recuento ha alcanzado el tope.
 */
export function shouldRateLimit(count: number, maxPerDay: number): boolean {
  if (maxPerDay <= 0) return true;
  return count >= maxPerDay;
}

/**
 * ¿Es un duplicado? `lastEmitAt` = timestamp (ms) del último envío de la misma categoría
 * (o `null` si nunca); `windowMs` = ventana de dedup. Duplicado si hay envío previo dentro de la
 * ventana.
 */
export function shouldDedup(
  lastEmitAt: number | null | undefined,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  if (lastEmitAt == null || !Number.isFinite(lastEmitAt)) return false;
  if (windowMs <= 0) return false;
  return now - lastEmitAt < windowMs;
}

export type NotificationTemplates = Record<string, Record<string, Record<string, string[]>>>;

/** Mensaje genérico de último recurso si no hay plantilla aplicable (tono neutro). */
const GENERIC_FALLBACK: Record<string, string> = {
  vitals_critical: 'Necesito un poquito de atención. 🐾',
  interaction: '¡Aquí estoy! 🐾',
  achievement: '¡Conseguí algo nuevo! ✨',
  arena: '¡Acabó la pelea! ⚔️',
  event: '¡Hay algo nuevo que ver! 📢',
};

/**
 * Resuelve el mensaje a partir de las plantillas: `templates[trait][tier][category]`.
 * Cadena de fallback: rasgo exacto → `neutral` → cualquier tier disponible → mensaje genérico.
 * `rand` es inyectable para tests deterministas (por defecto `Math.random`).
 */
export function resolveTemplate(
  templates: NotificationTemplates | null | undefined,
  trait: string,
  tier: string,
  category: string,
  rand: () => number = Math.random,
): string {
  const pick = (list?: string[]): string | undefined => {
    if (!Array.isArray(list) || list.length === 0) return undefined;
    const idx = Math.abs(Math.floor(rand() * list.length)) % list.length;
    return list[idx];
  };

  if (templates) {
    // 1. Rasgo + tier + categoría exactos
    let m = pick(templates[trait]?.[tier]?.[category]);
    if (m) return m;
    // 2. Fallback al rasgo neutral (mismo tier)
    m = pick(templates.neutral?.[tier]?.[category]);
    if (m) return m;
    // 3. Cualquier tier del rasgo exacto que tenga la categoría
    for (const t of Object.keys(templates[trait] ?? {})) {
      m = pick(templates[trait][t][category]);
      if (m) return m;
    }
    // 4. Cualquier tier del rasgo neutral que tenga la categoría
    for (const t of Object.keys(templates.neutral ?? {})) {
      m = pick(templates.neutral[t][category]);
      if (m) return m;
    }
  }
  // 5. Último recurso
  return GENERIC_FALLBACK[category] ?? GENERIC_FALLBACK.vitals_critical;
}

/** Hora local (0-23) de `date` en la zona horaria IANA dada (respaldo UTC si no es válida). */
function localHourInTz(date: Date, timezone: string): number {
  const tz = isValidTimeZone(timezone) ? timezone : 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
    return parseInt(hour, 10) % 24;
  } catch {
    return date.getUTCHours();
  }
}

/** ¿Es un identificador IANA válido (p. ej. Europe/Madrid)? */
function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}
