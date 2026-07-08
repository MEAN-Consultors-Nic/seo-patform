import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from './lead.schema';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';
import { CommsModule } from '../comms/comms.module';

/**
 * Sales pipeline (Phase 4). Owns the lead lifecycle: new → no-show →
 * proposal_sent → closed_won / closed_lost, with drag-to-stage
 * updates, activity feed, MRR forecast KPIs, and (Slice 4.6) an
 * AI-drafted reactivation email for stale closed_lost leads.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }]),
    CommsModule,
  ],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
