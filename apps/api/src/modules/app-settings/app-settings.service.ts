import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  // Supervisor management lives in SupervisorService now (multi-PIN
  // model — one Supervisor doc per registered person). The legacy
  // single-PIN fields on AppSettings are unused and will be cleaned
  // up on the next schema migration.

  /**
   * Merges a persisted layout with the defaults so that:
   *  - the persisted order is preserved for keys the user already had
   *  - any new section added to the codebase is inserted at its default
   *    position (rather than blindly appended), so hero-type entries
   *    like kpi-snapshot land at the top instead of the bottom
   *  - any persisted key not in defaults is dropped
   *  - return value is always a complete list
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
    // Insert missing keys at their default index so newly-introduced
    // hero sections (like kpi-snapshot at index 0) don't get pushed to
    // the bottom of the layout.
    DEFAULT_REPORT_LAYOUT.forEach((def, defaultIndex) => {
      if (seen.has(def.key)) return;
      const insertAt = Math.min(defaultIndex, out.length);
      out.splice(insertAt, 0, { ...def });
    });
    return out;
  }
}
