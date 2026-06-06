import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cycle, CycleSchema } from './cycle.schema';
import { CyclesService } from './cycles.service';
import { CyclesController } from './cycles.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cycle.name, schema: CycleSchema }]),
  ],
  controllers: [CyclesController],
  providers: [CyclesService],
  exports: [CyclesService, MongooseModule],
})
export class CyclesModule {}
