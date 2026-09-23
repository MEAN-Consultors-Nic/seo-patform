import { Module } from '@nestjs/common';
import { SpearController } from './spear.controller';
import { SpearService } from './spear.service';

/**
 * Spear API bridge. Currently a connectivity probe only — whether this
 * server can reach mediaspearhead.com/internal-tools at all is the open
 * question, and nothing else should be built on top until it is answered.
 */
@Module({
  controllers: [SpearController],
  providers: [SpearService],
  exports: [SpearService],
})
export class SpearModule {}
