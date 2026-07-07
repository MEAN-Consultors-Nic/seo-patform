import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProposalsModule } from '../proposals/proposals.module';

/**
 * Sales domain barrel (Phase 4). Groups the pipeline (leads), the
 * proposal generator, follow-up cadence, reactivation cron, and the
 * client-facing questionnaire flow.
 *
 * Wired so far: Pipeline + Proposals. Follow-up cron, reactivation
 * cron, and questionnaires land as follow-up slices.
 */
@Module({
  imports: [PipelineModule, ProposalsModule],
  exports: [PipelineModule, ProposalsModule],
})
export class SalesModule {}
