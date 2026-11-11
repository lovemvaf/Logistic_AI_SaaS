import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './interceptors/request-logging.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';

const logger = new Logger('APIGateway-Bootstrap');

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Sentry request handler is built-in in v8

  const config = new DocumentBuilder()
    .setTitle('SmartLogi API Gateway')
    .setDescription('Central API Gateway for SmartLogi SaaS Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  logger.log('Swagger documentation available at /api/docs');

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:4001',
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4004',
      'http://localhost:7860',
      'http://localhost:7861',
      'http://localhost:7862',
      'http://localhost:7863',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-User-Id', 'X-Request-Id', 'x-tenant-slug', 'x-portal', 'x-api-key', 'x-ai-api-key'],
    credentials: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.setGlobalPrefix('api', {
    exclude: ['health', 'routes', 'gps/*'],
  });

  app.enableShutdownHooks();

  app.use(json({ limit: '10mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(urlencoded({ limit: '10mb', extended: true, verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  Sentry.setupExpressErrorHandler(app);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`API Gateway is running on port ${port}`);

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received. Shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received. Shutting down gracefully...');
    await app.close();
    process.exit(0);
  });
}
bootstrap();
