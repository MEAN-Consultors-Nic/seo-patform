import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import {
  DEFAULT_REPORT_LAYOUT,
  ReportSectionConfig,
  ReportSectionKey,
} from '@seo/shared';
import { AppSettings, AppSettingsDocument } from './app-settings.schema';

const VALID_KEYS: ReportSectionKey[] = DEFAULT_REPORT_LAYOUT.map((s) => s.key);

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectModel(AppSettings.name)
    private readonly model: Model<AppSettingsDocument>,
  ) {}

  async getReportLayout(): Promise<ReportSectionConfig[]> {
    const doc = await this.model.findOne().lean().exec();
    return this.mergeWithDefaults(doc?.reportLayout);
  }

  async setReportLayout(
    layout: ReportSectionConfig[],
  ): Promise<ReportSectionConfig[]> {
    if (!Array.isArray(layout)) {
      throw new BadRequestException('layout must be an array');
    }
    const seen = new Set<string>();
    const cleaned: ReportSectionConfig[] = [];
    for (const s of layout) {
      if (!s || typeof s !== 'object') continue;
      if (!VALID_KEYS.includes(s.key)) {
        throw new BadRequestException(`Unknown section key: ${s.key}`);
      }
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      cleaned.push({ key: s.key, visible: s.visible !== false });
    }
    // If the user submitted a partial list, append the missing sections at
    // the end (visible) so we never silently drop them.
    for (const def of DEFAULT_REPORT_LAYOUT) {
      if (!seen.has(def.key)) cleaned.push({ ...def });
    }
    await this.model
      .findOneAndUpdate(
        {},
        { $set: { reportLayout: cleaned } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return cleaned;
  }

  // --- Supervisor portal -------------------------------------------------

  /**
   * Returns the supervisor-portal status without ever exposing the PIN
   * to anyone other than via regeneratePin(). The admin Settings page
   * uses this to render the toggle + "no PIN set" / "PIN active" copy.
   */
  async getSupervisorState(): Promise<{
    enabled: boolean;
    hasPin: boolean;
  }> {
    const doc = await this.model.findOne().lean().exec();
    return {
      enabled: !!doc?.supervisorEnabled,
      hasPin: !!doc?.supervisorPinHash,
    };
  }

  async setSupervisorEnabled(enabled: boolean): Promise<void> {
    await this.model
      .findOneAndUpdate(
        {},
        { $set: { supervisorEnabled: enabled } },
        { upsert: true, new: true },
      )
      .exec();
  }

  /**
   * Regenerates a fresh 6-digit PIN, stores plaintext + hash, and returns
   * the plaintext so the admin Settings page can display it ONCE. After
   * the page is closed, the admin can re-view the plaintext via
   * revealSupervisorPin (also a privileged endpoint).
   */
  async regenerateSupervisorPin(): Promise<{ pin: string }> {
    const pin = String(randomInt(100000, 1000000));
    const hash = await bcrypt.hash(pin, 10);
    await this.model
      .findOneAndUpdate(
        {},
        {
          $set: {
            supervisorPin: pin,
            supervisorPinHash: hash,
            supervisorEnabled: true,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    return { pin };
  }

  /** Reveals the stored plaintext PIN. Restricted to admins at the controller. */
  async revealSupervisorPin(): Promise<{ pin: string | null }> {
    const doc = await this.model.findOne().lean().exec();
    return { pin: doc?.supervisorPin ?? null };
  }

  async clearSupervisorPin(): Promise<void> {
    await this.model
      .findOneAndUpdate(
        {},
        {
          $unset: {
            supervisorPin: '',
            supervisorPinHash: '',
          },
          $set: { supervisorEnabled: false },
        },
      )
      .exec();
  }

  /**
   * Checks a candidate PIN against the stored hash. Returns true when the
   * supervisor portal is enabled AND the PIN matches. Used by
   * SupervisorAuthService at the auth endpoint.
   */
  async verifySupervisorPin(pin: string): Promise<boolean> {
    const doc = await this.model.findOne().lean().exec();
    if (!doc?.supervisorEnabled || !doc.supervisorPinHash) return false;
    return bcrypt.compare(pin, doc.supervisorPinHash);
  }

  /**
   * Merges a persisted layout with the defaults so that:
   *  - any new section added to the codebase appears at the end (visible)
   *  - any persisted key not in defaults is dropped
   *  - return value is always a complete list in order
   */
  private mergeWithDefaults(
    persisted: ReportSectionConfig[] | undefined,
  ): ReportSectionConfig[] {
    if (!persisted || !persisted.length) {
      return DEFAULT_REPORT_LAYOUT.map((s) => ({ ...s }));
    }
    const seen = new Set<string>();
    const out: ReportSectionConfig[] = [];
    for (const s of persisted) {
      if (!VALID_KEYS.includes(s.key)) continue;
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      out.push({ key: s.key, visible: s.visible !== false });
    }
    for (const def of DEFAULT_REPORT_LAYOUT) {
      if (!seen.has(def.key)) out.push({ ...def });
    }
    return out;
  }
}
