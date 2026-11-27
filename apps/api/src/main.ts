import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ErrorEnvelopeFilter());
  app.enableShutdownHooks();
  const port = Number(app.get(ConfigService).get('PORT') ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`);
}

void bootstrap();
