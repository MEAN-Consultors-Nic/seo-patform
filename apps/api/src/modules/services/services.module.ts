import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Service, ServiceSchema } from './service.schema';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

/**
 * Global so any module that needs to look up a Service by slug (e.g.
 * PackagesService for the backfill, ClientsService for subscription
 * validation) can inject ServicesService without threading the
 * import through each parent module.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Service.name, schema: ServiceSchema }]),
  ],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService, MongooseModule],
})
export class ServicesModule {}
