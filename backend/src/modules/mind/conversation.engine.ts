import { text } from './strings';
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
  | 'chat'
  // Spec 37 §4.7
  | 'ask_life'
  | 'ask_friend'
  | 'praise'
  | 'apology'
  | 'gift'
  | 'teach';

export interface Interpretation {
  intent: Intent;
  /** -1 (muy negativo) .. 1 (muy positivo) */
  sentiment: number;
  /** Paráfrasis para la memoria episódica, o null si no merece recordarse. */
  episode: { content: string; importance: number; valence: number } | null;
  /** Evento de evolución que provoca el propio mensaje (además de 'chat'). */
  evolutionEvent?: string;
  /** Nombre propio por el que pregunta (`ask_friend`: «¿cómo está Brasa?»). */
  mentioned?: string;
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
  { intent: 'apology', re: /(perd[oó]n(a(me)?)?\b|lo\s+siento|disc[uú]lpa(me)?\b|i'?m\s+(so\s+)?sorry|\bsorry\b|forgive\s+me)/i },
  {
    intent: 'praise',
    re: /(qu[eé]\s+bien\s+lo\s+has\s+hecho|muy\s+bien\s+hecho|bien\s+hecho|buen\s+trabajo|estoy\s+orgullos[oa]\s+de\s+ti|eres\s+(muy\s+)?(list[oa]|buen[oa]|valiente|genial)\b|good\s+(job|boy|girl)|well\s+done|proud\s+of\s+you)/i,
  },
  {
    intent: 'gift',
    re: /(te\s+he\s+tra[ií]do|te\s+traigo|tengo\s+(un\s+regalo|una\s+sorpresa|algo)\s+para\s+ti|un\s+regalo\s+para\s+ti|i\s+(brought|got)\s+you|a\s+(gift|present)\s+for\s+you)/i,
  },
  {
    intent: 'teach',
    re: /(aprender\s+un\s+truco|ense[ñn]ar(te)?\s+un\s+truco|te\s+ense[ñn]o\s+un\s+truco|vamos\s+a\s+practicar|practi(car|quemos)\s+(el|un|tu)\s+truco|learn\s+a\s+trick|teach\s+you\s+a\s+trick|practice\s+(the|a|your)\s+trick)/i,
  },
  {
    intent: 'ask_life',
    re: /(qu[eé]\s+has\s+hecho|qu[eé]\s+hiciste|qu[eé]\s+tal\s+(el|tu)\s+d[ií]a|c[oó]mo\s+te\s+ha\s+ido|qu[eé]\s+me\s+cuentas|cu[eé]ntame\s+(algo|qu[eé])|what\s+(have\s+you\s+been\s+up\s+to|did\s+you\s+do)|how\s+was\s+your\s+day)/i,
  },
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
  ask_life: 0.1,
  ask_friend: 0.1,
  praise: 0.7,
  apology: 0.4,
  gift: 0.6,
  teach: 0.3,
};

const EPISODES: Partial<Record<Intent, { line: string; importance: number; valence: number }>> = {
  sad_day: { line: 'EP_SAD_DAY', importance: 0.65, valence: -0.2 },
  good_news: { line: 'EP_GOOD_NEWS', importance: 0.6, valence: 0.6 },
  affection: { line: 'EP_AFFECTION', importance: 0.55, valence: 0.8 },
  scold: { line: 'EP_SCOLD', importance: 0.5, valence: -0.6 },
  praise: { line: 'EP_PRAISE', importance: 0.5, valence: 0.7 },
  apology: { line: 'EP_APOLOGY', importance: 0.5, valence: 0.5 },
  gift: { line: 'EP_GIFT', importance: 0.45, valence: 0.6 },
};

/** Episodio de plantilla de una intención, con el texto ya resuelto (los recuerdos guardan texto). */
function episodeOf(intent: Intent): Interpretation['episode'] {
  const ep = EPISODES[intent];
  return ep ? { content: text(ep.line), importance: ep.importance, valence: ep.valence } : null;
}

const EVOLUTION: Partial<Record<Intent, string>> = {
  sad_day: 'talk_comfort',
  affection: 'talk_comfort',
  scold: 'talk_scold',
  play_request: 'talk_play',
  explore_request: 'talk_play',
  praise: 'talk_comfort',
  apology: 'talk_comfort',
  teach: 'talk_play',
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

const NAME = '([A-ZÁÉÍÓÚÑ][\\p{L}]{1,23})';
const ASK_FRIEND = new RegExp(
  `(?:[Cc][oó]mo\\s+est[aá]|[Qq]u[eé]\\s+tal\\s+(?:est[aá]\\s+|con\\s+)?|[Hh]as\\s+visto\\s+a|[Tt]e\\s+acuerdas\\s+de|[Ss]abes\\s+algo\\s+de|[Hh]ow\\s+is|[Hh]ave\\s+you\\s+seen|[Dd]o\\s+you\\s+remember)\\s+${NAME}`,
  'u',
);

export function interpretMessage(text: string): Interpretation {
  const t = (text ?? '').trim();
  let intent: Intent = 'chat';
  for (const r of RULES) {
    if (matches(r, t)) {
      intent = r.intent;
      break;
    }
  }
  // «¿Cómo está Brasa?»: pregunta por alguien con nombre propio. La mayúscula del nombre es lo
  // que lo distingue de «¿cómo estás?», así que esta regla no puede ignorar mayúsculas.
  let mentioned: string | undefined;
  if (intent === 'chat' || intent === 'greeting') {
    const m = ASK_FRIEND.exec(t);
    if (m && !NEGATION.test(t.slice(0, m.index))) {
      intent = 'ask_friend';
      mentioned = m[1];
    }
  }
  if (intent === 'chat' && /\?\s*$/.test(t)) intent = 'question';
  return {
    intent,
    ...(mentioned ? { mentioned } : {}),
    sentiment: SENTIMENT[intent],
    episode: episodeOf(intent),
    evolutionEvent: EVOLUTION[intent],
  };
}
