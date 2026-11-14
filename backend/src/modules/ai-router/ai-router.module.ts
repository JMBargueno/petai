import { Module } from '@nestjs/common';
import { AiRouterController } from './ai-router.controller';
import { ModelRouterService } from './model-router.service';
import { FallbackService } from './fallback.service';
import { OpenAiProvider } from './providers/openai.provider';
import { GenericProvider } from './providers/generic.provider';

/**
 * Multi-Model AI Router Module.
 * Feature 019: Multi-Model AI Router
 *
 * Provides model routing, fallback cascading, and provider management.
 */
@Module({
  controllers: [AiRouterController],
  providers: [
    ModelRouterService,
    FallbackService,
    OpenAiProvider,
    GenericProvider,
  ],
  exports: [ModelRouterService, FallbackService, OpenAiProvider, GenericProvider],
})
export class AiRouterModule {}
