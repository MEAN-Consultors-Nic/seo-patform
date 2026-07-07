import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { LeadStage } from '@seo/shared';
import { CreateLeadDto } from './create-lead.dto';

const LEAD_STAGES: LeadStage[] = [
  'new',
  'no_show',
  'proposal_sent',
  'closed_won',
  'closed_lost',
];

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class ChangeStageDto {
  @IsIn(LEAD_STAGES) stage!: LeadStage;
  @IsOptional() @IsString() closedReason?: string;
}

export class AddActivityDto {
  @IsIn(['note', 'email', 'call']) kind!: 'note' | 'email' | 'call';
  @IsString() text!: string;
}
