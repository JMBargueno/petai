import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Speech-to-Text service.
 * Feature 020: Voice AI
 *
 * Dispatches audio to Whisper API (OpenAI) for transcription.
 * Returns text transcription with confidence score.
 */
export interface SttResult {
  text: string;
  language: string;
  duration: number;
}

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('WHISPER_BASE_URL') ?? 'https://api.openai.com/v1';
    this.apiKey = this.configService.get<string>('WHISPER_API_KEY') ?? this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.model = this.configService.get<string>('WHISPER_MODEL') ?? 'whisper-1';
  }

  /**
   * Transcribe binary audio to text.
   * @param audio - Binary audio (WAV/MP3/Opus)
   * @param lang - Language hint ('es', 'en', or 'auto')
   */
  async transcribe(audio: Buffer, lang: string = 'auto'): Promise<SttResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const fileName = `audio-${Date.now()}`;

      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(audio)]), fileName);
      formData.append('model', this.model);
      if (lang !== 'auto') formData.append('language', lang);

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        // S-19: no se propaga al cliente ni se loguea el cuerpo de error del proveedor (puede contener
        // datos sensibles). Mensaje genérico por estado, como en el núcleo (describeError).
        this.logger.error(`Whisper API error (status ${response.status})`);
        throw new Error(`STT failed: HTTP ${response.status}`);
      }

      const result = await response.json() as { text: string };
      const duration = audio.length / 32000; // Approximate duration for 16kHz mono

      return {
        text: result.text.trim(),
        language: lang === 'auto' ? 'detected' : lang,
        duration: Math.round(duration * 1000),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('STT timeout: service took too long');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
