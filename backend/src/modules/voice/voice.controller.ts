import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SttService, SttResult } from './stt.service';
import { TtsService } from './tts.service';
import { VoiceConfigService } from './voice-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

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
  ) {}

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transcribe audio to text (STT)' })
  async transcribe(
    @Body() body: { audio: string; lang?: string },
  ): Promise<SttResult> {
    if (!body.audio || typeof body.audio !== 'string') {
      throw new BadRequestException('Audio data required (base64)');
    }

    if (body.audio.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Audio too large (max 10MB base64)');
    }

    return this.sttService.transcribe(body.audio, body.lang ?? 'auto');
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synthesize text to speech (TTS) with emotion' })
  async speak(
    @CurrentUser() _user: any,
    @Body() body: {
      text: string;
      speciesId: string;
      mood?: string;
    },
  ): Promise<{ audioBase64: string; durationMs: number; mood: string }> {
    if (!body.text || body.text.length > 5000) {
      throw new BadRequestException('Text required (max 5000 chars)');
    }

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
