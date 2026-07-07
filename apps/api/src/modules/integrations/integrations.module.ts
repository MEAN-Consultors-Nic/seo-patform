import { Module } from '@nestjs/common';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WordpressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { CommsModule } from '../comms/comms.module';

/**
 * Integrations barrel — every third-party bridge in one place:
 * Google (GSC, GA4, GBP, Docs, Drive, Gmail scope), Shopify,
 * WordPress, outbound mail (SMTP), and the Communications module
 * that wraps outbound email + AI-assisted drafting.
 *
 * New integrations (Ahrefs, ClickUp, Clarity, Calendly, etc.)
 * land as siblings, joining the same barrel.
 */
@Module({
  imports: [
    GoogleIntegrationsModule,
    ShopifyModule,
    WordpressModule,
    MailModule,
    CommsModule,
  ],
  exports: [
    GoogleIntegrationsModule,
    ShopifyModule,
    WordpressModule,
    MailModule,
    CommsModule,
  ],
})
export class IntegrationsModule {}
