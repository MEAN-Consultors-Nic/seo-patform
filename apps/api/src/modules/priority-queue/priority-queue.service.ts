import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google } from 'googleapis';
import { Client, ClientDocument } from '../clients/client.schema';
import { ClientsService } from '../clients/clients.service';
import { Task, TaskDocument } from '../tasks/task.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { GoogleOAuthService } from '../google-integrations/google-oauth.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import {
  PriorityQueueMomentumCache,
  PriorityQueueMomentumCacheDocument,
} from './priority-queue-cache.schema';

export interface PriorityQueueReason {
  /** Short tag — appears as a chip on the UI card. */
  tag: string;
  /** Plain-language explanation of the contribution. */
  detail: string;
  /** Points this reason contributed to the score. */
  points: number;
}

export interface PriorityQueueItem {
  clientId: string;
  name: string;
  tier: string;
  logoUrl?: string;
  score: number;
  /**
   * Per-signal points so the UI can render a compact breakdown without
   * re-deriving the math.
   */
  signals: {
    cycleUrgency: number;
    momentum: number;
    pendingWork: number;
  };
  reasons: PriorityQueueReason[];
  momentumStale: boolean;
}

export interface PriorityQueueResponse {
  generatedAt: string;
  items: PriorityQueueItem[];
  /**
   * True when at least one client's momentum was served from a stale or
   * missing cache. The UI surfaces this so the user knows a momentum
   * refresh hasn't run today yet.
   */
  hasStaleMomentum: boolean;
}

const MOMENTUM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Per-client GSC call budget. Sticks well under the Heroku H12 30s
 * hard limit when we run 12+ clients in parallel and a Google node is
 * slow to respond — we'd rather degrade momentum to 0 for that client
 * than fail the whole endpoint.
 */
const GSC_PER_CALL_TIMEOUT_MS = 3500;

@Injectable()
export class PriorityQueueService {
  private readonly logger = new Logger(PriorityQueueService.name);

  constructor(
    private readonly clients: ClientsService,
    private readonly oauth: GoogleOAuthService,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Cycle.name)
    private readonly cycleModel: Model<CycleDocument>,
    @InjectModel(PriorityQueueMomentumCache.name)
    private readonly momentumCache: Model<PriorityQueueMomentumCacheDocument>,
  ) {}

  async getQueue(user: AuthenticatedUser): Promise<PriorityQueueResponse> {
    // Scope to clients the caller can see. Managers/root pass null which
    // we expand to "all active clients" below.
    const accessible = await this.clients.listAccessibleIds(user);
    const filter: Record<string, unknown> = { active: true };
    if (accessible !== null) {
      filter._id = { $in: accessible };
    }
    const clients = await this.clientModel
      .find(filter)
      .select('_id name tier logoUrl hoursPerCycle gscSiteUrl')
      .lean()
      .exec();

    const cycle = await this.findCurrentCycle();
    const items = await Promise.all(
      clients.map((c) => this.scoreClient(c, cycle, user)),
    );
    items.sort((a, b) => b.score - a.score);

    return {
      generatedAt: new Date().toISOString(),
      items,
      hasStaleMomentum: items.some((i) => i.momentumStale),
    };
  }

  /**
   * Single-pass score for one client. Each signal contributes up to a
   * fixed cap so the total stays in 0-100 and ranks are commensurable
   * across clients regardless of which signal dominates a given day.
   */
  private async scoreClient(
    client: {
      _id: Types.ObjectId;
      name: string;
      tier: string;
      logoUrl?: string;
      hoursPerCycle: number;
      gscSiteUrl?: string;
    },
    cycle: { _id: Types.ObjectId; startDate: Date; endDate: Date } | null,
    user: AuthenticatedUser,
  ): Promise<PriorityQueueItem> {
    const reasons: PriorityQueueReason[] = [];

    const [cycleUrgency, momentum, pendingWork] = await Promise.all([
      this.scoreCycleUrgency(client, cycle, reasons),
      this.scoreMomentum(client, user, reasons),
      this.scorePendingWork(client, cycle, reasons),
    ]);

    const score = cycleUrgency.points + momentum.points + pendingWork.points;
    return {
      clientId: String(client._id),
      name: client.name,
      tier: client.tier,
      logoUrl: client.logoUrl,
      score: Math.round(score),
      signals: {
        cycleUrgency: Math.round(cycleUrgency.points),
        momentum: Math.round(momentum.points),
        pendingWork: Math.round(pendingWork.points),
      },
      reasons: reasons.sort((a, b) => b.points - a.points),
      momentumStale: momentum.stale,
    };
  }

  /**
   * Cycle urgency — does progress lag the timeline? Computes the gap
   * between elapsed-time fraction and completed-hours fraction. Behind
   * by half the cycle equals the full 40-point cap.
   */
  private async scoreCycleUrgency(
    client: { _id: Types.ObjectId; hoursPerCycle: number; name: string },
    cycle: { _id: Types.ObjectId; startDate: Date; endDate: Date } | null,
    reasons: PriorityQueueReason[],
  ): Promise<{ points: number }> {
    if (!cycle) return { points: 0 };
    const start = new Date(cycle.startDate).getTime();
    const end = new Date(cycle.endDate).getTime();
    const now = Date.now();
    const total = end - start;
    if (total <= 0) return { points: 0 };
    const elapsedFraction = Math.max(0, Math.min(1, (now - start) / total));

    const agg = await this.taskModel
      .aggregate([
        {
          $match: {
            clientId: client._id,
            cycleId: cycle._id,
          },
        },
        {
          $group: {
            _id: null,
            actual: { $sum: '$actualHours' },
          },
        },
      ])
      .exec();
    const hoursActual = agg[0]?.actual ?? 0;
    const hoursAssigned = client.hoursPerCycle || 1;
    const completedFraction = Math.max(
      0,
      Math.min(1, hoursActual / hoursAssigned),
    );

    const behindBy = elapsedFraction - completedFraction;
    if (behindBy <= 0) return { points: 0 };
    // 50% behind earns the full 40 cap; linearly scale below that.
    const points = Math.min(40, behindBy * 80);
    if (points >= 5) {
      const pctBehind = Math.round(behindBy * 100);
      reasons.push({
        tag: 'Behind on cycle',
        detail: `${pctBehind}% behind schedule — ${hoursActual.toFixed(1)}h logged of ${hoursAssigned}h, cycle ${Math.round(elapsedFraction * 100)}% elapsed`,
        points,
      });
    }
    return { points };
  }

  /**
   * SEO momentum — week-over-week clicks delta from GSC, served from a
   * 24h cache. A negative delta scores higher (visibility falling). If
   * the cache is missing or stale the score is 0 and we flag stale so
   * the UI can prompt a refresh.
   */
  private async scoreMomentum(
    client: { _id: Types.ObjectId; gscSiteUrl?: string; name: string },
    user: AuthenticatedUser,
    reasons: PriorityQueueReason[],
  ): Promise<{ points: number; stale: boolean }> {
    if (!client.gscSiteUrl) return { points: 0, stale: false };
    const cached = await this.momentumCache.findOne({ clientId: client._id }).lean();
    const fresh = cached && Date.now() - cached.refreshedAt.getTime() < MOMENTUM_CACHE_TTL_MS;

    let snapshot = cached;
    if (!fresh) {
      const pulled = await this.pullMomentum(client.gscSiteUrl, user.userId!);
      if (pulled) {
        await this.momentumCache.updateOne(
          { clientId: client._id },
          {
            $set: { ...pulled, clientId: client._id, refreshedAt: new Date() },
          },
          { upsert: true },
        );
        snapshot = { ...pulled, clientId: client._id, refreshedAt: new Date() } as typeof cached;
      }
    }

    if (!snapshot) return { points: 0, stale: !fresh };

    // Clicks delta is the headline signal — a meaningful drop in clicks
    // is what triggers an "intervene now" reaction.
    const clicksDelta = snapshot.clicksThisWeek - snapshot.clicksLastWeek;
    const clicksDeltaPct =
      snapshot.clicksLastWeek > 0
        ? clicksDelta / snapshot.clicksLastWeek
        : 0;
    let points = 0;
    if (clicksDeltaPct <= -0.2) points += 30;
    else if (clicksDeltaPct <= -0.1) points += 15;
    else if (clicksDeltaPct <= -0.05) points += 5;
    // Position is a secondary signal — only flag big shifts.
    const posDelta = snapshot.positionThisWeek - snapshot.positionLastWeek;
    if (posDelta >= 1.5) points = Math.min(30, points + 10);

    if (points >= 5) {
      const dropPct = Math.round(Math.abs(clicksDeltaPct) * 100);
      const detail =
        clicksDeltaPct < 0
          ? `Clicks down ${dropPct}% week-over-week (${snapshot.clicksThisWeek} vs ${snapshot.clicksLastWeek})`
          : `Avg position worsened by ${posDelta.toFixed(1)} positions week-over-week`;
      reasons.push({ tag: 'SEO drop', detail, points });
    }
    return { points: Math.min(30, points), stale: !fresh && !snapshot };
  }

  /**
   * Pending work — high-priority tasks not yet completed weigh more,
   * medium contributes a little, blocked tasks count too because they
   * still need attention.
   */
  private async scorePendingWork(
    client: { _id: Types.ObjectId; name: string },
    cycle: { _id: Types.ObjectId } | null,
    reasons: PriorityQueueReason[],
  ): Promise<{ points: number }> {
    if (!cycle) return { points: 0 };
    const tasks = await this.taskModel
      .find({
        clientId: client._id,
        cycleId: cycle._id,
        status: { $in: ['pending', 'in_progress', 'blocked'] },
      })
      .select('priority status')
      .lean()
      .exec();
    let high = 0;
    let medium = 0;
    let blocked = 0;
    for (const t of tasks) {
      if (t.status === 'blocked') blocked++;
      if (t.priority === 'high') high++;
      else if (t.priority === 'medium') medium++;
    }
    const raw = high * 5 + medium * 2 + blocked * 3;
    const points = Math.min(30, raw);
    if (points >= 5) {
      const parts: string[] = [];
      if (high) parts.push(`${high} high-priority`);
      if (medium) parts.push(`${medium} medium-priority`);
      if (blocked) parts.push(`${blocked} blocked`);
      reasons.push({
        tag: 'Open work',
        detail: parts.join(', ') + ' open in this cycle',
        points,
      });
    }
    return { points };
  }

  /**
   * Pulls the last 14 days from GSC and bucketizes into this-week (last
   * 7) vs last-week (the 7 before). Returns null on any failure so the
   * caller can fall back to cache or zero.
   */
  private async pullMomentum(
    siteUrl: string,
    userId: string,
  ): Promise<{
    clicksThisWeek: number;
    clicksLastWeek: number;
    impressionsThisWeek: number;
    impressionsLastWeek: number;
    positionThisWeek: number;
    positionLastWeek: number;
  } | null> {
    try {
      const auth = await this.oauth.getAuthorizedClient(userId);
      const sc = google.searchconsole({ version: 'v1', auth });

      const today = new Date();
      today.setUTCDate(today.getUTCDate() - 1); // GSC has a 1-2 day lag
      const endThis = this.iso(today);
      const startThis = this.iso(this.addDays(today, -6));
      const endLast = this.iso(this.addDays(today, -7));
      const startLast = this.iso(this.addDays(today, -13));

      const promise = Promise.all([
        sc.searchanalytics.query({
          siteUrl,
          requestBody: {
            startDate: startThis,
            endDate: endThis,
            dimensions: [],
            rowLimit: 1,
          },
        }),
        sc.searchanalytics.query({
          siteUrl,
          requestBody: {
            startDate: startLast,
            endDate: endLast,
            dimensions: [],
            rowLimit: 1,
          },
        }),
      ]);
      const [thisWeek, lastWeek] = (await this.withTimeout(
        promise,
        GSC_PER_CALL_TIMEOUT_MS,
      )) as Awaited<typeof promise>;
      const t = thisWeek.data.rows?.[0];
      const l = lastWeek.data.rows?.[0];
      return {
        clicksThisWeek: t?.clicks ?? 0,
        clicksLastWeek: l?.clicks ?? 0,
        impressionsThisWeek: t?.impressions ?? 0,
        impressionsLastWeek: l?.impressions ?? 0,
        positionThisWeek: t?.position ?? 0,
        positionLastWeek: l?.position ?? 0,
      };
    } catch (err) {
      this.logger.warn(
        `Momentum pull failed for site=${siteUrl}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`GSC timeout after ${ms}ms`)), ms),
      ),
    ]);
  }

  private addDays(d: Date, n: number): Date {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + n);
    return next;
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private async findCurrentCycle(): Promise<{
    _id: Types.ObjectId;
    startDate: Date;
    endDate: Date;
  } | null> {
    const now = new Date();
    return (await this.cycleModel
      .findOne({ startDate: { $lte: now }, endDate: { $gte: now } })
      .select('_id startDate endDate')
      .lean()
      .exec()) as { _id: Types.ObjectId; startDate: Date; endDate: Date } | null;
  }
}
