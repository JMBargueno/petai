/**
 * Registro de las habilidades de escritorio visto desde el servidor (funciones puras).
 *
 * Debe coincidir con `desktop/src/lib/types/desktopSkills.ts` (ids, umbrales y valor por
 * defecto). Un test del escritorio importa este archivo y compara ambos registros, así que
 * un cambio en uno sin el otro rompe los tests.
 */

export interface DesktopSkillInfo {
  id: string;
  /** Nombre corto para el prompt y las tarjetas de confirmación. */
  name: string;
  requiredBonding: number; // 0..100
  requiredIntelligence: 1 | 2 | 3; // 1 charla, 2 memoria, 3 agente
  defaultEnabled: boolean;
  /** Pide un permiso sensible: la tarjeta de confirmación lo recuerda. */
  sensitive: boolean;
  /** Qué hace, en primera persona, cuando está activa. */
  active: string;
  /** Cómo la usa el entrenador (para que la mascota sepa explicarlo). */
  howTo: string;
}

export const DESKTOP_SKILL_REGISTRY: DesktopSkillInfo[] = [
  {
    id: 'drag_throw',
    name: 'Físicas y lanzamiento',
    requiredBonding: 0,
    requiredIntelligence: 1,
    defaultEnabled: true,
    sensitive: false,
    active: 'Tu entrenador puede agarrarte con el ratón y lanzarte para que rebotes con físicas por la pantalla.',
    howTo: 'arrastrarme con el ratón y soltarme con impulso',
  },
  {
    id: 'climb_walls',
    name: 'Trepar bordes',
    requiredBonding: 10,
    requiredIntelligence: 1,
    defaultEnabled: true,
    sensitive: false,
    active: 'Puedes trepar por los laterales de la pantalla y colgarte boca abajo del borde superior.',
    howTo: 'lo hago yo solo cuando paseo cerca de los bordes',
  },
  {
    id: 'window_perching',
    name: 'Posarse en ventanas',
    requiredBonding: 15,
    requiredIntelligence: 2,
    defaultEnabled: false,
    sensitive: true,
    active: 'Puedes posarte sobre la barra de título de la ventana que tu entrenador está usando.',
    howTo: 'me subo yo solo a la ventana activa',
  },
  {
    id: 'quick_summon',
    name: 'Invocación rápida',
    requiredBonding: 0,
    requiredIntelligence: 1,
    defaultEnabled: true,
    sensitive: false,
    active: 'Tu entrenador puede llamarte junto a su cursor con un atajo de teclado global.',
    howTo: 'pulsar el atajo global (se configura en Ajustes)',
  },
  {
    id: 'pomodoro_companion',
    name: 'Compañero Pomodoro',
    requiredBonding: 20,
    requiredIntelligence: 1,
    defaultEnabled: true,
    sensitive: false,
    active: 'Acompañas a tu entrenador en sesiones de foco Pomodoro y le recuerdas descansar.',
    howTo: 'pedirme un pomodoro o abrir el temporizador junto a mí',
  },
  {
    id: 'context_awareness',
    name: 'Conciencia de la app en foco',
    requiredBonding: 25,
    requiredIntelligence: 2,
    defaultEnabled: false,
    sensitive: true,
    active: 'Sabes qué tipo de programa usa tu entrenador (código, música, vídeo, juegos, lectura) y reaccionas a ello.',
    howTo: 'lo noto yo solo; solo veo el tipo de programa, nunca lo que escribes',
  },
  {
    id: 'file_analyzer',
    name: 'Analizador de archivos',
    requiredBonding: 30,
    requiredIntelligence: 3,
    defaultEnabled: false,
    sensitive: true,
    active: 'Puedes analizar archivos que tu entrenador te suelte encima (código, texto, datos o imágenes).',
    howTo: 'arrastrar un archivo y soltarlo sobre mí',
  },
];

export const DESKTOP_SKILL_IDS = DESKTOP_SKILL_REGISTRY.map((s) => s.id);
const BY_ID = new Map(DESKTOP_SKILL_REGISTRY.map((s) => [s.id, s]));

export function getDesktopSkill(id: string): DesktopSkillInfo | undefined {
  return BY_ID.get(id);
}

/** Puntos de inteligencia (0..1000) → nivel de IA 1..3 (mismo criterio que el escritorio). */
export function intelligenceLevel(points: number): 1 | 2 | 3 {
  if (points >= 500) return 3;
  if (points >= 200) return 2;
  return 1;
}

const LEVEL_NAME: Record<number, string> = { 1: 'Charla', 2: 'Memoria', 3: 'Agente' };

export type SkillState =
  | { state: 'active' }
  | { state: 'off' }
  | { state: 'locked'; missingBonding: number; missingLevel: number | null };

export function skillStateOf(
  skill: DesktopSkillInfo,
  authorizations: Record<string, unknown> | null | undefined,
  pet: { bonding?: number | null; intelligence?: number | null },
): SkillState {
  // Un valor no numérico cuenta como 0 (NaN haría que la comprobación de bloqueo fallara abierta)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const bonding = Math.round(num(pet.bonding));
  const level = intelligenceLevel(num(pet.intelligence));
  if (bonding < skill.requiredBonding || level < skill.requiredIntelligence) {
    return {
      state: 'locked',
      missingBonding: Math.max(0, skill.requiredBonding - bonding),
      missingLevel: level < skill.requiredIntelligence ? skill.requiredIntelligence : null,
    };
  }
  const raw = authorizations && typeof authorizations === 'object' ? authorizations[skill.id] : undefined;
  const enabled = typeof raw === 'boolean' ? raw : skill.defaultEnabled;
  return { state: enabled ? 'active' : 'off' };
}

/**
 * Bloque del prompt con el catálogo completo: activas, apagadas por el entrenador y
 * bloqueadas (con lo que falta), para que la mascota sepa explicar y sugerir.
 */
export function buildDesktopSkillsBlock(
  pet: { desktopSkills?: unknown; bonding?: number | null; intelligence?: number | null },
  opts: { canToggle?: boolean } = {},
): string {
  const auth = (pet.desktopSkills && typeof pet.desktopSkills === 'object' ? pet.desktopSkills : {}) as Record<string, unknown>;
  const active: string[] = [];
  const off: string[] = [];
  const locked: string[] = [];
  for (const skill of DESKTOP_SKILL_REGISTRY) {
    const st = skillStateOf(skill, auth, pet);
    if (st.state === 'active') active.push(`- ${skill.active} (Cómo: ${skill.howTo}.)`);
    else if (st.state === 'off') off.push(`- ${skill.name} [${skill.id}]`);
    else {
      const needs: string[] = [];
      if (st.missingBonding > 0) needs.push(`${st.missingBonding} puntos más de vínculo`);
      if (st.missingLevel) needs.push(`nivel de IA ${LEVEL_NAME[st.missingLevel]}`);
      locked.push(`- ${skill.name}: te falta ${needs.join(' y ')}`);
    }
  }
  const parts = ['Tus habilidades de escritorio (en la app de escritorio):'];
  parts.push(active.length ? `Activas:\n${active.join('\n')}` : 'Activas: ninguna.');
  if (off.length) {
    parts.push(
      `Desbloqueadas pero apagadas por tu entrenador:\n${off.join('\n')}\n` +
        (opts.canToggle
          ? 'Si te pide activar o desactivar una, usa la herramienta toggle_desktop_skill con su id.'
          : 'Si quiere activarlas, puede hacerlo en Mascota → Habilidades.'),
    );
  }
  if (locked.length) parts.push(`Aún bloqueadas (no puedes usarlas todavía):\n${locked.join('\n')}`);
  parts.push('No digas que haces cosas de una habilidad apagada o bloqueada.');
  return parts.join('\n');
}
