import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Proposal, ProposalSchema } from './proposal.schema';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';
import { CommsModule } from '../comms/comms.module';

/**
 * Proposals sub-module of Sales. Handles the proposal lifecycle
 * (draft -> sent -> viewed -> signed / declined / expired), plus the
 * public-share view for the client.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Proposal.name, schema: ProposalSchema },
    ]),
    CommsModule,
  ],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
