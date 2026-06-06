import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = process.env.API_GLOBAL_PREFIX || 'api';
  app.setGlobalPrefix(globalPrefix);

  // CORS: comma-separated origins via env, otherwise reflect any origin (dev default).
  // Values starting and ending with "/" are treated as regex literals (e.g. "/.*\\.vercel\\.app$/").
  const corsRaw = process.env.CORS_ORIGINS?.trim();
  const corsOrigins: boolean | (string | RegExp)[] = corsRaw
    ? corsRaw.split(',').map((o) => {
        const t = o.trim();
        const m = t.match(/^\/(.+)\/([gimsuy]*)$/);
        return m ? new RegExp(m[1], m[2]) : t;
      })
    : true;
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = process.env.API_PORT || process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
