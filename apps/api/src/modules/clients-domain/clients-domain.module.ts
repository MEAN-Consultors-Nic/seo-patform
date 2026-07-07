import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { PackagesModule } from '../packages/packages.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

/**
 * Client-domain barrel — CRUD for the client, their package tier,
 * and the onboarding checklist state. Grouped so consumers can
 * import the whole "clients + everything scoped to them" surface
 * area in one line.
 *
 * Named `ClientsDomainModule` to avoid a class-name clash with
 * the existing `ClientsModule` (which handles just the client CRUD).
 */
@Module({
  imports: [ClientsModule, PackagesModule, OnboardingModule],
  exports: [ClientsModule, PackagesModule, OnboardingModule],
})
export class ClientsDomainModule {}
