import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GameDataService } from '../game-data/game-data.service';
import { AiConfigService } from '../ai/ai-config.service';
import { resolveTemplate, NotificationTemplates, NotificationCategory, CATEGORY_TO_TYPE } from './notification-rules';

/** Límite del LLM para notificaciones (FR-002/008): 1 frase, máx 50 tokens, timeout duro 5s. */
const AI_MAX_TOKENS = 50;
const AI_TIMEOUT_MS = 5000;
const MAX_MESSAGE_CHARS = 180;

/** Descripción legible del evento para el prompt de la IA. */
const CATEGORY_PROMPT: Record<NotificationCategory, string> = {
  vitals_critical: 'una de tus vitales (hambre, energía o higiene) ha caído a un nivel crítico y necesitas atención',
  interaction: 'el dueño acaba de interactuar contigo (alimentar, jugar, hablar o cuidar)',
  achievement: 'has conseguido un logro (completaste una misión, subiste de nivel o evolucionaste)',
  arena: 'acabas de terminar una pelea en la arena (puede ser victoria o derrota)',
  event: 'hay un evento global activo (festival o temporada)',
};

export interface GeneratedNotification {
  message: string;
  source: 'ai' | 'template';
}

/**
 * Genera el **texto** de una notificación con personalidad (feature 007).
 *
 * Decide IA vs plantilla: si el usuario tiene `AiConfig` activo, hace exactamente 1 LLM call
 * (máx 50 tokens, timeout 5s); si falla, timeout o devuelve vacío, cae a la plantilla de
 * `notifications.json`. El consumo de tokens **no** se registra en `AiUsage` (FR-014).
 */
@Injectable()
export class NotificationGeneratorService {
  private readonly logger = new Logger(NotificationGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameData: GameDataService,
    @Optional() private readonly aiConfig?: AiConfigService,
  ) {}

  async generate(
    petId: string,
    userId: string,
    category: NotificationCategory,
    context: Record<string, unknown> = {},
  ): Promise<GeneratedNotification> {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
      select: {
        personality: true,
        bondingTier: true,
        nickname: true,
        species: { select: { name: true } },
      },
    });
    if (!pet) {
      // Sin pet: se genera igualmente un mensaje neutro (no debe romper el dispatch).
      return { message: this.fromTemplate('neutral', 'acquainted', category), source: 'template' };
    }

    const trait = (pet.personality as { trait?: string } | null)?.trait ?? 'neutral';
    const tier = pet.bondingTier ?? 'acquainted';

    if (this.aiConfig && (await this.hasAiConfig(userId))) {
      try {
        const aiMessage = await this.generateWithAi(userId, pet.nickname, pet.species?.name, trait, tier, category, context);
        if (aiMessage) return { message: aiMessage, source: 'ai' };
      } catch (err: any) {
        this.logger.debug(`IA de notificación falló, se usa plantilla: ${err?.message}`);
      }
    }

    return { message: this.fromTemplate(trait, tier, category), source: 'template' };
  }

  /** ¿El usuario tiene un proveedor de IA usable? (una sola consulta, sin descifrar). */
  private async hasAiConfig(userId: string): Promise<boolean> {
    const cfg = await this.prisma.aiConfig.findUnique({
      where: { userId },
      select: { encryptedKey: true, keyIv: true, keyTag: true, baseUrl: true, model: true },
    });
    return !!(cfg?.encryptedKey && cfg?.keyIv && cfg?.keyTag && cfg?.baseUrl && cfg?.model);
  }

  /** Resuelve la plantilla del motor puro. */
  private fromTemplate(trait: string, tier: string, category: NotificationCategory): string {
    const templates: NotificationTemplates | null = this.gameData.getNotificationTemplates();
    return resolveTemplate(templates, trait, tier, category);
  }

  /** 1 LLM call (50 tokens, 5s) reutilizando el proveedor del usuario; `null` si no devuelve texto. */
  private async generateWithAi(
    userId: string,
    petName: string,
    speciesName: string | null,
    trait: string,
    tier: string,
    category: NotificationCategory,
    context: Record<string, unknown>,
  ): Promise<string | null> {
    const { provider, model } = await this.aiConfig!.resolveProvider(userId);
    const prompt = this.buildPrompt(petName, speciesName, trait, tier, category, context);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      let text = '';
      for await (const ev of provider.chat(
        [
          {
            role: 'system',
            content:
              'Eres la voz de una mascota virtual. Responde con UNA sola frase corta, natural y en español, sin listas, sin explicaciones y con a lo sumo un emoji.',
          },
          { role: 'user', content: prompt },
        ],
        { model, maxTokens: AI_MAX_TOKENS, temperature: 0.8, signal: controller.signal },
      )) {
        if (ev.type === 'delta') text += ev.text;
      }
      const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
      return cleaned ? cleaned : null;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(
    petName: string,
    speciesName: string | null,
    trait: string,
    tier: string,
    category: NotificationCategory,
    context: Record<string, unknown>,
  ): string {
    const type = CATEGORY_TO_TYPE[category];
    const extra =
      Object.keys(context).length > 0 ? ` Contexto extra: ${JSON.stringify(context)}.` : '';
    return (
      `Eres "${petName}"${speciesName ? ` (${speciesName})` : ''}, una mascota de personalidad ` +
      `"${trait}" con nivel de vínculo "${tier}" hacia tu dueño. ` +
      `Ocurre que ${CATEGORY_PROMPT[category]}. ` +
      `Dile a tu dueño UNA frase muy corta (máximo 50 tokens) que suene a ti, con tu tono ${type}.` +
      extra
    );
  }
}
