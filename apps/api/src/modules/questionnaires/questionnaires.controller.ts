import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { QuestionnaireKind } from '@seo/shared';
import { Public } from '../auth/jwt-auth.guard';
import { QuestionnairesService } from './questionnaires.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

class CreateQuestionnaireDto {
  @IsIn(['seo', 'ppc', 'website', 'combo']) kind!: QuestionnaireKind;
  @IsString() businessName!: string;
  @IsOptional() @IsEmail() invitedEmail?: string;
  @IsOptional() @IsMongoId() leadId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
}

@Controller('questionnaires')
export class QuestionnairesController {
  constructor(private readonly svc: QuestionnairesService) {}

  @Get()
  list(
    @Query('kind') kind?: QuestionnaireKind,
    @Query('status') status?: string,
  ) {
    return this.svc.list({ kind, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateQuestionnaireDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.create(dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.remove(id, user);
  }

  // --- Public routes -----------------------------------------------------
  @Public()
  @Get('public/:token')
  publicView(@Param('token') token: string) {
    return this.svc.findByToken(token);
  }

  @Public()
  @Post('public/:token/submit')
  publicSubmit(
    @Param('token') token: string,
    @Body() body: { answers: Record<string, unknown> },
  ) {
    return this.svc.submit(token, body?.answers || {});
  }
}
