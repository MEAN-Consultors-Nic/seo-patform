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
import { PipelineService } from './pipeline.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  AddActivityDto,
  ChangeStageDto,
  UpdateLeadDto,
} from './dto/update-lead.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { LeadStage } from '@seo/shared';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly svc: PipelineService) {}

  @Get('leads')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage?: LeadStage,
  ) {
    return this.svc.findAll(user, stage);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.stats(user);
  }

  @Get('leads/:id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.findOne(id, user);
  }

  @Post('leads')
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(dto, user);
  }

  @Patch('leads/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Post('leads/:id/stage')
  changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.changeStage(id, dto, user);
  }

  @Post('leads/:id/activity')
  addActivity(
    @Param('id') id: string,
    @Body() dto: AddActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.addActivity(id, dto, user);
  }

  @Delete('leads/:id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.remove(id, user);
  }
}
