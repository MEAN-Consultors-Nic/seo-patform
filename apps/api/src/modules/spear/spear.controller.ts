import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.guard';
import { SpearProbe, SpearService } from './spear.service';

@Controller('spear')
export class SpearController {
  constructor(private readonly spear: SpearService) {}

  /**
   * Diagnostic only. Admin-and-above because the response says whether a
   * shared credential works and echoes part of Spear's payload — it
   * never echoes the key itself.
   */
  @Get('test-connection')
  @Roles('root', 'owner', 'admin')
  test(@Query('probe') probe?: string) {
    const which: SpearProbe = probe === 'describe' ? 'describe' : 'catalog';
    return this.spear.testConnection(which);
  }
}
