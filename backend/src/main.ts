import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from 'socket.io-redis';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import { applyCors } from './common/cors';
import { applySecurity } from './common/security';
import { envSchema } from './config/env.config';
import { initOtel } from './observability/otel-sdk';
import { createNestLogger } from './observability/log-serializer';

/** Exporta openapi.json a shared/openapi para los generadores de clientes. */
function exportOpenApi(document: unknown) {
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
    console.warn('[OpenAPI] No se pudo exportar openapi.json:', (err as Error).message);
  }
}

/**
 * R-02: estado compartido de realtime en Redis para poder escalar a varias réplicas del backend.
 * Opt-in por env: `REALTIME_REDIS=true` lo activa. En una sola réplica (dev) el adaptador in-memory
 * por defecto de Socket.IO basta; con N réplicas (prod) se activa para que emits y salas se
 * sincronicen entre instancias. Usa el mismo Redis (REDIS_URL) y un canal con prefijo de entorno.
 * Degrada a in-memory si no puede engancharse (nunca rompe el arranque).
 */
function applyRealtimeRedisAdapter(app: INestApplication, configService: ConfigService): void {
  if ((configService.get<string>('REALTIME_REDIS') ?? 'false') !== 'true') return;
  try {
    const gateway = app.get(RealtimeGateway);
    const io = gateway.server;
    if (!io) return;
    const uri = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const env = configService.get<string>('NODE_ENV') ?? 'development';
    io.adapter(createAdapter(uri, { key: `petai:${env}:realtime` }));
    console.log('[PetAI] Realtime: adaptador de Redis activo (estado compartido entre réplicas)');
  } catch (err) {
    console.warn('[PetAI] No se pudo activar el adaptador de Redis de realtime:', (err as Error).message);
  }
}

async function bootstrap() {
  // Validamos el entorno y arrancamos el SDK de OpenTelemetry ANTES del bootstrap de Nest
  // (T005) para que el auto-instrumentado se hookue desde el primer request.
  const env = envSchema.parse(process.env);
  const otelConfig = new ConfigService(env as Record<string, unknown>);
  initOtel(otelConfig);
  const logger = createNestLogger(env.NODE_ENV);

  const app = await NestFactory.create(AppModule, { logger });
  const configService = app.get(ConfigService);

  // Detrás de un proxy/balanceador hay que declarar cuántos saltos son de confianza para que req.ip
  // (usado en el límite de intentos) sea la IP real y no la del proxy ni una cabecera falsificada.
  const trustProxy = Number(configService.get('TRUST_PROXY') ?? 0);
  if (trustProxy > 0) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  const prefix = configService.get<string>('API_PREFIX', 'v1');
  app.setGlobalPrefix(prefix);

  // Cierre ordenado: Nest cierra Prisma, Redis y el servidor al recibir SIGTERM/SIGINT
  app.enableShutdownHooks();

  // CORS: solo los orígenes de CORS_ORIGINS (Vite y Tauri por defecto), no cualquiera
  applyCors(app, configService.get<string>('CORS_ORIGINS'));

  // OpenAPI / Swagger: por defecto solo fuera de producción (SWAGGER_ENABLED lo fuerza en cualquier entorno)
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled = (configService.get<string>('SWAGGER_ENABLED') ?? (isProduction ? 'false' : 'true')) === 'true';
  applySecurity(app, { swagger: swaggerEnabled });
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PetAI API')
      .setDescription('API autoritativa para el ecosistema PetAI (tamagotchi virtual inteligente)')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document);

    // El contrato OpenAPI compartido solo se regenera en desarrollo (es una herramienta de build, no de servidor)
    if (!isProduction) exportOpenApi(document);
  }

  const port = configService.get<number>('PORT', 3000);
  // Inicializa la app (incluye el servidor de sockets) antes de enganchar el adaptador de Redis (R-02).
  await app.init();
  applyRealtimeRedisAdapter(app, configService);
  await app.listen(port, '0.0.0.0');
  console.log(`[PetAI Backend] Servidor iniciado en http://localhost:${port}/${prefix}`);
  if (swaggerEnabled) console.log(`[PetAI Backend] Documentación Swagger en http://localhost:${port}/${prefix}/docs`);
}

bootstrap();
