import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Voice Config Service — loads per-species voice parameters from game data.
 * Feature 020: Voice AI
 *
 * Loads voice-config.json from shared/game-data/ and provides
 * voice parameters (pitch, speed, timbre, emotions) per species.
 */
export interface EmotionParams {
  pitch: number;
  speed: number;
  intensity: number;
  stability: number;
}

export interface SpeciesVoiceConfig {
  basePitch: number;
  baseSpeed: number;
  timbre: string;
  cloudVoiceId?: string;
  emotions: Record<string, EmotionParams>;
}

const DEFAULT_VOICE_CONFIG: SpeciesVoiceConfig = {
  basePitch: 1.0,
  baseSpeed: 1.0,
  timbre: 'neutral',
  emotions: {
    happy: { pitch: 1.15, speed: 1.1, intensity: 0.8, stability: 0.7 },
    sad: { pitch: 0.85, speed: 0.85, intensity: 0.5, stability: 0.9 },
    excited: { pitch: 1.3, speed: 1.25, intensity: 0.95, stability: 0.4 },
    sleepy: { pitch: 0.75, speed: 0.7, intensity: 0.3, stability: 0.95 },
    angry: { pitch: 1.1, speed: 1.15, intensity: 0.9, stability: 0.5 },
  },
};

@Injectable()
export class VoiceConfigService implements OnModuleInit {
  private readonly logger = new Logger(VoiceConfigService.name);
  private configs: Record<string, SpeciesVoiceConfig> = {};

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.loadConfigs();
    this.logger.log(`VoiceConfigService loaded ${Object.keys(this.configs).length} species configs`);
  }

  private loadConfigs(): void {
    const configPath = path.resolve(
      this.configService.get<string>('GAME_DATA_PATH') ?? 'shared/game-data',
      'voice-config.json',
    );

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      this.configs = JSON.parse(raw) as Record<string, SpeciesVoiceConfig>;
    } catch (error) {
      this.logger.warn(`Could not load voice-config.json from ${configPath}: ${error}`);
      this.configs = {};
    }
  }

  /**
   * Get voice config for a species. Falls back to defaults if not found.
   */
  getSpeciesConfig(speciesId: string): SpeciesVoiceConfig {
    return this.configs[speciesId] ?? DEFAULT_VOICE_CONFIG;
  }

  /**
   * Get emotion-specific parameters for a species.
   */
  getEmotionParams(speciesId: string, emotion: string): EmotionParams & { basePitch: number; baseSpeed: number } {
    const config = this.getSpeciesConfig(speciesId);
    const params = config.emotions[emotion] ?? config.emotions['happy'];
    return {
      ...params,
      basePitch: config.basePitch * params.pitch,
      baseSpeed: config.baseSpeed * params.speed,
    };
  }

  /**
   * Check if a species has a custom voice config.
   */
  hasConfig(speciesId: string): boolean {
    return speciesId in this.configs;
  }

  /**
   * Get all configured species IDs.
   */
  getAllSpecies(): string[] {
    return Object.keys(this.configs);
  }
}
