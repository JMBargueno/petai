export type AppCategory =
  | 'coding'
  | 'music'
  | 'video'
  | 'gaming'
  | 'reading'
  | 'generic';

export interface ContextCategoryInfo {
  category: AppCategory;
  label: string;
  accessoryIcon: string; // Emoji o identificador de icono
  reactionComment: string;
}

const CODING_KEYWORDS = [
  'visual studio code',
  'vscode',
  'visual studio',
  'cursor',
  'sublime text',
  'intellij',
  'pycharm',
  'webstorm',
  'clion',
  'neovim',
  'vim',
  'windows terminal',
  'powershell',
  'command prompt',
  'cmd.exe',
  'git bash',
  'github desktop',
  'gitkraken',
  'postman',
  'docker',
];

const MUSIC_KEYWORDS = [
  'spotify',
  'apple music',
  'youtube music',
  'tidal',
  'foobar2000',
  'soundcloud',
  'deezer',
  'winamp',
  'audacity',
];

const VIDEO_KEYWORDS = [
  'youtube',
  'netflix',
  'twitch',
  'prime video',
  'disney+',
  'vlc media player',
  'mpc-hc',
  'plex',
  'crunchyroll',
  'anime',
];

const GAMING_KEYWORDS = [
  'steam',
  'epic games',
  'riot client',
  'league of legends',
  'valorant',
  'minecraft',
  'roblox',
  'battle.net',
  'ea app',
  'ubisoft connect',
  'gog galaxy',
];

const READING_KEYWORDS = [
  'notion',
  'obsidian',
  'word',
  'google docs',
  'acrobat',
  'pdf',
  'kindle',
  'wikipedia',
  'documentation',
  'stack overflow',
];

const BROWSER_KEYWORDS = ['google chrome', 'mozilla firefox', 'microsoft edge', 'brave', 'opera', 'vivaldi', 'safari'];

const CHAT_KEYWORDS = ['discord', 'slack', 'whatsapp', 'telegram', 'microsoft teams', 'signal', 'messenger'];

/**
 * Tema local de la ventana para elegir frases (navegador o mensajería). Se usa solo en el
 * escritorio: no forma parte de `AppCategory`, que es lo que viaja al servidor.
 */
export function localTopicOf(title: string): 'browser' | 'chat' | null {
  const lower = title.toLowerCase();
  if (CHAT_KEYWORDS.some((kw) => lower.includes(kw))) return 'chat';
  if (BROWSER_KEYWORDS.some((kw) => lower.includes(kw))) return 'browser';
  return null;
}

export function categorizeWindowTitle(title: string): ContextCategoryInfo {
  const lower = title.toLowerCase();

  // 1. Coding
  for (const kw of CODING_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        category: 'coding',
        label: 'Programando / Desarrollo',
        accessoryIcon: '👓',
        reactionComment: '¡Modo hacker activado! Concentración en el código 💻',
      };
    }
  }

  // 2. Music
  for (const kw of MUSIC_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        category: 'music',
        label: 'Escuchando Música',
        accessoryIcon: '🎵',
        reactionComment: '¡Buena música! Me dan ganas de bailar 🎶',
      };
    }
  }

  // 3. Video
  for (const kw of VIDEO_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        category: 'video',
        label: 'Viendo Vídeo',
        accessoryIcon: '🍿',
        reactionComment: 'Pasa las palomitas, ¡que empieza lo bueno! 🍿',
      };
    }
  }

  // 4. Gaming
  for (const kw of GAMING_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        category: 'gaming',
        label: 'Modo Juego',
        accessoryIcon: '🎮',
        reactionComment: '¡A por esa victoria! Estaré animando en silencio 🕹️',
      };
    }
  }

  // 5. Reading
  for (const kw of READING_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        category: 'reading',
        label: 'Lectura / Notas',
        accessoryIcon: '📖',
        reactionComment: 'Aprendiendo cosas nuevas... Qué interesante 📚',
      };
    }
  }

  return {
    category: 'generic',
    label: 'Escritorio',
    accessoryIcon: '✨',
    reactionComment: 'Aquí contigo en el escritorio 😊',
  };
}
