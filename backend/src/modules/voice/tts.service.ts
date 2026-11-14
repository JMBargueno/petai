import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Text-to-Speech service.
 * Feature 020: Voice AI
 *
 * Dispatches text to ElevenLabs API for speech synthesis with
 * emotion-based prosody parameters.
 */
export interface TtsRequest {
  text: string;
  speciesId: string;
  mood: string;
  voiceConfig: {
    basePitch: number;
    baseSpeed: number;
    timbre: string;
    intensity: number;
    stability: number;
  };
}

export interface TtsChunk {
  audio: string; // Base64 encoded audio chunk
  duration: number; // ms
  isLast: boolean;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly voiceId: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('ELEVENLABS_BASE_URL') ?? 'https://api.elevenlabs.io/v1';
    this.apiKey = this.configService.get<string>('ELEVENLABS_API_KEY') ?? '';
    this.voiceId = this.configService.get<string>('ELEVENLABS_VOICE_ID') ?? '21m00Tcm4TlvDq8ikTAM'; // Rachel
  }

  /**
   * Synthesize text to speech with emotion parameters.
   * F-08: returns the provider audio as a binary Buffer (the controller streams it as
   * `audio/*`), not base64-in-JSON.
   */
  async synthesize(request: TtsRequest): Promise<{ audio: Buffer; durationMs: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${request.voiceConfig.timbre === 'custom' ? this.voiceId : this.voiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: request.text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: request.voiceConfig.stability,
              similarity_boost: 0.75,
              style: request.voiceConfig.intensity,
              use_speaker_boost: true,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        // S-19: no se loguea el cuerpo de error del proveedor (puede contener datos sensibles).
        this.logger.error(`TTS API error (status ${response.status})`);
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audio = Buffer.from(await response.arrayBuffer());
      const durationMs = Math.round((audio.byteLength / 32000) * 1000); // Approx

      return { audio, durationMs };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('TTS timeout: service took too long');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
