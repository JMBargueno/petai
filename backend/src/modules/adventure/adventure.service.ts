import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { GameDataService } from '../game-data/game-data.service';
import { AiConfigService } from '../ai/ai-config.service';
import { AdventureOrchestratorService } from './adventure-orchestrator.service';
import { WalletService } from '../wallet/wallet.service';

const PREMIUM_COST_GEMS = 10;

@Injectable()
export class AdventureService {
  private readonly logger = new Logger(AdventureService.name);
  private readonly FREE_SCENES = 3;
  private readonly PREMIUM_SCENES = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly petsService: PetsService,
    private readonly gameData: GameDataService,
    private readonly aiConfig: AiConfigService,
    private readonly orchestrator: AdventureOrchestratorService,
    private readonly wallet: WalletService,
  ) {}

  async startDaily(userId: string, petId: string, premium: boolean) {
    if (!petId) throw new BadRequestException('petId es obligatorio');
    const pet = await this.petsService.getPetById(userId, petId);
    if (pet.sleeping) throw new BadRequestException('La mascota está durmiendo');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayCount = await this.prisma.adventure.count({
      where: { userId, startedAt: { gte: today }, isPremium: { not: premium } },
    });
    if (!premium && todayCount >= 1) {
      throw new BadRequestException('Ya completaste tu aventura gratis de hoy');
    }

    const seed = randomInt(1, 2 ** 31 - 1);
    const sceneCount = premium ? this.PREMIUM_SCENES : this.FREE_SCENES;

    if (premium) {
      // S-05 (SDD §3.3): cobro atómico race-safe (C-01); sin saldo no se avanza.
      await this.prisma.$transaction(async (tx) => {
        const { ok } = await this.wallet.debit(tx, userId, 'gems', PREMIUM_COST_GEMS);
        if (!ok) throw new BadRequestException(`La aventura premium requiere ${PREMIUM_COST_GEMS} gemas`);
      });
    }

    // S-05: la generación del tema/escena puede fallar (LLM). Si falla tras cobrar, se reembolsa.
    let adventure;
    let theme;
    let scene;
    try {
      theme = await this.orchestrator.generateTheme(pet, seed);
      adventure = await this.prisma.adventure.create({
        data: {
          userId, petId, seed, theme, sceneCount,
          currentScene: 0, isPremium: premium,
          retriesLeft: premium ? 1 : 0, status: 'active',
        },
      });
      scene = await this.orchestrator.generateScene(pet, adventure, 0, seed);
      await this.prisma.adventureScene.create({
        data: {
          adventureId: adventure.id, order: 0,
          text: scene.text, choices: scene.choices as any, isFinal: (sceneCount as number) === 1,
        },
      });
    } catch (err) {
      if (premium) {
        await this.prisma.$transaction(async (tx) => {
          await this.wallet.credit(tx, userId, 'gems', PREMIUM_COST_GEMS);
        });
      }
      throw err;
    }

    this.logger.log(`Adventure started: ${adventure.id} theme="${theme}" premium=${premium}`);

    return {
      adventureId: adventure.id, theme, sceneCount,
      currentScene: 0,
      scene: { order: 0, text: scene.text, choices: scene.choices },
      isPremium: premium, retriesLeft: premium ? 1 : 0,
    };
  }

  async choose(userId: string, adventureId: string, optionIndex: number) {
    const adventure = await this.prisma.adventure.findFirst({
      where: { id: adventureId, userId, status: 'active' },
      include: { scenes: true, pet: true },
    });
    if (!adventure) throw new NotFoundException('Aventura no encontrada o no activa');
    if (optionIndex < 0 || optionIndex > 2) throw new BadRequestException('Opción inválida');

    const currentSceneNum = adventure.currentScene;
    const currentScene = adventure.scenes.find((s) => s.order === currentSceneNum);
    if (!currentScene) throw new BadRequestException('Escena actual no encontrada');

    const choices = (currentScene.choices as any[]);
    if (optionIndex >= choices.length) throw new BadRequestException(`Solo hay ${choices.length} opciones`);

    await this.prisma.adventureScene.update({
      where: { id: currentScene.id },
      data: { chosenOption: optionIndex },
    });

    if (currentSceneNum + 1 >= adventure.sceneCount) {
      return this.finishAdventure(userId, adventure, optionIndex);
    }

    const nextSceneNum = currentSceneNum + 1;
    const scene = await this.orchestrator.generateScene(
      adventure.pet as any, adventure, nextSceneNum, adventure.seed,
      currentScene.text, choices[optionIndex].label,
    );
    const isFinal = nextSceneNum + 1 >= adventure.sceneCount;

    await this.prisma.adventureScene.create({
      data: { adventureId: adventure.id, order: nextSceneNum, text: scene.text, choices: scene.choices as any, isFinal },
    });
    await this.prisma.adventure.update({ where: { id: adventure.id }, data: { currentScene: nextSceneNum } });

    return { advanced: true, scene: { order: nextSceneNum, text: scene.text, choices: scene.choices, isFinal } };
  }

  async getCurrent(userId: string) {
    const adventure = await this.prisma.adventure.findFirst({
      where: { userId, status: 'active' },
      include: { scenes: true },
    });
    if (!adventure) return { active: false };

    const currentScene = adventure.scenes.find((s) => s.order === adventure.currentScene);

    return {
      active: true,
      adventureId: adventure.id,
      theme: adventure.theme,
      sceneCount: adventure.sceneCount,
      currentScene: adventure.currentScene,
      scene: currentScene ? {
        order: currentScene.order,
        text: currentScene.text,
        choices: currentScene.choices as any[],
        chosenOption: currentScene.chosenOption,
        isFinal: currentScene.isFinal,
      } : null,
      isPremium: adventure.isPremium,
      retriesLeft: adventure.retriesLeft,
    };
  }

  async getHistory(userId: string, limit = 20) {
    const adventures = await this.prisma.adventure.findMany({
      where: { userId, status: { in: ['completed', 'failed'] } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return adventures.map((a) => ({
      adventureId: a.id,
      theme: a.theme,
      sceneCount: a.sceneCount,
      outcome: a.outcome,
      score: a.score,
      xpAwarded: a.xpAwarded,
      coinsAwarded: a.coinsAwarded,
      isPremium: a.isPremium,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
    }));
  }

  private async finishAdventure(userId: string, adventure: any, lastOption: number) {
    const pet = await this.prisma.pet.findUnique({ where: { id: adventure.petId } });
    if (!pet) throw new NotFoundException('Pet no encontrado');

    const outcome = this.orchestrator.resolveOutcome(pet, adventure, lastOption);
    const { result, score } = outcome;
    const rewards = this.getRewards(result);

    await this.prisma.$transaction([
      this.prisma.adventure.update({
        where: { id: adventure.id },
        data: { status: 'completed', outcome: result, score, xpAwarded: rewards.xp, coinsAwarded: rewards.coins, finishedAt: new Date() },
      }),
      this.prisma.pet.update({
        where: { id: pet.id },
        data: { xp: { increment: rewards.xp }, happiness: { increment: result === 'win' ? 8 : 3 } },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { coins: { increment: rewards.coins } },
      }),
    ]);

    const memoryContent = `Adventuré "${adventure.theme}" el ${new Date().toLocaleDateString('es-ES')}. ` +
      `Resultado: ${result === 'win' ? '¡victoria!' : result === 'partial' ? 'logro parcial' : 'derrota valiente'}. ` +
      `Fue una experiencia ${result === 'win' ? 'incrediblemente emocionante' : result === 'partial' ? 'interesante con obstáculos' : 'difícil pero aprendí mucho'}.`;

    await this.prisma.petMemory.create({
      data: { petId: pet.id, kind: 'adventure', content: memoryContent },
    });

    this.logger.log(`Adventure ${adventure.id} finished: outcome=${result} score=${score.toFixed(3)}`);

    return {
      completed: true,
      outcome: result,
      score,
      rewards: { xp: rewards.xp, coins: rewards.coins },
      memory: memoryContent,
    };
  }

  private getRewards(outcome: 'win' | 'partial' | 'lose') {
    switch (outcome) {
      case 'win': return { xp: 30, coins: 20 };
      case 'partial': return { xp: 15, coins: 10 };
      case 'lose': return { xp: 5, coins: 3 };
    }
  }
}