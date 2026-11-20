/** Lo que el Pockai ha aprendido que le gusta a su entrenador, contado en palabras (spec 41, fase D). */
import { strongestPrefs } from '@pockai/mind';

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

/** Texto para la pestaña Mente: qué le gusta a su entrenador y qué no, de más a menos claro. */
export function describeLearned(prefs: Record<string, number> | null | undefined): { likes: string[]; dislikes: string[] } {
  const top = strongestPrefs(prefs ?? {}, 6).filter((p) => BEHAVIOR_LABEL[p.id]);
  return {
    likes: top.filter((p) => p.value > 0).slice(0, 3).map((p) => BEHAVIOR_LABEL[p.id]),
    dislikes: top.filter((p) => p.value < 0).slice(0, 3).map((p) => BEHAVIOR_LABEL[p.id]),
  };
}
