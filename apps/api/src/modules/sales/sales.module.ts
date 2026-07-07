import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';

/**
 * Sales domain barrel (Phase 4). Groups the pipeline (leads), the
 * proposal generator, follow-up cadence, reactivation cron, and the
 * client-facing questionnaire flow.
 *
 * Only Pipeline is wired today; Proposals + questionnaires + cron
 * land as follow-up slices.
 */
@Module({
  imports: [PipelineModule],
  exports: [PipelineModule],
})
export class SalesModule {}
