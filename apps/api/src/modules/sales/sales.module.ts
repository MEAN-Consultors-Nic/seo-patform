import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { QuestionnairesModule } from '../questionnaires/questionnaires.module';

/**
 * Sales domain barrel (Phase 4). Groups the pipeline (leads), the
 * proposal generator + follow-up cron, and the client-facing
 * questionnaire flow. Reactivation cron lives inside PipelineModule.
 */
@Module({
  imports: [PipelineModule, ProposalsModule, QuestionnairesModule],
  exports: [PipelineModule, ProposalsModule, QuestionnairesModule],
})
export class SalesModule {}
