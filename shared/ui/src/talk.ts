/** Cuánto puede interrumpir el Pockai (spec 41): niveles y textos, compartidos por las apps. */

export const TALK_LEVELS = ['quiet', 'normal', 'chatty'] as const;
export type TalkLevel = (typeof TALK_LEVELS)[number];

/** Respuesta de `POST /pets/:id/initiative`. */
export interface InitiativeReply {
  phrase: { id: string; kind: string; text: string } | null;
  reason?: string;
  retryInMs: number;
  level: TalkLevel;
  feeling: string | null;
}

/** Respuesta de `GET/PUT /pets/:id/initiative/settings`. */
export interface InitiativeSettings {
  level: TalkLevel;
  levels: { id: TalkLevel; desktopMinutes: number; mobilePerDay: number; onlyOnReturn: boolean }[];
  talkFactor: number;
}

export const LEVEL_LABEL: Record<TalkLevel, string> = {
  quiet: 'Solo al volver',
  normal: 'Discreto',
  chatty: 'Hablador',
};

/** Qué significa cada nivel para este Pockai, en una frase (los números ya llevan su carácter). */
export function levelHint(level: InitiativeSettings['levels'][number] | undefined): string {
  if (!level) return '';
  if (level.onlyOnReturn) return 'Solo te habla por su cuenta cuando vuelves tras un rato fuera.';
  return `Te habla por su cuenta como mucho cada ${level.desktopMinutes} min.`;
}

/** Cómo es de hablador por carácter, en palabras. */
export function talkFactorLabel(factor: number): string {
  if (factor >= 1.2) return 'Por su carácter, habla más a menudo de lo normal.';
  if (factor <= 0.8) return 'Por su carácter, habla menos a menudo de lo normal.';
  return '';
}
