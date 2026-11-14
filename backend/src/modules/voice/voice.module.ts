import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { SttService } from './stt.service';
import { TtsService } from './tts.service';
import { VoiceConfigService } from './voice-config.service';

/**
 * Voice AI Module.
 * Feature 020: Voice AI
 *
 * Provides STT (Whisper) and TTS (ElevenLabs) services
 * with per-species voice configuration and emotion mapping.
 */
@Module({
  controllers: [VoiceController],
  providers: [SttService, TtsService, VoiceConfigService],
  exports: [SttService, TtsService, VoiceConfigService],
})
export class VoiceModule {}
