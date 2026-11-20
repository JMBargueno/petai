/**
 * La mazmorra de Entrenamiento vista desde la pantalla: en qué piso vas, cuántos corazones quedan y
 * qué decir al terminar. Funciones puras: cada contenedor guarda la sesión y la va pasando por aquí
 * con lo que responde el servidor, así escritorio y móvil cuentan lo mismo.
 */
import { elementMeta } from './maps';

export const TRAINING_FLOORS = 5;
export const TRAINING_ELEMENTS = ['fire', 'water', 'plant', 'electric', 'shadow', 'light'] as const;

export type TrainingSession = {
  /** Pisos de la mazmorra; `null` si se retoma una sesión iniciada en otro momento. */
  floors: any[] | null;
  active: boolean;
  hearts: number;
  currentFloor: number;
  /** Elemento real de cada piso ya jugado (se descubre al enviar). */
  revealed: Record<number, string>;
  /** Último turno jugado (respuesta del servidor). */
  last: any;
  finalMsg: string;
  finalOk: boolean;
  /** Aviso informativo (no es un error): p. ej. que se retoma una sesión a medias. */
  info: string;
  /** Al retomar una sesión no se conocen corazones ni piso hasta jugar un turno. */
  unknownState: boolean;
};

export const TRAINING_IDLE: TrainingSession = {
  floors: null,
  active: false,
  hearts: 3,
  currentFloor: 0,
  revealed: {},
  last: null,
  finalMsg: '',
  finalOk: true,
  info: '',
  unknownState: false,
};

/** Respuesta de `POST /training/start`. */
export function trainingStarted(res: { floors: any[]; hearts: number; currentFloor: number }): TrainingSession {
  return { ...TRAINING_IDLE, floors: res.floors, hearts: res.hearts, currentFloor: res.currentFloor, active: true };
}

/** El servidor dice que ya hay una sesión a medias: se puede seguir eligiendo, aunque sin datos de los pisos. */
export function trainingResumeFrom(message: string | undefined): TrainingSession | null {
  if (!/sesión de entrenamiento activa/i.test(message ?? '')) return null;
  return {
    ...TRAINING_IDLE,
    active: true,
    unknownState: true,
    info: 'Tienes un entrenamiento a medias: sigue donde lo dejaste. Verás tus corazones y el piso en cuanto elijas un elemento.',
  };
}

/** Un fallo al elegir que significa que la sesión ya no existe. */
export function trainingGone(message: string | undefined): boolean {
  return /no hay sesión|expirado/i.test(message ?? '');
}

/** ¿Se puede (y conviene) mandar la predicción del jefe final en este turno? */
export function trainingAsksPrediction(s: TrainingSession): boolean {
  return s.currentFloor === TRAINING_FLOORS - 1 || s.unknownState;
}

/** Respuesta de `POST /training/submit`. `finished`: la mazmorra ha terminado (saldo y mascota cambian). */
export function trainingAfterSubmit(s: TrainingSession, res: any): { session: TrainingSession; finished: boolean } {
  const next: TrainingSession = {
    ...s,
    last: res,
    revealed: { ...s.revealed, [res.floor]: res.enemyElement },
    hearts: res.hearts,
    currentFloor: res.currentFloor,
    unknownState: false,
    info: '',
  };
  if (res.status === 'active') return { session: next, finished: false };
  const ok = res.status === 'completed';
  next.active = false;
  next.finalOk = ok;
  next.finalMsg = ok
    ? `¡Mazmorra superada! +${res.xp ?? 0} XP, +${res.coins ?? 0} monedas` +
      (res.buff ? ` · bonificación ×${(1 + res.buff.multiplier).toFixed(2)} durante 24 h` : '') +
      (res.predictionBonus ? ' · ¡predicción acertada!' : '') +
      (res.bonusItem ? ` · ¡Ha caído ${res.bonusItem.name}! Está en tu Mochila.` : '')
    : `Te has quedado sin corazones en el piso ${res.floor + 1}.` + (res.xp ? ` +${res.xp} XP, +${res.coins ?? 0} monedas` : '');
  return { session: next, finished: true };
}

/** Qué ha pasado en un turno: «Fuego contra Planta: ¡ventaja elemental! Piso superado.» */
export function trainingResultText(r: { playerElement: string; enemyElement: string; result: string }): string {
  const vs = `${elementMeta(r.playerElement).label} contra ${elementMeta(r.enemyElement).label}`;
  if (r.result === 'advanced' || r.result === 'completed') return `${vs}: ¡ventaja elemental! Piso superado.`;
  return `${vs}: sin ventaja, pierdes un corazón.`;
}
