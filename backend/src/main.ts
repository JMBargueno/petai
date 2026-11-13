import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const prefix = configService.get<string>('API_PREFIX', 'v1');
  app.setGlobalPrefix(prefix);

  // Configuración de CORS
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:5173,tauri://localhost');
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Configuración de OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('PetAI API')
    .setDescription('API autoritativa para el ecosistema PetAI (tamagotchi virtual inteligente)')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document);

  // Exportar openapi.json a shared/openapi para generadores de clientes
  const openApiPath = path.resolve(__dirname, '../../../shared/openapi/openapi.json');
  try {
    const dir = path.dirname(openApiPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(openApiPath, JSON.stringify(document, null, 2), 'utf8');
    console.log(`[OpenAPI] Contrato exportado en: ${openApiPath}`);
  } catch (err) {
    console.warn('[OpenAPI] No se pudo exportar openapi.json:', err.message);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`[PetAI Backend] Servidor iniciado en http://localhost:${port}/${prefix}`);
  console.log(`[PetAI Backend] Documentación Swagger en http://localhost:${port}/${prefix}/docs`);
}

bootstrap();
