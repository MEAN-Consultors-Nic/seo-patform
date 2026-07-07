import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Package, PackageSchema } from './package.schema';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';
import { Client, ClientSchema } from '../clients/client.schema';
import {
  TaskTemplate,
  TaskTemplateSchema,
} from '../task-templates/task-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      // Registered here (in addition to their owning modules) so the
      // one-shot migration in PackagesService.onModuleInit can update
      // clients + templates without pulling in the full ClientsModule
      // and creating a circular import.
      { name: Client.name, schema: ClientSchema },
      { name: TaskTemplate.name, schema: TaskTemplateSchema },
    ]),
  ],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService, MongooseModule],
})
export class PackagesModule {}
