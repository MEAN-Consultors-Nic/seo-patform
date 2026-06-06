import { Controller, Get, Param } from '@nestjs/common';
import { CyclesService } from './cycles.service';

@Controller('cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get()
  findAll() {
    return this.cycles.findAll();
  }

  @Get('current')
  current() {
    return this.cycles.getCurrent();
  }

  @Get('next')
  next() {
    return this.cycles.getNext();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cycles.findOne(id);
  }
}
