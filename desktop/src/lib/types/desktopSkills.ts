export type SkillCategory = 'playful' | 'productivity';

export interface DesktopSkillDefinition {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  permissionNotice?: string;
  requiredBonding: number;      // 0 a 100
  requiredIntelligence: number; // 1 a 3 (1: Chat, 2: Memoria, 3: Agente)
  defaultEnabled: boolean;
  /** Mueble del hábitat que hay que tener colocado para desbloquearla (spec 42). */
  requiredFurniture?: { id: string; name: string };
}

export const DESKTOP_SKILLS: DesktopSkillDefinition[] = [
  // --- LÚDICAS Y PANTALLA ---
  {
    id: 'drag_throw',
    name: 'Físicas y Lanzamiento (Drag & Throw)',
    category: 'playful',
    description: 'Al soltar a la mascota con impulso sale lanzada y rebota con gravedad y físicas 2D. Arrastrarla para moverla o llevarla a casa se puede siempre.',
    requiredBonding: 0,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'climb_walls',
    name: 'Trepar Bordes y Pantalla',
    category: 'playful',
    description: 'La mascota puede subir por los laterales de la pantalla y colgarse boca abajo del borde superior.',
    requiredBonding: 10,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'window_perching',
    name: 'Posarse en Ventanas Activas',
    category: 'playful',
    description: 'Detecta la ventana que estás usando (navegador, editor, terminal) y se posa sobre su barra de título.',
    permissionNotice: 'Consulta la posición y el tamaño de la ventana que tienes en primer plano. No lee su contenido. Solo funciona en Windows.',
    requiredBonding: 15,
    requiredIntelligence: 2,
    defaultEnabled: false,
  },
  {
    id: 'cursor_play',
    name: 'Jugar con el Cursor',
    category: 'playful',
    description: 'Acecha el cursor cuando se queda quieto, lo persigue cuando pasa deprisa y, según su carácter, lo acompaña de cerca o se aparta de él.',
    permissionNotice: 'Usa la posición del cursor en la pantalla. No sale de este equipo.',
    requiredBonding: 5,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'presence_sense',
    name: 'Notar tu Presencia',
    category: 'playful',
    description: 'Se echa una siesta cuando te alejas del equipo, te recibe al volver y te anima cuando llevas un rato tecleando.',
    permissionNotice: 'Consulta cuánto tiempo llevas sin usar el teclado o el ratón. No lee qué tecleas y no sale de este equipo.',
    requiredBonding: 10,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'flow_talent',
    name: 'Talento del Flujo',
    category: 'playful',
    description: 'De vez en cuando luce un gesto propio de su elemento: una llamarada a la carrera, un destello de agua, un chispazo en zigzag...',
    requiredBonding: 40,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },

  // --- PRODUCTIVIDAD Y ASISTENTE ---
  {
    id: 'quick_summon',
    name: 'Invocación Rápida (Atajo Global)',
    category: 'productivity',
    description: 'Llama a la mascota de inmediato a la posición de tu cursor con un atajo o click para interactuar rápidamente.',
    requiredBonding: 0,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'pomodoro_companion',
    name: 'Compañero de Enfoque (Pomodoro)',
    category: 'productivity',
    description: 'Temporizador de trabajo y descanso. Se sienta en silencio mientras te concentras y te avisa cuando toca una pausa.',
    requiredBonding: 20,
    requiredIntelligence: 1,
    defaultEnabled: true,
  },
  {
    id: 'ambient_mixer',
    name: 'Música Ambiente (MP3)',
    category: 'productivity',
    description: 'Temas lofi en bucle y sonidos de ambiente (lluvia, trueno, viento, grillos, pájaros) que puedes mezclar por capas. Tu Pockai lleva el reproductor flotando a su lado.',
    requiredBonding: 0,
    requiredIntelligence: 1,
    defaultEnabled: true,
    requiredFurniture: { id: 'mp3', name: 'Reproductor MP3' },
  },
  {
    id: 'context_awareness',
    name: 'Conciencia de la App en Foco',
    category: 'productivity',
    description: 'Reacciona al programa en el que estás trabajando (se pone gafas para código, baila con música, o se oculta en juegos).',
    permissionNotice: 'Lee el título de la ventana en primer plano para saber qué tipo de programa es. No registra su contenido ni las pulsaciones de teclas.',
    requiredBonding: 25,
    requiredIntelligence: 2,
    defaultEnabled: false,
  },
  {
    id: 'file_analyzer',
    name: 'Analizador de Archivos (Drag & Drop)',
    category: 'productivity',
    description: 'Suelta archivos (PDF, código, imágenes) sobre la mascota para que su IA te dé resúmenes o explicaciones.',
    permissionNotice: 'Solo lee los archivos que arrastres deliberadamente sobre la mascota.',
    requiredBonding: 30,
    requiredIntelligence: 3,
    defaultEnabled: false,
  },
];
