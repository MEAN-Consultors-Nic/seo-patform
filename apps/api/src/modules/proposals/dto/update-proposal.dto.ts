import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { CreateProposalDto } from './create-proposal.dto';

export class UpdateProposalDto extends PartialType(CreateProposalDto) {}

export class SendProposalDto {
  @IsEmail() to!: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() message?: string;
}
