import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { DomainToolsService } from './domain-tools.service';

@Controller('domain-tools')
export class DomainToolsController {
  constructor(private readonly svc: DomainToolsService) {}

  @Get('lookup')
  lookup(@Query('domain') domain?: string) {
    if (!domain) throw new BadRequestException('domain query param is required');
    return this.svc.lookup(domain);
  }
}
