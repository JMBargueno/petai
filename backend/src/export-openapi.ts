import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function exportOpenApi() {
  // El contrato OpenAPI solo necesita la metadatos de los controladores/DTOs, no una base de datos
  // viva. Desactivamos la conexión de Prisma al arrancar para poder regenerar el JSON en cualquier
  // entorno (CI, desarrollo local sin DB). No afecta a la app real: solo esta herramienta de build.
  (PrismaService.prototype as unknown as { onModuleInit: () => Promise<void> }).onModuleInit =
    async () => undefined;

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
