import { Module } from '@nestjs/common';
import { DomainToolsController } from './domain-tools.controller';
import { DomainToolsService } from './domain-tools.service';

@Module({
  controllers: [DomainToolsController],
  providers: [DomainToolsService],
})
export class DomainToolsModule {}
