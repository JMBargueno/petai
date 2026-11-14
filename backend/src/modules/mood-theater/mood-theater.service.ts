import { Injectable, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  MomentCaptureService,
  MoodContext,
  MoodPetLike,
} from './moment-capture.service';

const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_STICKERS = 50;

/**
 * Servicio de Mood Theater (feature 031). Decide el acto actual del pet según contexto
 * y vitals (vía el motor), lo persiste y emite `pet:moment`. Soporta captura de
 * stickers (galería, máx 50) y un feed social opt-in de actos de otros pets.
 */
@Injectable()
export class MoodTheaterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pets: PetsService,
    private readonly realtime: RealtimeGateway,
    private readonly moments: MomentCaptureService,
  ) {}

  /**
   * Decide el acto "actual" del pet. `context` opcional para eventos (comida favorita,
   * derrota, level-up, despertar). Si se dispara un acto countable, respeta el cap diario.
   */
  async current(userId: string, petId: string, context: MoodContext = {}) {
    const pet = (await this.pets.getPetById(userId, petId)) as unknown as MoodPetLike;
    const dayAgo = new Date(Date.now() - DAILY_WINDOW_MS);
    const countedToday = await this.prisma.moodMoment.count({
      where: {
        petId,
        captured: false,
        createdAt: { gte: dayAgo },
        act: { in: ['sing', 'cry', 'yawn', 'stretch'] },
      },
    });

    const result = this.moments.rollAct(pet, context, Math.random, countedToday);
    if (!result) {
      return { petId, act: null, message: 'Sin acto en este momento' };
    }

    const record = await this.prisma.moodMoment.create({
      data: {
        userId,
        petId,
        act: result.act,
        trigger: result.trigger,
        mood: this.moodOf(pet),
        duration: result.duration,
      },
    });

    const payload = {
      petId,
      act: result.act,
      duration: result.duration,
      trigger: result.trigger,
      mood: record.mood,
      intensity: this.moments.intensityFor(pet, result.act),
      momentId: record.id,
    };
    this.realtime.emitToUser(userId, 'pet:moment', payload);
    return { ...payload, createdAt: record.createdAt };
  }

  /**
   * Captura un momento como sticker (long-press). Si se pasa `momentId` se marca ese
   * momento como capturado; si no, se crea uno nuevo para el acto actual. Máx 50.
   */
  async capture(userId: string, petId: string, momentId?: string) {
    const pet = await this.pets.getPetById(userId, petId);
    if (!momentId) {
      const latest = await this.prisma.moodMoment.findFirst({
        where: { petId, userId },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) {
        throw new BadRequestException('No hay un momento activo para capturar');
      }
      momentId = latest.id;
    }

    const moment = await this.prisma.moodMoment.findFirst({
      where: { id: momentId, userId },
    });
    if (!moment) throw new BadRequestException('Momento no encontrado');

    const stickerKey = `mood/${moment.petId}/${moment.act}-${randomBytes(6).toString('hex')}`;

    const updated = await this.prisma.moodMoment.update({
      where: { id: moment.id },
      data: { captured: true, stickerKey, capturedAt: new Date() },
    });

    await this.trimStickers(petId);
    return this.stickerOf(updated);
  }

  /** Feed social opt-in: actos públicos de otros pets (excluye los propios). */
  async feed(userId: string, limit = 20) {
    const rows = await this.prisma.moodMoment.findMany({
      where: { sharedToFeed: true, userId: { not: userId } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });
    if (rows.length === 0) return [];

    const petIds = [...new Set(rows.map((r) => r.petId))];
    const pets = await this.prisma.pet.findMany({
      where: { id: { in: petIds } },
      include: { species: true },
    });
    const petMap = new Map(pets.map((p) => [p.id, p]));

    return rows.map((r) => {
      const p = petMap.get(r.petId);
      return {
        momentId: r.id,
        act: r.act,
        trigger: r.trigger,
        duration: r.duration,
        stickerKey: r.stickerKey,
        captured: r.captured,
        createdAt: r.createdAt,
        pet: p ? { nickname: p.nickname, species: p.species?.name ?? null, spriteKey: p.species?.spriteKey ?? null } : null,
      };
    });
  }

  private stickerOf(m: any) {
    return {
      momentId: m.id,
      act: m.act,
      trigger: m.trigger,
      duration: m.duration,
      stickerKey: m.stickerKey,
      petId: m.petId,
      capturedAt: m.capturedAt,
    };
  }

  private async trimStickers(petId: string) {
    const captured = await this.prisma.moodMoment.findMany({
      where: { petId, captured: true },
      orderBy: { capturedAt: 'desc' },
    });
    const excess = captured.length - MAX_STICKERS;
    if (excess > 0) {
      const ids = captured.slice(MAX_STICKERS).map((c) => c.id);
      await this.prisma.moodMoment.updateMany({
        where: { id: { in: ids } },
        data: { captured: false, stickerKey: null, capturedAt: null },
      });
    }
  }

  private moodOf(pet: MoodPetLike): string {
    if (pet.sick) return 'sick';
    if (pet.happiness < 15 && pet.health < 30) return 'sad';
    if (pet.happiness > 85 && pet.hunger > 70) return 'happy';
    if (pet.energy < 20) return 'tired';
    return 'neutral';
  }
}
