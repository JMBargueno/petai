import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * SandboxService — Feature 024 (Modding).
 *
 * Los mods son SOLO datos (JSON + SVG), nunca código server-side. Este servicio valida
 * los assets en el momento de publicarlo:
 *  - `validateSprite`: sanitiza el SVG (elimina scripts, handlers on*, foreignObject y
 *    URLs externas) y limita el tamaño a 500KB.
 *  - `validateMinigame`: valida el bundle JS del minigame (≤500KB, sin eval/import) y
 *    expone la configuración de aislamiento del Web Worker (timeout 60s, memory 10MB,
 *    API limitada). El minigame corre 100% en el cliente; el backend jamás lo ejecuta.
 */
export interface MinigameSandboxConfig {
  /** Timeout máximo del worker antes de forzar la finalización (ms). */
  timeoutMs: number;
  /** Límite de memoria del worker (bytes). */
  memoryLimitBytes: number;
  /** APIs permitidas vía postMessage (todo lo demás queda aislado). */
  allowedApis: string[];
  /** No acceso a DOM, red, storage ni contexto padre. */
  restricted: string[];
}

const MAX_SPRITE_BYTES = 500 * 1024; // 500KB
const MAX_MINIGAME_BYTES = 500 * 1024; // 500KB

@Injectable()
export class SandboxService {
  private readonly DANGEROUS_SVG_PATTERNS: RegExp[] = [
    /<script\b/i,
    /<foreignobject\b/i,
    /\bon[a-z]+\s*=/i, // handlers on* (onclick, onerror, …)
    /javascript\s*:/i,
    /data\s*:\s*text\/html/i,
    /<iframe\b/i,
    /<embed\b/i,
    /<object\b/i,
    /xlink:href\s*=\s*["']\s*(https?:|\/\/)/i,
    /href\s*=\s*["']\s*(https?:|\/\/)/i,
  ];

  private readonly DANGEROUS_JS_PATTERNS: RegExp[] = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\bdocument\b/i,
    /\bwindow\b/i,
    /\bimport\s+["']/,
    /require\s*\(\s*["']/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
  ];

  /**
   * Valida un SVG y lo devuelve sanitizado. Lanza `BadRequestException` si contiene
   * patrones peligrosos o supera el tamaño máximo.
   */
  validateSprite(svg: string | undefined | null): string {
    if (!svg || typeof svg !== 'string') {
      throw new BadRequestException('SVG vacío: falta el sprite');
    }
    if (Buffer.byteLength(svg, 'utf8') > MAX_SPRITE_BYTES) {
      throw new BadRequestException(`SVG demasiado grande (máx ${MAX_SPRITE_BYTES / 1024}KB)`);
    }
    if (!/<svg[\s>]/i.test(svg)) {
      throw new BadRequestException('El sprite no es un SVG válido');
    }
    for (const pattern of this.DANGEROUS_SVG_PATTERNS) {
      if (pattern.test(svg)) {
        throw new BadRequestException('SVG contiene contenido no permitido (scripts/handlers/URLs externas)');
      }
    }
    return svg;
  }

  /**
   * Valida el bundle JS de un minigame custom. El código corre en un Web Worker sandbox
   * en el cliente; aquí solo verificamos tamaño y ausencia de primitivas peligrosas.
   */
  validateMinigame(code: string | undefined | null): string {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Minigame sin código');
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_MINIGAME_BYTES) {
      throw new BadRequestException(`Minigame demasiado grande (máx ${MAX_MINIGAME_BYTES / 1024}KB)`);
    }
    for (const pattern of this.DANGEROUS_JS_PATTERNS) {
      if (pattern.test(code)) {
        throw new BadRequestException(
          'El minigame usa una API no permitida (eval/Function/document/fetch/…)',
        );
      }
    }
    return code;
  }

  /**
   * Configuración de aislamiento del Web Worker para los minijuegos custom. Se entrega al
   * cliente al servir un mod de minigame, para que lo arranque en sandbox.
   */
  workerConfig(): MinigameSandboxConfig {
    return {
      timeoutMs: 60_000,
      memoryLimitBytes: 10 * 1024 * 1024, // 10MB
      allowedApis: ['petai.getPet', 'petai.submitScore', 'petai.log'],
      restricted: ['dom', 'network', 'storage', 'parent-context'],
    };
  }
}
