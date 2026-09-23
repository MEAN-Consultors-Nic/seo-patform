import { Module } from '@nestjs/common';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WordpressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { SpearModule } from '../spear/spear.module';

/**
 * Integrations barrel — every third-party bridge in one place:
 * Google (GSC, GA4, GBP, Docs, Drive), Shopify, WordPress, and
 * outbound mail (SMTP).
 *
 * New integrations land as siblings, joining the same barrel.
 */
@Module({
  imports: [
    GoogleIntegrationsModule,
    ShopifyModule,
    WordpressModule,
    MailModule,
    SpearModule,
  ],
  exports: [
    GoogleIntegrationsModule,
    ShopifyModule,
    WordpressModule,
    MailModule,
    SpearModule,
  ],
})
export class IntegrationsModule {}
