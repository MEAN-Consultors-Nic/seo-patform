import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

/**
 * Placeholder for the future client portal (Phase 6+). The route
 * namespace is reserved now (Core Slice 1.5) so URLs shared with
 * clients later don't require a migration.
 */
@Component({
  selector: 'app-portal-placeholder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-ink-50 p-6">
      <div class="max-w-md text-center">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-brand-500 text-white text-xl font-bold mb-4">
          IT
        </div>
        <h1 class="text-2xl font-bold text-ink-900 mb-2">Client Portal — coming soon</h1>
        <p class="text-sm text-ink-500 leading-relaxed">
          This is where clients will log in to view their SEO reports,
          onboarding progress, and other shared assets. The portal is
          scheduled for a future release. If you were expecting a report,
          check your email — Media Spearhead sends every report as a
          direct link.
        </p>
        <p class="text-xs text-ink-400 mt-6">
          — Media Spearhead
        </p>
      </div>
    </div>
  `,
})
export class PortalPlaceholderComponent {}
