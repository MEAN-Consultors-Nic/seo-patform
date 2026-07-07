import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SentEmail, SentEmailSchema } from './sent-email.schema';
import { CommsService } from './comms.service';
import { CommsController } from './comms.controller';
import { GmailService } from './gmail.service';
import { AiWriterService } from './ai-writer.service';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

/**
 * Communications module (Phase 3 of the modularization roadmap).
 * Owns outbound email through the sender's connected Gmail account,
 * the sent-mail archive, and the AI-assisted email drafter (added in
 * a follow-up slice).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SentEmail.name, schema: SentEmailSchema },
    ]),
    GoogleIntegrationsModule,
  ],
  controllers: [CommsController],
  providers: [GmailService, CommsService, AiWriterService],
  exports: [GmailService, CommsService, AiWriterService],
})
export class CommsModule {}
