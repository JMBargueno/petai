import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const COLORBLIND = ['protanopia', 'deuteranopia', 'tritanopia'];

/**
 * Servicio de Accessibility (feature 032). Persiste las prefs de accesibilidad del
 * usuario (1 registro) y expone la config centralizada (tokens de alto contraste, modo
 * simple, minijuegos accesibles y atajos) desde `accessibility.json`.
 */
@Injectable()
export class AccessibilityService {
  private readonly cfg = require('../../../../shared/game-data/accessibility.json');

  constructor(private readonly prisma: PrismaService) {}

  /** Config centralizada de accesibilidad (para el frontend aplicar tokens/variantes). */
  config() {
    return this.cfg;
  }

  /** Prefs del usuario, creando con defaults si no existen. */
  async getPrefs(userId: string) {
    const prefs = await this.prisma.accessibilityPrefs.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    return this.serialize(prefs);
  }

  /**
   * Actualiza prefs (parcial). Solo se tocan los campos presentes; `fontSizeScale` se
   * clampa a [50,200] y `colorblindMode` se valida contra la lista permitida.
   */
  async updatePrefs(userId: string, input: Record<string, unknown>) {
    const data: Record<string, unknown> = {};

    const boolField = (key: string) => {
      if (input[key] !== undefined) data[key] = Boolean(input[key]);
    };
    boolField('highContrast');
    boolField('reduceMotion');
    boolField('captions');
    boolField('simpleMode');
    boolField('reduceHaptics');

    if (input.fontSizeScale !== undefined) {
      const n = Number(input.fontSizeScale);
      if (!Number.isFinite(n)) throw new BadRequestException('fontSizeScale debe ser un número');
      const { min, max } = this.cfg.fontSize;
      data.fontSizeScale = Math.min(max, Math.max(min, Math.round(n)));
    }

    if (input.colorblindMode !== undefined) {
      const cb = input.colorblindMode as string | null;
      if (cb !== null && cb !== undefined && cb !== '' && !COLORBLIND.includes(cb)) {
        throw new BadRequestException(
          `colorblindMode debe ser null o uno de: ${COLORBLIND.join(', ')}`,
        );
      }
      data.colorblindMode = cb === '' || cb === null ? null : cb;
    }

    const prefs = await this.prisma.accessibilityPrefs.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return this.serialize(prefs);
  }

  /** Variantes accesibles de minijuegos (parámetros sin timing, zona ampliada, hints). */
  accessibleMinigames() {
    const mg = this.cfg.minigames;
    return Object.entries(mg).map(([id, v]: [string, any]) => ({
      base: id,
      variant: v.variant,
      accessible: true,
      params: v,
      rewards: 'equal', // AC: los accesibles dan los mismos rewards
    }));
  }

  private serialize(p: any) {
    return {
      highContrast: p.highContrast,
      reduceMotion: p.reduceMotion,
      captions: p.captions,
      simpleMode: p.simpleMode,
      reduceHaptics: p.reduceHaptics,
      fontSizeScale: p.fontSizeScale,
      colorblindMode: p.colorblindMode,
      updatedAt: p.updatedAt,
    };
  }
}
