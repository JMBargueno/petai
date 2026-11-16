export interface AnalyzedFile {
  name: string;
  size: number;
  sizeFormatted: string;
  extension: string;
  category: 'code' | 'document' | 'data' | 'image' | 'binary';
  typeLabel: string;
  isText: boolean;
  snippet?: string;
  suggestedActions: string[];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectFileType(filename: string): {
  extension: string;
  category: AnalyzedFile['category'];
  typeLabel: string;
  isText: boolean;
  suggestedActions: string[];
} {
  const parts = filename.split('.');
  const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';

  // Código
  if (['ts', 'js', 'py', 'rs', 'svelte', 'html', 'css', 'cpp', 'c', 'go', 'java', 'php', 'rb'].includes(ext)) {
    return {
      extension: ext,
      category: 'code',
      typeLabel: `Código fuente (.${ext})`,
      isText: true,
      suggestedActions: [
        'Explicar qué hace este código',
        'Buscar posibles bugs o mejoras',
        'Generar tests para este archivo',
      ],
    };
  }

  // Datos
  if (['json', 'csv', 'yaml', 'yml', 'xml', 'sql'].includes(ext)) {
    return {
      extension: ext,
      category: 'data',
      typeLabel: `Archivo de datos (.${ext})`,
      isText: true,
      suggestedActions: [
        'Analizar estructura y campos principales',
        'Extraer un resumen de los datos',
        'Verificar si hay inconsistencias',
      ],
    };
  }

  // Documentos
  if (['md', 'txt', 'rtf', 'log'].includes(ext)) {
    return {
      extension: ext,
      category: 'document',
      typeLabel: `Documento de texto (.${ext})`,
      isText: true,
      suggestedActions: [
        'Resumir los puntos clave',
        'Corregir redacción y ortografía',
        'Crear una lista de conclusiones',
      ],
    };
  }

  // Imágenes
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) {
    return {
      extension: ext,
      category: 'image',
      typeLabel: `Imagen (.${ext})`,
      isText: false,
      suggestedActions: [
        'Analizar dimensiones y formato',
        '¿Cómo usar este asset en PetAI?',
      ],
    };
  }

  // PDF y binarios
  if (ext === 'pdf') {
    return {
      extension: ext,
      category: 'document',
      typeLabel: 'Documento PDF',
      isText: false,
      suggestedActions: [
        '¿Cómo extraer texto o resumir este PDF?',
      ],
    };
  }

  return {
    extension: ext,
    category: 'binary',
    typeLabel: ext ? `Archivo .${ext}` : 'Archivo',
    isText: false,
    suggestedActions: [
      '¿Qué tipo de archivo es este?',
    ],
  };
}

export async function analyzeDroppedFile(file: File): Promise<AnalyzedFile> {
  const meta = detectFileType(file.name);
  let snippet: string | undefined;

  if (meta.isText && file.size < 500 * 1024) {
    try {
      const fullText = await file.text();
      snippet = fullText.slice(0, 2500);
      if (fullText.length > 2500) {
        snippet += '\n\n... [archivo truncado a los primeros 2500 caracteres]';
      }
    } catch (err) {
      console.warn('[fileAnalyzer] Error leyendo archivo de texto:', err);
    }
  }

  return {
    name: file.name,
    size: file.size,
    sizeFormatted: formatFileSize(file.size),
    extension: meta.extension,
    category: meta.category,
    typeLabel: meta.typeLabel,
    isText: meta.isText,
    snippet,
    suggestedActions: meta.suggestedActions,
  };
}

/** Límite del mensaje de chat en el servidor (MAX_MESSAGE_CHARS en backend/src/modules/ai/chat.service.ts). */
export const CHAT_MESSAGE_MAX = 1000;

/**
 * Mensaje para el chat sobre un archivo soltado. Cabe siempre en el límite del servidor:
 * la pregunta y el nombre van enteros (acotados) y el contenido se recorta para encajar.
 */
export function buildFilePrompt(file: Pick<AnalyzedFile, 'name' | 'typeLabel' | 'snippet'>, question: string, max = CHAT_MESSAGE_MAX): string {
  const name = file.name.length > 80 ? `${file.name.slice(0, 77)}...` : file.name;
  const head = `Sobre el archivo "${name}" (${file.typeLabel}):\n${question.trim().slice(0, 300)}`;
  if (!file.snippet) return head.slice(0, max);
  const open = '\n\nContenido:\n```\n';
  const close = '\n```';
  const cut = '\n... [recortado]';
  const room = max - head.length - open.length - close.length;
  if (room < 80) return head.slice(0, max);
  const body = file.snippet.length <= room ? file.snippet : file.snippet.slice(0, room - cut.length) + cut;
  return head + open + body + close;
}
