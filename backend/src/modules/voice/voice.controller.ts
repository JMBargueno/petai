import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SttService, SttResult } from './stt.service';
import { TtsService } from './tts.service';
import { VoiceConfigService } from './voice-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { ZodPipe } from '../../common/zod.pipe';
import { transcribeSchema, speakSchema } from './voice.schemas';

/** S-06: cuota de peticiones de voz por usuario/ventana (evita abusar de la key del servidor). */
const VOICE_QUOTA_PER_MIN = 20;
const VOICE_QUOTA_WINDOW_MS = 60_000;

/**
 * Voice AI REST endpoints.
 * Feature 020: Voice AI
 *
 * Endpoints:
 * - POST /v1/voice/transcribe — STT
 * - POST /v1/voice/speak — TTS
 * - GET /v1/voice/config/:speciesId — voice params per species
 */
@ApiTags('Voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice')
export class VoiceController {
  constructor(
    private readonly sttService: SttService,
    private readonly ttsService: TtsService,
    private readonly voiceConfigService: VoiceConfigService,
    private readonly redis: RedisService,
  ) {}

  /** S-06: limita peticiones de voz por usuario/ventana (Redis, fail-open si cae). */
  private async assertVoiceQuota(userId: string) {
    const key = this.redis.key(`voice:quota:${userId}`);
    const count = await this.redis.run(async (c) => {
      const v = await c.incr(key);
      if (v === 1) await c.pexpire(key, VOICE_QUOTA_WINDOW_MS);
      return v;
    }, 'voice.quota');
    if (count != null && count > VOICE_QUOTA_PER_MIN) {
      throw new HttpException('Límite de peticiones de voz alcanzado, inténtalo más tarde', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transcribe audio to text (STT)' })
  async transcribe(
    @CurrentUser() user: any,
    @Body(new ZodPipe(transcribeSchema)) body: { audio: string; lang?: string },
  ): Promise<SttResult> {
    await this.assertVoiceQuota(user.id);
    // S-10: audio (base64 ≤ 10MB) y lang se validan en el pipe (transcribeSchema).
    return this.sttService.transcribe(body.audio, body.lang ?? 'auto');
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synthesize text to speech (TTS) with emotion' })
  async speak(
    @CurrentUser() _user: any,
    @Body(new ZodPipe(speakSchema)) body: {
      text: string;
      speciesId: string;
      mood?: string;
    },
  ): Promise<{ audioBase64: string; durationMs: number; mood: string }> {
    await this.assertVoiceQuota(_user.id);
    // S-10: text (≤5000), speciesId y mood se validan en el pipe (speakSchema).
    const mood = body.mood ?? 'happy';
    const emotionParams = this.voiceConfigService.getEmotionParams(body.speciesId, mood);

    const result = await this.ttsService.synthesize({
      text: body.text,
      speciesId: body.speciesId,
      mood,
      voiceConfig: {
        basePitch: emotionParams.basePitch,
        baseSpeed: emotionParams.baseSpeed,
        timbre: this.voiceConfigService.getSpeciesConfig(body.speciesId).timbre,
        intensity: emotionParams.intensity,
        stability: emotionParams.stability,
      },
    });

    return { ...result, mood };
  }

  @Get('config/:speciesId')
  @ApiOperation({ summary: 'Get voice parameters for a species' })
  getVoiceConfig(@Param('speciesId') speciesId: string) {
    if (!this.voiceConfigService.hasConfig(speciesId)) {
      // Return default config instead of 404 for graceful handling
      const config = this.voiceConfigService.getSpeciesConfig(speciesId);
      return { speciesId, isDefault: true, ...config };
    }

    const config = this.voiceConfigService.getSpeciesConfig(speciesId);
    return { speciesId, isDefault: false, ...config };
  }
}
