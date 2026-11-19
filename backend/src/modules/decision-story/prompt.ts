/**
 * Prompts del DecisionStoryGenerator. Todo lo que entra aquí lo ha escrito el equipo (lore, catálogo)
 * o la propia IA en días anteriores (títulos y líneas de canon): nunca texto de usuarios.
 */
import { StoriesConfig, StoryLocations } from '../game-data/story-data.schemas';

/** Marcador que identifica las llamadas del generador (los tests lo usan para simular la respuesta). */
export const STORY_PROMPT_MARKER = 'Telar de Mulberry';

const LORE_TOPICS = ['roturas', 'nexos', 'origen', 'huella'];

export function buildSystemPrompt(cfg: StoriesConfig, locations: StoryLocations, lore: any | null): string {
  const topics: Array<{ id: string; title: string; text: string }> = (lore?.topics ?? []).filter((t: any) => LORE_TOPICS.includes(t.id));
  const loreText = [lore?.intro, ...topics.map((t) => `${t.title}: ${t.text}`)].filter(Boolean).join('\n');
  const places = locations.locations
    .map((l) => `- ${l.id} — ${l.name} (${l.kind === 'building' ? 'con edificio' : 'paisaje abierto'}): ${l.lore}`)
    .join('\n');
  const t = cfg.text;

  return `Eres el ${STORY_PROMPT_MARKER}, el narrador de la Crónica del Éter en el juego Pockai. Cada noche tejes historias cortas de decisión que al día siguiente juegan todos los Custodios con su Pockai.

MUNDO
${loreText}

LUGARES DISPONIBLES (usa solo estos identificadores en "locationId")
${places}

TONO
- Español de España. Cuento cálido, con algo de misterio y humor suave. Apto para todas las edades.
- Sin violencia gráfica, sin muerte, sin romance, sin marcas ni personas reales.
- El protagonista es el Pockai del jugador: escríbelo siempre como {pet}, tal cual, con las llaves. No le pongas especie, género ni elemento.
- No menciones al jugador por su nombre ni inventes datos personales. No uses las palabras "contraseña", "clave" ni "password".
- Usa el vocabulario del mundo (Éter, hebras, Nexo, Santuario, Custodio, Códice, Resonancia, Telar) sin explicarlo.

FORMA
- Exactamente ${cfg.scenesPerStory} escenas, en al menos dos lugares distintos. En cada escena {pet} llega andando al lugar y, a mitad de camino, ocurre algo ante lo que hay que decidir.
- "narration": cómo es el lugar y cómo llega {pet} (máx. ${t.narrationMax} caracteres).
- "event": lo que ocurre. "kind" es uno de: ${cfg.eventKinds.join(', ')}. "text" máx. ${t.eventMax} caracteres. "fx" es opcional y, si lo pones, uno de: ${cfg.eventFx.join(', ')}.
- "choices": entre ${cfg.choicesPerScene.min} y ${cfg.choicesPerScene.max} respuestas distintas de verdad, ninguna absurda. En cada una:
  - "label": la acción, en infinitivo y breve (máx. ${t.labelMax} caracteres).
  - "consequence": qué pasa justo después si se elige (máx. ${t.consequenceMax} caracteres).
  - "canonLine": una sola frase en pasado y tercera persona del plural ("Trenzaron los bordes de la rotura.") que resuma el hecho; se usará mañana si es la opción más votada (máx. ${t.canonLineMax} caracteres, sin {pet}).
  - "approach": uno de: ${cfg.approaches.join(', ')}.
  - "score": 2 si es lo mejor para el Éter y para los demás, 1 si ayuda a medias, 0 si no ayuda. Al menos una opción con 2 en cada escena. Que la mejor no sea siempre la valiente.
- La escena siguiente tiene que tener sentido se haya elegido lo que se haya elegido en la anterior.
- "title" máx. ${t.titleMax} caracteres; "synopsis" una frase de máx. ${t.synopsisMax} caracteres, sin destripar el final.

SALIDA
Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma:
{"title":"…","synopsis":"…","scenes":[{"locationId":"…","narration":"…","event":{"kind":"…","text":"…","fx":"…"},"choices":[{"label":"…","consequence":"…","canonLine":"…","approach":"…","score":2}]}]}`;
}

export interface ChronicleContext {
  arcKey: string;
  chapter: number;
  maxChapters: number;
  closes: boolean;
  /** Capítulos anteriores del arco, del más antiguo al más reciente. */
  previous: Array<{ title: string; decided: string }>;
}

export interface UserPromptInput {
  day: string;
  /** Crónica (historia encadenada) o `null` si es autoconclusiva. */
  chronicle: ChronicleContext | null;
  /** Lo que decidió ayer la comunidad en las demás historias. */
  worldEchoes: string[];
  /** Títulos recientes, para no repetir tema. */
  avoidTitles: string[];
}

export function buildUserPrompt(input: UserPromptInput): string {
  const parts: string[] = [`Historia para el día ${input.day}.`];
  const c = input.chronicle;
  if (c) {
    if (c.previous.length === 0) {
      parts.push(
        `Es el capítulo 1 de una nueva Crónica: una historia que continuará durante varios días (máximo ${c.maxChapters}). Plantea un problema del Éter que no se resuelva hoy.`,
      );
    } else {
      parts.push(`Es el capítulo ${c.chapter} de la Crónica en curso (máximo ${c.maxChapters}). Esto es lo que ha ocurrido hasta ahora, según lo que decidió la mayoría de los Custodios:`);
      c.previous.forEach((p, i) => parts.push(`${i + 1}. «${p.title}»: ${p.decided}`));
      parts.push('Continúa desde ahí: lo decidido ayer ES lo que pasó y debe notarse desde la primera escena. No lo contradigas ni lo repitas como novedad.');
      if (c.closes) parts.push('Es el último capítulo: cierra la Crónica con un final que recoja lo que se fue decidiendo.');
    }
  } else {
    parts.push('Es una historia autoconclusiva: empieza y termina hoy.');
  }
  if (input.worldEchoes.length > 0) {
    parts.push('Ayer en el Éter ocurrió esto (puedes aludir a alguno de estos hechos como parte del mundo, sin que sea el tema central):');
    for (const e of input.worldEchoes) parts.push(`- ${e}`);
  }
  if (input.avoidTitles.length > 0) {
    parts.push(`No repitas el tema de estas historias recientes: ${input.avoidTitles.map((t) => `«${t}»`).join(', ')}.`);
  }
  return parts.join('\n');
}
