/** Tipos de mensaje del formulario de contacto (el selector de la web envía uno de estos). */
export const CONTACT_TYPES = ['bug', 'improvement', 'question', 'legal', 'account', 'other'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

/** Desde dónde se llegó al formulario (`?from=` en la web; por defecto, la propia web). */
export const CONTACT_SOURCES = ['web', 'android', 'desktop'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

/** Etiqueta fija (español) que va en el asunto para ordenar y filtrar en el buzón. */
export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  bug: 'Fallo',
  improvement: 'Mejora',
  question: 'Pregunta',
  legal: 'Legal',
  account: 'Cuenta',
  other: 'Otro',
};

const SOURCE_LABELS: Record<ContactSource, string> = { web: 'Web', android: 'App Android', desktop: 'App escritorio' };

/** Quita saltos de línea de valores que van en cabeceras (asunto). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** Asunto del correo al buzón: `[Contacto][Fallo] <asunto>`. */
export const contactSubject = (type: ContactType, subject: string) =>
  `[Contacto][${CONTACT_TYPE_LABELS[type]}] ${oneLine(subject)}`;

export const contactSourceLabel = (source: ContactSource) => SOURCE_LABELS[source];
