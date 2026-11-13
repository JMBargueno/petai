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

  // Configuración de CORS permisiva para desarrollo local (Vite, Tauri, localhost, 127.0.0.1)
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
  const openApiCandidates = [
    path.resolve(process.cwd(), 'shared/openapi/openapi.json'),
    path.resolve(process.cwd(), '../shared/openapi/openapi.json'),
    path.resolve(__dirname, '../../../shared/openapi/openapi.json'),
  ];
  const openApiPath = openApiCandidates.find((p) => fs.existsSync(path.dirname(p))) || openApiCandidates[0];
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
  await app.listen(port, '0.0.0.0');
  console.log(`[PetAI Backend] Servidor iniciado en http://localhost:${port}/${prefix}`);
  console.log(`[PetAI Backend] Documentación Swagger en http://localhost:${port}/${prefix}/docs`);
}

bootstrap();
