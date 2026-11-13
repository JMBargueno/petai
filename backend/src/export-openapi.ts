import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const prefix = 'v1';
  app.setGlobalPrefix(prefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PetAI API')
    .setDescription('API autoritativa para el ecosistema PetAI')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = path.resolve(__dirname, '../../shared/openapi/openapi.json');

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`✓ [OpenAPI] Especificación exportada exitosamente a: ${outputPath}`);
  await app.close();
}

exportOpenApi().catch((err) => {
  console.error('Error exportando OpenAPI:', err);
  process.exit(1);
});
