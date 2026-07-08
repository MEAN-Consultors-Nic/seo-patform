import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/**
 * PPC campaigns landing tab. Placeholder until the full PPC module
 * (Google Ads / Meta Ads integration) lands. Kept as a distinct
 * component so the sidebar can render it under the PPC group without
 * a special-case switch branch.
 */
@Component({
  selector: 'app-client-ppc-campaigns-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card p-8 text-center">
      <div class="text-4xl mb-2">📈</div>
      <h2 class="text-lg font-bold text-ink-900">PPC campaigns</h2>
      <p class="text-sm text-ink-500 mt-2 max-w-md mx-auto">
        Google Ads &amp; Meta Ads dashboard is coming soon. Once Integrations are
        wired, this tab will list active campaigns, spend, CPC and lead
        volume — with the same follow-up + reporting cadence as SEO.
      </p>
    </div>
  `,
})
export class ClientPpcCampaignsTabComponent {}

/**
 * Website ops landing tab. Placeholder until the full Web module
 * (Deploys / uptime / DNS / hosting) lands. Complements the existing
 * platform-specific tabs (Shopify / WordPress / Ecommerce) which
 * appear in the same group when the client has that platform set.
 */
@Component({
  selector: 'app-client-web-ops-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card p-8 text-center">
      <div class="text-4xl mb-2">🌐</div>
      <h2 class="text-lg font-bold text-ink-900">Website ops</h2>
      <p class="text-sm text-ink-500 mt-2 max-w-md mx-auto">
        Deploys, uptime, DNS and hosting renewals will live here. For now,
        use <strong>Setup → Credentials</strong> to store hosting logins and
        <strong>Setup → Integrations</strong> for CMS connections.
      </p>
    </div>
  `,
})
export class ClientWebOpsTabComponent {
  @Input() clientId?: string;
}
