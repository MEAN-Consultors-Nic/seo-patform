import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from '../modules/auth/jwt-auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  getData() {
    return this.appService.getData();
  }
}
