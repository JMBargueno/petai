/**
 * Lo que el Pockai ha aprendido que a su entrenador le gusta verle hacer (spec 41, fase D).
 *
 * El cerebro del escritorio decide en local, así que el gesto se aplica aquí al momento con la
 * librería compartida, y a la vez se envía al servidor, que es quien lo guarda y quien manda: su
 * respuesta sustituye a lo calculado aquí. Sin red, lo aprendido dura lo que la sesión.
 */
import { writable } from 'svelte/store';
import { emptyLearned, normalizeLearned, reinforce, strongestPrefs, type Learned, type LearningConfig } from '@pockai/mind';
import balance from '../../../../shared/game-data/balance.json';

export const LEARNING_CONFIG = (balance as unknown as { personality: { learning: LearningConfig } }).personality.learning;

const KNOWN = Object.keys((balance as unknown as { personality: { desktop: { behaviors: Record<string, unknown> } } }).personality.desktop.behaviors);

/** Nombre de cada conducta tal como se le cuenta al entrenador («le gusta verle…»). */
export const BEHAVIOR_LABEL: Record<string, string> = {
  stroll: 'pasear',
  look_around: 'curiosear',
  rest_sit: 'sentarse a descansar',
  zoomies: 'corretear',
  peek_edge: 'asomarse por el borde',
  high_five_offer: 'chocar los cinco',
  mood_express: 'mostrar cómo está',
  time_routine: 'sus rutinas del día',
  dance: 'bailar',
  retreat_corner: 'retirarse a un rincón',
  cursor_stalk: 'acechar el cursor',
  cursor_chase: 'perseguir el cursor',
  cursor_follow: 'seguir el cursor',
  cursor_shy: 'apartarse del cursor',
  typing_cheer: 'animarte mientras escribes',
  climb: 'trepar',
  perch_window: 'posarse en una ventana',
  flow_talent: 'lucir su talento',
};

/** Preferencias de la mascota activa: conducta → de -1 a 1. */
export const petLearned = writable<Record<string, number>>({});

let activePetId: string | null = null;
let state: Learned = emptyLearned();

function set(next: Learned) {
  state = next;
  petLearned.set(next.prefs);
}

/** Cambia de mascota: se empieza sin nada hasta que el servidor diga qué sabe. */
export function useLearnedOf(petId: string | null) {
  if (petId === activePetId) return;
  activePetId = petId;
  set(emptyLearned());
}

/** Extrae lo aprendido de la respuesta de `GET /pets/:id/mind` (ausente con un servidor anterior). */
export function rememberLearned(petId: string, mind: unknown, now = Date.now()) {
  if (petId !== activePetId) return;
  const prefs = (mind as { learned?: { prefs?: unknown } } | null)?.learned?.prefs;
  if (!prefs) return;
  set({ ...normalizeLearned({ prefs }, KNOWN), at: now, day: state.day, count: state.count });
}

type Send = (petId: string, behavior: string, signal: string) => Promise<{ prefs?: Record<string, number> } | null | undefined>;

/**
 * El entrenador ha hecho un gesto mientras el Pockai hacía `behavior` (o justo después).
 * Devuelve si se aplicó aquí. El envío al servidor no bloquea ni rompe nada si falla.
 */
export function rewardBehavior(behavior: string | null, signal: string, send: Send, now = Date.now()): boolean {
  const petId = activePetId;
  if (!petId || !behavior || !KNOWN.includes(behavior)) return false;
  const result = reinforce(state, behavior, signal, now, LEARNING_CONFIG);
  if (!result.applied) return false;
  set(result.state);
  void send(petId, behavior, signal)
    .then((reply) => {
      if (reply?.prefs && petId === activePetId) set({ ...state, prefs: normalizeLearned({ prefs: reply.prefs }, KNOWN).prefs });
    })
    .catch(() => {
      // Sin red: lo aprendido sigue valiendo en esta sesión
    });
  return true;
}

/** Texto para la pestaña Mente: qué le gusta a su entrenador y qué no, de más a menos claro. */
export function describeLearned(prefs: Record<string, number> | null | undefined): { likes: string[]; dislikes: string[] } {
  const top = strongestPrefs(prefs ?? {}, 6).filter((p) => BEHAVIOR_LABEL[p.id]);
  return {
    likes: top.filter((p) => p.value > 0).slice(0, 3).map((p) => BEHAVIOR_LABEL[p.id]),
    dislikes: top.filter((p) => p.value < 0).slice(0, 3).map((p) => BEHAVIOR_LABEL[p.id]),
  };
}

/** Solo para tests. */
export function resetLearnedForTests() {
  activePetId = null;
  set(emptyLearned());
}
