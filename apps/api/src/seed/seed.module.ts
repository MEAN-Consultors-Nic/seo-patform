import { Module } from '@nestjs/common';
import { ClientsModule } from '../modules/clients/clients.module';
import { AuthModule } from '../modules/auth/auth.module';
import { SeedService } from './seed.service';

@Module({
  imports: [ClientsModule, AuthModule],
  providers: [SeedService],
})
export class SeedModule {}
