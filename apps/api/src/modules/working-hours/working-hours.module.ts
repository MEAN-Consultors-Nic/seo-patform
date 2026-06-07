import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkingHours, WorkingHoursSchema } from './working-hours.schema';
import { WorkingHoursService } from './working-hours.service';
import { WorkingHoursController } from './working-hours.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkingHours.name, schema: WorkingHoursSchema },
    ]),
  ],
  controllers: [WorkingHoursController],
  providers: [WorkingHoursService],
  exports: [WorkingHoursService],
})
export class WorkingHoursModule {}
