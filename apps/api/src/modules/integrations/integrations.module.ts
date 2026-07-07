import { Module } from '@nestjs/common';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WordpressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';

/**
 * Integrations barrel — every third-party bridge in one place:
 * Google (GSC, GA4, GBP, Docs, Drive, Gmail scope), Shopify,
 * WordPress, and outbound mail (SMTP).
 *
 * New integrations (Ahrefs, ClickUp, Clarity, Calendly, etc.)
 * land as siblings of these three, joining the same barrel.
 */
@Module({
  imports: [GoogleIntegrationsModule, ShopifyModule, WordpressModule, MailModule],
  exports: [GoogleIntegrationsModule, ShopifyModule, WordpressModule, MailModule],
})
export class IntegrationsModule {}
