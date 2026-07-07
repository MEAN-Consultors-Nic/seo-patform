import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from './lead.schema';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';

/**
 * Sales pipeline (Phase 4). Owns the lead lifecycle: new → no-show →
 * proposal_sent → closed_won / closed_lost, with drag-to-stage
 * updates, activity feed, and MRR forecast KPIs.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }])],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
