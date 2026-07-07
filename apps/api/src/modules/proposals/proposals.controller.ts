import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { SendProposalDto, UpdateProposalDto } from './dto/update-proposal.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('proposals')
export class ProposalsController {
  constructor(private readonly svc: ProposalsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.svc.list(user, { status });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.remove(id, user);
  }

  @Post(':id/send')
  send(
    @Param('id') id: string,
    @Body() dto: SendProposalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.send(id, dto, user);
  }

  // --- Public routes -----------------------------------------------------
  @Public()
  @Get('public/:token')
  publicView(@Param('token') token: string) {
    return this.svc.findByShareToken(token);
  }

  @Public()
  @Post('public/:token/sign')
  publicSign(
    @Param('token') token: string,
    @Body() body: { pin: string },
  ) {
    return this.svc.publicSign(token, body?.pin || '');
  }
}
