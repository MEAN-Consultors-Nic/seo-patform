import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CommsService } from './comms.service';
import { AiWriterService } from './ai-writer.service';
import { SendEmailDto } from './dto/send-email.dto';
import { DraftSeoEmailDto } from './dto/draft-seo-email.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('comms')
export class CommsController {
  constructor(
    private readonly comms: CommsService,
    private readonly ai: AiWriterService,
  ) {}

  @Post('emails/send')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendEmailDto,
  ) {
    return this.comms.send(user, dto);
  }

  @Get('emails')
  list(
    @Query('clientId') clientId?: string,
    @Query('kind') kind?: string,
    @Query('senderUserId') senderUserId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.comms.list({
      clientId,
      kind,
      senderUserId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Returns { configured: boolean } so the frontend can hide the AI
   * drafter button when ANTHROPIC_API_KEY isn't set on this env,
   * without probing the endpoint blind.
   */
  @Get('ai/status')
  aiStatus() {
    return { configured: this.ai.isConfigured() };
  }

  @Post('emails/draft-seo-report')
  draftSeoReport(@Body() dto: DraftSeoEmailDto) {
    return this.ai.draftSeoEmail({
      clientName: dto.clientName,
      clientDomain: dto.clientDomain,
      periodLabel: dto.periodLabel,
      kpis: {
        clicks: dto.clicks,
        impressions: dto.impressions,
        avgPosition: dto.avgPosition,
        top10: dto.top10,
      },
      actionsCompleted: dto.actionsCompleted,
      notes: dto.notes,
      signOff: dto.signOff,
    });
  }
}
