/**
 * Visit-tracking module. Exports {@link VisitsService} for the redirect and
 * analytics modules.
 */

import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';

@Module({
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
