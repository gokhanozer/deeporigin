/**
 * Redirect feature module. Depends on {@link VisitsModule} for click tracking.
 */

import { Module } from '@nestjs/common';
import { VisitsModule } from '../visits/visits.module';
import { RedirectController } from './redirect.controller';
import { RedirectService } from './redirect.service';

@Module({
  imports: [VisitsModule],
  controllers: [RedirectController],
  providers: [RedirectService],
  exports: [RedirectService],
})
export class RedirectModule {}
