/**
 * Global module exposing {@link PrismaService} application-wide.
 *
 * Marked `@Global()` so feature modules can inject the service without each
 * one having to import `PrismaModule` — the database client is genuinely
 * cross-cutting infrastructure, not a feature dependency.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
