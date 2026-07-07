import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  list() {
    return this.packages.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packages.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePackageDto) {
    return this.packages.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.packages.remove(id);
  }
}
