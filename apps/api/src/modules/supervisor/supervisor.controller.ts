import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/jwt-auth.guard';
import { SupervisorService } from './supervisor.service';
import {
  SupervisorGuard,
  SupervisorPrincipal,
  SupervisorPublic,
} from './supervisor.guard';

class AuthDto {
  @IsString() pin!: string;
}

class CommentDto {
  @IsString() content!: string;
}

/**
 * All supervisor endpoints live under `/supervisor`. The JwtAuthGuard
 * mounted globally is bypassed here via the `@Public()` decorator
 * because the supervisor portal authenticates with a PIN and a
 * dedicated token — the user JWT auth flow never applies. Instead
 * `SupervisorGuard` checks the supervisor-audience JWT issued by the
 * /auth endpoint.
 */
@Public()
@Controller('supervisor')
@UseGuards(SupervisorGuard)
export class SupervisorController {
  constructor(private readonly svc: SupervisorService) {}

  /** PIN -> 12h supervisor token. The only endpoint not requiring a token. */
  @SupervisorPublic()
  @Post('auth')
  auth(@Body() dto: AuthDto) {
    return this.svc.authenticate(dto.pin);
  }

  @Get('clients')
  listClients() {
    return this.svc.listClients();
  }

  @Get('clients/:clientId')
  getClient(@Param('clientId') clientId: string) {
    return this.svc.getClient(clientId);
  }

  @Get('clients/:clientId/cycles')
  listCycles(@Param('clientId') clientId: string) {
    return this.svc.listClientCycles(clientId);
  }

  @Get('clients/:clientId/cycles/:cycleId')
  getCycleDashboard(
    @Param('clientId') clientId: string,
    @Param('cycleId') cycleId: string,
  ) {
    return this.svc.getCycleDashboard(clientId, cycleId);
  }

  @Post('tasks/:taskId/comments')
  addComment(
    @Param('taskId') taskId: string,
    @Body() dto: CommentDto,
    @Req() req: Request & { supervisor?: SupervisorPrincipal },
  ) {
    const name = req.supervisor?.name ?? 'Supervisor';
    return this.svc.addSupervisorComment(taskId, dto, name);
  }
}
