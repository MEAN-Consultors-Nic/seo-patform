import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CommsService } from './comms.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('comms')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

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
}
