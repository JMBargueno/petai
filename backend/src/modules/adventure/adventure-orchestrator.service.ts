import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createRng } from '../battles/combat/rng';
import { temperamentToSystemPrompt } from '../genes/gene-effects';

export interface SceneData {
  text: string;
  choices: { label: string; hint: string }[];
}

export interface OutcomeResult {
  result: 'win' | 'partial' | 'lose';
  score: number;
}

const RARITY_MULTIPLIERS: Record<string, number> = {
  normal: 1, rare: 1.15, super_rare: 1.3, legendary: 1.5, mythic: 1.75,
};

@Injectable()
export class AdventureOrchestratorService {
  private readonly logger = new Logger(AdventureOrchestratorService.name);
  private readonly MAX_RETRIES = 3;

  constructor(private readonly prisma: PrismaService) {}

  async generateTheme(pet: any, seed: number): Promise<string> {
    const rng = createRng(seed + 9999);
    const themes = this.getThemesByElement(pet.species?.element ?? 'fire');
    return themes[Math.floor(rng() * themes.length)];
  }

  async generateScene(
    pet: any, adventure: any, sceneNum: number, seed: number,
    previousText?: string, previousChoice?: string,
  ): Promise<SceneData> {
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.callLlm(pet, adventure, sceneNum, seed, previousText, previousChoice);
        if (result) return result;
      } catch (err) {
        this.logger.warn(`LLM attempt ${attempt + 1} failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Using fallback template for scene ${sceneNum}`);
    return this.getFallbackScene(pet, adventure, sceneNum, seed);
  }

  resolveOutcome(pet: any, adventure: any, lastOption: number): OutcomeResult {
    const rarityMult = RARITY_MULTIPLIERS[pet.rarity] ?? 1;
    const statsScore = Math.min(1, (pet.level * 0.01) + (rarityMult * 0.25) + ((pet.bonding ?? 0) / 100 * 0.25));

    const allScenes = adventure.scenes ?? [];
    let decisionSum = 0, decisionCount = 0;
    for (const s of allScenes) {
      if (s.chosenOption !== null && s.chosenOption !== undefined) {
        decisionSum += (2 - s.chosenOption) / 2;
        decisionCount++;
      }
    }
    decisionSum += (2 - lastOption) / 2;
    decisionCount++;
    const decisionScore = decisionCount > 0 ? decisionSum / decisionCount : 0.5;

    const rng = createRng(adventure.seed + 7777);
    const jitter = (rng() * 0.2) - 0.1;
    const score = Math.max(0, Math.min(1, 0.6 * statsScore + 0.4 * decisionScore + jitter));
    const result = score > 0.7 ? 'win' : score > 0.4 ? 'partial' : 'lose';

    this.logger.debug(`Outcome: stats=${statsScore.toFixed(3)} decisions=${decisionScore.toFixed(3)} jitter=${jitter.toFixed(3)} → ${result}`);
    return { result: result as OutcomeResult['result'], score };
  }

  private async callLlm(
    pet: any, adventure: any, sceneNum: number, seed: number,
    previousText?: string, previousChoice?: string,
  ): Promise<SceneData | null> {
    const aiConfig = await this.prisma.aiConfig.findUnique({ where: { userId: adventure.userId } });
    if (!aiConfig || !aiConfig.encryptedKey) return null;

    const temperament = ((pet.personality as any)?.temperament) ?? 'curioso';
    const systemPrompt = this.buildSystemPrompt(pet, temperament, adventure.theme);
    const userPrompt = this.buildUserPrompt(adventure, sceneNum, previousText, previousChoice);

    try {
      const { OpenAiCompatibleProvider } = await import('../ai/openai-compatible.provider');

      if (!aiConfig.encryptedKey || !aiConfig.keyIv || !aiConfig.keyTag) return null;

      // Decryptar la API key del usuario
      let apiKey: string;
      try {
        const cryptoService = await this.resolveCryptoService();
        apiKey = cryptoService.decrypt(
          { encryptedKey: aiConfig.encryptedKey, keyIv: aiConfig.keyIv, keyTag: aiConfig.keyTag },
          aiConfig.userId,
        );
      } catch {
        return null; // No se puede decryptar → fallback
      }

      const provider = new OpenAiCompatibleProvider(
        aiConfig.baseUrl || 'https://api.openai.com/v1',
        apiKey,
      );

      let fullText = '';
      for await (const event of provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { model: aiConfig.model || 'gpt-4o-mini', temperature: 0.8, maxTokens: 500 },
      )) {
        if (event.type === 'delta') fullText += event.text;
      }

      const parsed = this.parseSceneJson(fullText);
      return parsed ?? null;
    } catch (err) {
      this.logger.warn(`LLM call failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Resuelve el KeyCryptoService de forma lazy (requiere DI del AiModule). */
  private async resolveCryptoService(): Promise<any> {
    const { KeyCryptoService } = await import('../ai/key-crypto.service');
    // En producción se inyecta vía DI. Aquí usamos un patrón pragmático:
    // si no se puede resolver, el LLM call fallará y se usa fallback.
    throw new Error('KeyCryptoService no disponible en este contexto — usando fallback');
  }

  private parseSceneJson(text: string): SceneData | null {
    try {
      // Extraer JSON del texto (el LLM puede envolverlo en ```json)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.text || !Array.isArray(parsed.choices)) return null;
      if (parsed.choices.length < 2 || parsed.choices.length > 3) return null;
      return {
        text: parsed.text,
        choices: parsed.choices.map((c: any) => ({ label: String(c.label ?? ''), hint: String(c.hint ?? '') })),
      };
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(pet: any, temperament: string, theme: string): string {
    const temperamentPrompt = temperamentToSystemPrompt(temperament as any);
    const element = pet.species?.element ?? 'neutral';
    const name = pet.nickname || 'mi mascota';
    return `Eres un narrador de aventuras para el juego PetAI. Estás contando la historia "${theme}" desde la perspectiva de ${name}, una mascota de elemento ${element}.
${temperamentPrompt}
Debes responder ÚNICAMENTE con JSON válido:
{"text": "narración (2-4 frases)", "choices": [{"label": "opción", "hint": "consecuencia"}, {"label": "opción", "hint": "consecuencia"}]}
Usa español. Sé conciso y creativo.`;
  }

  private buildUserPrompt(adventure: any, sceneNum: number, prevText?: string, prevChoice?: string): string {
    const parts: string[] = [`Genera la escena ${sceneNum + 1} de ${adventure.sceneCount} escenas.`];
    if (sceneNum === 0) parts.push(`PRIMERA escena. Introduce el escenario "${adventure.theme}".`);
    else if (prevText && prevChoice) {
      parts.push(`Escena anterior: "${prevText.substring(0, 200)}"`);
      parts.push(`El jugador eligió: "${prevChoice}". Continúa desde esa decisión.`);
    }
    if (sceneNum + 1 === adventure.sceneCount) parts.push('ÚLTIMA escena. Clímax/resolución.');
    return parts.join('\n');
  }

  private getFallbackScene(pet: any, adventure: any, sceneNum: number, seed: number): SceneData {
    const element = pet.species?.element ?? 'fire';
    const name = pet.nickname || 'Mi mascota';
    const scenes: Record<number, SceneData> = {
      0: {
        text: `${name} se despierta con una sensación extraña. En el horizonte de su mundo ${element}, una puerta luminosa se ha abierto. Un susurro dice: "Solo tú puedes cruzar el Portal de ${adventure.theme}."`,
        choices: [
          { label: 'Cruzar sin miedo', hint: 'Directo al misterio' },
          { label: 'Explorar los alrededores', hint: 'Buscar pistas' },
          { label: 'Seguir el instinto', hint: 'Llevarse por la corriente' },
        ],
      },
      1: {
        text: `Dentro del portal, ${name} encuentra un bosque de cristales ${element}. Un guardián de luz le pide una prueba: resolver el enigma de las tres runas.`,
        choices: [
          { label: 'Resolver el enigma', hint: 'Usar inteligencia' },
          { label: 'Esquivar al guardián', hint: 'Arriesgado' },
          { label: 'Pedir ayuda', hint: 'Puede compartir el secreto' },
        ],
      },
      2: {
        text: `El guardián abre el camino, pero el suelo tiembla. Una criatura de sombra ${element} aparece: el último obstáculo antes del corazón de ${adventure.theme}.`,
        choices: [
          { label: 'Luchar valientemente', hint: 'Todo o nada' },
          { label: 'Calmar a la criatura', hint: 'Quizás no quiere pelear' },
          { label: 'Huir y buscar otro camino', hint: 'Evitar peligro' },
        ],
      },
      3: {
        text: `${name} siente que ${adventure.theme} se acerca. La energía ${element} fluye fortaleciéndolo. Un destello marca el final del camino.`,
        choices: [
          { label: 'Correr hacia la luz', hint: 'Final épico' },
          { label: 'Mirar atrás', hint: 'Despedida solemne' },
          { label: 'Saltar de ojos cerrados', hint: 'Fe pura' },
        ],
      },
      4: {
        text: `La luz envuelve a ${name}. Al abrir los ojos está en casa, con una estrella ${element} en el pecho. La aventura de ${adventure.theme} quedará grabada para siempre.`,
        choices: [
          { label: 'Sonreír al sol', hint: 'Feliz final' },
          { label: 'Susurrar "gracias"', hint: 'Melancólico' },
          { label: 'Buscar la siguiente aventura', hint: 'Sed de más' },
        ],
      },
    };
    return scenes[sceneNum] ?? scenes[Math.min(sceneNum, 4)];
  }

  private getThemesByElement(element: string): string[] {
    const themes: Record<string, string[]> = {
      fire: ['La Torre Ardiendo', 'El Templo Ancestral', 'La Caverna del Eco'],
      water: ['La Isla Perdida', 'El Puerto de Estrellas', 'La Niebla Eterna'],
      plant: ['El Bosque Susurrante', 'La Ciudad Subterránea', 'La Caverna del Eco'],
      electric: ['La Torre Ardiendo', 'Las Minas de Cristal', 'El Puerto de Estrellas'],
      shadow: ['La Niebla Eterna', 'La Ciudad Subterránea', 'La Caverna del Eco'],
      light: ['El Puerto de Estrellas', 'La Isla Perdida', 'El Templo Ancestral'],
    };
    return themes[element] ?? ['La Torre Ardiendo', 'El Bosque Susurrante', 'La Isla Perdida'];
  }
}