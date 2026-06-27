import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { RedisService } from './common/services/redis.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const logger = new Logger('Bootstrap');

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3001',
  );

  app.use(helmet());
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Storyshelf API')
    .setDescription('Digital book platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const redisService = app.get(RedisService);
  try {
    await redisService.connect();
  } catch {
    // Redis optional at startup
  }

  await app.listen(port);
  logger.log(`Storyshelf API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
