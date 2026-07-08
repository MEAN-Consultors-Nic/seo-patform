import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { Roles } from '../auth/roles.guard';

@Controller('services')
export class ServicesController {
  constructor(private readonly svc: ServicesService) {}

  // Everyone with a JWT can read the catalog — the picker on the
  // Client Subscriptions form needs it. Admin-only for writes.
  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @Roles('root', 'owner', 'admin')
  create(@Body() dto: CreateServiceDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('root', 'owner', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('root', 'owner', 'admin')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
