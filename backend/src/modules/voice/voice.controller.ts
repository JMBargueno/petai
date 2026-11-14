import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  HttpException,
  BadRequestException,
  PayloadTooLargeException,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Response } from 'express';
import { SttService, SttResult } from './stt.service';
import { TtsService } from './tts.service';
import { VoiceConfigService } from './voice-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { ZodPipe } from '../../common/zod.pipe';
import { transcribeFieldsSchema, speakSchema, type TranscribeFields, type SpeakInput } from './voice.schemas';

/** S-06: cuota de peticiones de voz por usuario/ventana (evita abusar de la key del servidor). */
const VOICE_QUOTA_PER_MIN = 20;
const VOICE_QUOTA_WINDOW_MS = 60_000;

/**
 * F-08: límite de tamaño de la subida de `/voice/transcribe` (audio binario, varios MB).
 * El contrato anterior (base64 en JSON) chocaban con el límite de 100 KB del body parser por
 * defecto: cualquier audio de >~75KB (2-3 s) recibía un 413 antes de llegar al controller.
 * Aquí el límite es propio de la ruta, vía multer.
 */
export const VOICE_MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB

/** Opciones de subida; `errorHandler` traduce los errores de multer a 4xx de Nest (F-08). */
export const voiceUploadOptions: MulterOptions & {
  errorHandler?: (err: Error & { code?: string }, _file: unknown, cb: (err?: Error | null) => void) => void;
} = {
  limits: { fileSize: VOICE_MAX_AUDIO_BYTES, files: 1, fields: 8 },
  errorHandler: (err, _file, cb) =>
    cb(
      err?.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeException(`audio demasiado grande (máx ${Math.round(VOICE_MAX_AUDIO_BYTES / 1024 / 1024)}MB)`)
        : new BadRequestException('error al procesar el fichero de audio'),
    ),
};

/** Subida en memoria de multer (solo los campos que usa el controller). */
export interface UploadedAudio {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Voice AI REST endpoints.
 * Feature 020: Voice AI
 *
 * Endpoints:
 * - POST /v1/voice/transcribe — STT (multipart/form-data: fichero `file` ≤ 5MB + campo `lang`)
 * - POST /v1/voice/speak — TTS (respuesta binaria en streaming, `audio/*`)
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio (WAV/MP3/Opus) ≤ 5MB' },
        lang: { type: 'string', description: 'Language hint: "es", "en" or "auto"' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', voiceUploadOptions))
  async transcribe(
    @CurrentUser() user: any,
    @UploadedFile() file: UploadedAudio | undefined,
    // Los campos no-fichero del multipart caen en `req.body` (los rellena multer), así que
    // `@Body` sirve tanto para la subida como para la validación de `lang`.
    @Body(new ZodPipe(transcribeFieldsSchema)) fields: TranscribeFields,
  ): Promise<SttResult> {
    await this.assertVoiceQuota(user.id);
    // F-08: el audio llega como fichero multipart (límite de ruta VOICE_MAX_AUDIO_BYTES),
    // en vez de base64 en JSON que el body parser de 100KB rechazaba con 413.
    if (!file || file.buffer?.length === 0) {
      throw new BadRequestException('fichero de audio obligatorio (campo "file")');
    }
    return this.sttService.transcribe(file.buffer, fields.lang ?? 'auto');
  }

  @Post('speak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synthesize text to speech (TTS) with emotion',
    description:
      'F-08: la respuesta es el audio binario en streaming (`audio/*`), no base64 en JSON. ' +
      'El `mood` y la duración van en las cabeceras `X-Voice-Mood` y `X-Audio-Duration-Ms`.',
  })
  async speak(
    @CurrentUser() user: any,
    @Body(new ZodPipe(speakSchema)) body: SpeakInput,
    @Res() res: Response,
  ): Promise<void> {
    await this.assertVoiceQuota(user.id);
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

    // F-08: respuesta binaria `audio/*` en streaming: el cuerpo es solo el audio;
    // mood/duración se van a cabeceras para no envolverlo en JSON.
    const fileName = `voice-${slug(body.speciesId)}-${slug(mood)}.mp3`;
    res
      .status(HttpStatus.OK)
      .type('audio/mpeg')
      .set({
        'Content-Disposition': `inline; filename="${fileName}"`,
        'X-Voice-Mood': mood,
        'X-Audio-Duration-Ms': String(result.durationMs),
      })
      .send(result.audio);
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

/** Sanitiza mínimo para el nombre de fichero (speciesId/mood no pueden meter caracteres raros). */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}
