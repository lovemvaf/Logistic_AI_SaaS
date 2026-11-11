import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/http/http-exception.filter';
import { RequestLoggingInterceptor } from './core/http/request-logging.interceptor';

const logger = new Logger('CoreAPI-Bootstrap');

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
});

process.on('unhandledRejection', (reason) => {
  logger.warn(`Unhandled Rejection: ${reason}`);
});
process.on('uncaughtException', (err) => {
  logger.warn(`Uncaught Exception: ${err.message}`);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:4001,http://localhost:4002,http://localhost:4003,http://localhost:4004,http://localhost:7860,http://localhost:7861,http://localhost:7862,http://localhost:7863').split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.use(helmet());

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Consumer Kafka (module Notification). Cùng group id với
  // notification-service cũ: trong lúc chuyển đổi, partition được chia giữa
  // hai tiến trình nên không mất message.
  const kafkaBrokers = process.env.KAFKA_BROKERS;
  if (kafkaBrokers && kafkaBrokers.trim()) {
    try {
      await app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.KAFKA,
        options: {
          client: {
            brokers: [kafkaBrokers.trim()],
          },
          consumer: {
            groupId: 'notification-group',
          },
        },
      });
      await app.startAllMicroservices();
      logger.log('Kafka consumer is listening for notification events...');
    } catch (e) {
      logger.warn(
        `Failed to connect to Kafka: ${e instanceof Error ? e.message : 'Unknown error'}. ` +
          'Core API will start without the Kafka consumer.',
      );
    }
  } else {
    logger.log('Kafka disabled (KAFKA_BROKERS not set). Running without Kafka consumer.');
  }

  const config = new DocumentBuilder()
    .setTitle('SmartLogi Core API')
    .setDescription('Modular monolith API for the SmartLogi SaaS platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('admin', 'Admin management endpoints')
    .addTag('tenant', 'Tenant management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  Sentry.setupExpressErrorHandler(app);

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Core API is running on port ${port}`);
  logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
}
bootstrap();
