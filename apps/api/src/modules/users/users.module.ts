import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import {
  Supervisor,
  SupervisorSchema,
} from '../supervisor/supervisor.schema';

@Module({
  imports: [
    AuthModule,
    // Legacy Supervisor collection registered read-only so UsersService
    // can migrate its rows into standard User docs on boot. The
    // Supervisor module itself is being retired (Settings tab removed);
    // this registration exists purely for the one-shot migration.
    MongooseModule.forFeature([
      { name: Supervisor.name, schema: SupervisorSchema },
    ]),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
