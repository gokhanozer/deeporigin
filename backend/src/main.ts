/**
 * Application entry point.
 *
 * Bootstraps Nest and installs the HTTP-level concerns that must be configured
 * on the underlying Express instance rather than through DI: proxy trust,
 * security headers, compression, CORS, validation and API documentation.
 */

import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

/**
 * Creates, configures and starts the HTTP server.
 *
 * @returns Resolves once the server is accepting connections.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's own logger, minus the noisy per-request 'verbose' level.
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });
  const nodeEnv = config.get('nodeEnv', { infer: true });

  // ---- Proxy trust ---------------------------------------------------------
  // Required for X-Forwarded-For to be honoured, which both the rate limiter
  // and visit analytics depend on. Set to 1 (not `true`) so only the immediate
  // proxy is trusted — trusting the whole chain would let a client forge the
  // header and evade rate limiting entirely.
  app.set('trust proxy', 1);

  // ---- Security and transport ----------------------------------------------
  app.use(
    helmet({
      // The API serves JSON, not HTML, so CSP would only add overhead here;
      // the Next.js frontend sets its own policy for the pages users see.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ---- Routing -------------------------------------------------------------
  // The version lives in the prefix (`api/v1`) rather than in Nest's versioning
  // system: with a single live version that is simpler, and it keeps the short
  // URLs — which must stay unversioned — off the versioned tree entirely.
  app.setGlobalPrefix(apiPrefix);

  // ---- Validation ----------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      // Drop unknown properties instead of persisting them.
      whitelist: true,
      // …and reject outright when a client sends them, which surfaces typos
      // and blocks mass-assignment attempts rather than failing silently.
      forbidNonWhitelisted: true,
      // Run class-transformer so @Type() coercion of query strings works.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Hide the internal target class name from validation errors.
      validationError: { target: false },
    }),
  );

  // Flush in-flight work on SIGTERM (Prisma's onModuleDestroy needs this).
  app.enableShutdownHooks();

  // ---- API documentation ---------------------------------------------------
  // Off by default in production — a public deployment should not publish a
  // browsable, executable map of its own API. `SWAGGER_ENABLED` overrides that
  // either way, which is how the demo compose stack serves the docs the README
  // links to while still running with NODE_ENV=production.
  if (config.get('swaggerEnabled', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DeepOrigin URL Shortener API')
      .setDescription(
        'Create short links, resolve them, and read popularity analytics. ' +
          'Endpoints marked with a padlock require `Authorization: Bearer <token>`.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
    logger.log(`API documentation available at /${apiPrefix}/docs`);
  }

  await app.listen(port, '0.0.0.0');
  logger.log(`Backend listening on http://localhost:${port}/${apiPrefix} [${nodeEnv}]`);
}

// Top-level failures must exit non-zero so Docker/orchestrators restart the
// container rather than leaving a half-dead process accepting no traffic.
bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start application', error as Error);
  process.exit(1);
});
