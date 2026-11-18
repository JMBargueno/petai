/**
 * Conversation Engine (spec 36) — interpretación previa al LLM, sin coste.
 *
 * Clasifica el mensaje del entrenador con reglas (intención + sentimiento). Esto permite que el
 * Behavior Engine prepare la reacción y que el Memory Engine decida qué merece recordarse SIN
 * guardar el texto literal del usuario (privacidad): se guarda una paráfrasis de plantilla.
 * El LLM sigue siendo quien entiende los matices al redactar la respuesta.
 */

export type Intent =
  | 'sad_day'
  | 'good_news'
  | 'affection'
  | 'scold'
  | 'play_request'
  | 'explore_request'
  | 'greeting'
  | 'farewell'
  | 'question'
  | 'chat';

export interface Interpretation {
  intent: Intent;
  /** -1 (muy negativo) .. 1 (muy positivo) */
  sentiment: number;
  /** Paráfrasis para la memoria episódica, o null si no merece recordarse. */
  episode: { content: string; importance: number; valence: number } | null;
  /** Evento de evolución que provoca el propio mensaje (además de 'chat'). */
  evolutionEvent?: string;
}

const RULES: { intent: Intent; re: RegExp }[] = [
  {
    intent: 'sad_day',
    re: /(d[ií]a\s+(muy\s+|bastante\s+|un\s+poco\s+)?(malo|horrible|duro|fatal|terrible|asqueroso)|estoy\s+(muy\s+)?(triste|mal|fatal|cansad[oa]|agobiad[oa]|deprimid[oa]|estresad[oa]|harto|harta)|me\s+siento\s+(muy\s+)?(mal|triste|sol[oa]|fatal)|bad\s+day|i'?m\s+(so\s+)?(sad|tired|stressed|down)|feel(ing)?\s+(bad|sad|down|lonely))/i,
  },
  {
    intent: 'good_news',
    re: /(buen[ií]simo\s+d[ií]a|d[ií]a\s+(genial|incre[ií]ble|estupendo|perfecto)|estoy\s+(muy\s+)?(feliz|content[oa]|genial|emocionad[oa])|he\s+aprobado|me\s+han\s+(ascendido|contratado|dado)|buenas\s+noticias|great\s+day|i'?m\s+(so\s+)?happy|good\s+news|i\s+passed)/i,
  },
  { intent: 'affection', re: /(te\s+quiero|te\s+adoro|eres\s+(el|la|lo)\s+mejor|te\s+he\s+echado\s+de\s+menos|un\s+abrazo|love\s+you|missed\s+you|you'?re\s+the\s+best)/i },
  { intent: 'scold', re: /(te\s+(has\s+)?portad[oa]\s+mal|eres\s+(mal[oa]|tont[oa]|in[uú]til)|c[aá]llate|no\s+me\s+molestes|bad\s+(pet|boy|girl)|shut\s+up)/i },
  // Verbo explorar conjugado o «de aventura»: «explorador de archivos» y «película de aventuras» no cuentan
  {
    intent: 'explore_request',
    re: /(\bexplor(ar|emos|amos|aci[oó]n|a|o|as|e)\b|\b(de|una|otra)\s+aventura\b|vamos\s+de\s+paseo|salir\s+a\s+dar|\badventure\b|\bexplore\b|go\s+for\s+a\s+walk)/i,
  },
  { intent: 'play_request', re: /(jug(ar|amos|uemos)|una\s+partida|minijuego|let'?s\s+play|wanna\s+play|play\s+a\s+game)/i },
  { intent: 'farewell', re: /(^|\s)(adi[oó]s|hasta\s+(luego|mañana|pronto)|me\s+voy|buenas\s+noches|bye|good\s*night|see\s+you)/i },
  { intent: 'greeting', re: /^\s*(hola|holi|buenas|hey|hi|hello|buenos\s+d[ií]as|buenas\s+tardes)\b/i },
];

const SENTIMENT: Record<Intent, number> = {
  sad_day: -0.7,
  good_news: 0.8,
  affection: 0.9,
  scold: -0.8,
  play_request: 0.4,
  explore_request: 0.4,
  greeting: 0.2,
  farewell: 0,
  question: 0,
  chat: 0,
};

const EPISODES: Partial<Record<Intent, { content: string; importance: number; valence: number }>> = {
  sad_day: { content: 'Mi entrenador me contó que estaba teniendo un mal día y estuve a su lado.', importance: 0.65, valence: -0.2 },
  good_news: { content: 'Mi entrenador me contó una buena noticia y lo celebramos juntos.', importance: 0.6, valence: 0.6 },
  affection: { content: 'Mi entrenador me dijo que me quiere.', importance: 0.55, valence: 0.8 },
  scold: { content: 'Mi entrenador me regañó y me sentí mal.', importance: 0.5, valence: -0.6 },
};

const EVOLUTION: Partial<Record<Intent, string>> = {
  sad_day: 'talk_comfort',
  affection: 'talk_comfort',
  scold: 'talk_scold',
  play_request: 'talk_play',
  explore_request: 'talk_play',
};

/**
 * Negación justo antes de lo que casa con una regla, con hasta tres palabras por medio:
 * «no estoy triste», «no ha sido un día malo», «I don't feel bad».
 */
const NEGATION = /(^|[\s,;.¡¿(])(no|nunca|jam[aá]s|tampoco|not|never|don'?t|doesn'?t|didn'?t|isn'?t|wasn'?t|can'?t)\s+(\S+\s+){0,3}$/i;

/** ¿Casa la regla sin estar negada? Un saludo no se niega: «no, hola» sigue siendo un saludo. */
function matches(rule: { intent: Intent; re: RegExp }, text: string): boolean {
  const m = rule.re.exec(text);
  if (!m) return false;
  if (rule.intent === 'greeting') return true;
  // Algunas reglas casan con el espacio que precede a la palabra: se cuenta como parte de lo anterior
  const start = m.index + (m[0].length - m[0].trimStart().length);
  return !NEGATION.test(text.slice(0, start));
}

export function interpretMessage(text: string): Interpretation {
  const t = (text ?? '').trim();
  let intent: Intent = 'chat';
  for (const r of RULES) {
    if (matches(r, t)) {
      intent = r.intent;
      break;
    }
  }
  if (intent === 'chat' && /\?\s*$/.test(t)) intent = 'question';
  return {
    intent,
    sentiment: SENTIMENT[intent],
    episode: EPISODES[intent] ?? null,
    evolutionEvent: EVOLUTION[intent],
  };
}
