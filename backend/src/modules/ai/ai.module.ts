import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiConfigService } from './ai-config.service';
import { ChatService } from './chat.service';
import { KeyCryptoService } from './key-crypto.service';
import { PetsModule } from '../pets/pets.module';

@Module({
  imports: [PetsModule],
  controllers: [AiController],
  providers: [AiConfigService, ChatService, KeyCryptoService],
})
export class AiModule {}
