import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DiaryEntry {
  category: 'sleep' | 'food' | 'battles' | 'mood' | 'environment';
  text: string;
  icon: string;
}

const MAX_ENTRIES = 5;

/**
 * DiaryService — Feature 028. Genera el "diario de ausencia": 3-5 viñetas con datos
 * reales (batallas ganadas, mensajes, sueño, ambiente) que justifican visualmente el
 * tiempo que el jugador no estuvo. Es una operación pura en memoria (<100ms).
 */
@Injectable()
export class DiaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Genera el diario para una ausencia (ms). Determinista y rápido. */
  async generate(petId: string, absenceMs: number, now: Date): Promise<DiaryEntry[]> {
    const hours = absenceMs / 3_600_000;
    const targetCount = hours < 48 ? 3 : hours < 7 * 24 ? 4 : MAX_ENTRIES;

    // Datos reales disponibles en memoria/BD.
    const [battlesWon, messages, lastBattle] = await Promise.all([
      this.prisma.battle.count({
        where: {
          attackerPetId: petId,
          winnerPetId: petId,
          createdAt: { gte: new Date(now.getTime() - absenceMs) },
        },
      }),
      this.prisma.chatMessage.count({
        where: {
          petId,
          createdAt: { gte: new Date(now.getTime() - absenceMs) },
        },
      }),
      this.prisma.battle.findFirst({
        where: { attackerPetId: petId, createdAt: { gte: new Date(now.getTime() - absenceMs) } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const entries: DiaryEntry[] = [];

    // Dormir (siempre: el pet descansa durante la ausencia).
    const sleepHours = Math.max(0, Math.round(hours - hours * 0.3));
    entries.push({
      category: 'sleep',
      text: `Dormí ${Math.max(1, sleepHours)} horas soñando contigo.`,
      icon: 'sleep',
    });

    // Batallas (si hay datos reales).
    if (battlesWon > 0) {
      entries.push({
        category: 'battles',
        text: `Gané ${battlesWon} batallas solo. Me fui de espaldas.`,
        icon: 'battles',
      });
    } else if (lastBattle) {
      entries.push({
        category: 'battles',
        text: 'Intenté entrenar sin ti, pero me faltaba energía.',
        icon: 'battles',
      });
    }

    // Comida (el tick lazy consume food).
    if (hours >= 12) {
      const snacks = Math.min(5, Math.max(1, Math.floor(hours / 8)));
      entries.push({
        category: 'food',
        text: `Me comí ${snacks} bocaditos que guardé para cuando volvieras.`,
        icon: 'food',
      });
    }

    // Mood / ambiente (según el día y los mensajes).
    if (messages > 0) {
      entries.push({
        category: 'mood',
        text: `Recordé ${messages} charlas nuestras mientras esperaba.`,
        icon: 'mood',
      });
    } else {
      const day = now.getDay();
      const rainy = day % 3 === 0;
      entries.push({
        category: 'environment',
        text: rainy
          ? 'Hacía llovizna y me mojan las escamas.'
          : 'Miré el techo. Hay 47 partículas de polvo. Te cuento si quieres.',
        icon: 'environment',
      });
    }

    // Mood extra si la ausencia es larga.
    if (hours >= 24 * 7) {
      entries.push({
        category: 'mood',
        text: 'Conté los días en las paredes. No es que me queje.',
        icon: 'mood',
      });
    }

    return entries.slice(0, MAX_ENTRIES);
  }
}
