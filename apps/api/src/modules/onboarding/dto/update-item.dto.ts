import { PartialType } from '@nestjs/mapped-types';
import { CreateOnboardingItemDto } from './create-item.dto';

export class UpdateOnboardingItemDto extends PartialType(CreateOnboardingItemDto) {}
