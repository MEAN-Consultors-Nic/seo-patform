import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { google } from 'googleapis';
import { Model, Types } from 'mongoose';
import {
  ContentAttachment,
  ContentIndexationStatus,
  ContentStatus,
} from '@seo/shared';
import { ContentPiece, ContentPieceDocument } from './content-piece.schema';
import { UpsertContentDto } from './dto/upsert-content.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import { GoogleOAuthService } from '../google-integrations/google-oauth.service';

// Legacy statuses retired (brief / review / archived) get mapped to the
// nearest active bucket so historic documents keep showing up in the new
// 3-column kanban. Writes are restricted to the new 3 values via the DTO.
const LEGACY_STATUS_MAP: Record<string, ContentStatus> = {
  brief: 'draft',
  review: 'draft',
  archived: 'published',
};

function normalizeStatus<T extends { status?: string }>(piece: T): T {
  if (piece.status && LEGACY_STATUS_MAP[piece.status]) {
    piece.status = LEGACY_STATUS_MAP[piece.status];
  }
  return piece;
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectModel(ContentPiece.name)
    private readonly model: Model<ContentPieceDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
    private readonly oauth: GoogleOAuthService,
  ) {}

  private async ensureAccessToContent(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<ContentPieceDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Content ${id} not found`);
    if (user) await this.clients.assertAccess(doc.clientId.toString(), user);
    return doc;
  }

  async list(
    filters: { clientId?: string; status?: string } = {},
    user?: AuthenticatedUser,
  ) {
    const q: Record<string, unknown> = {};
    if (filters.clientId) {
      if (user) await this.clients.assertAccess(filters.clientId, user);
      q.clientId = new Types.ObjectId(filters.clientId);
    } else if (user) {
      const accessibleIds = await this.clients.listAccessibleIds(user);
      if (accessibleIds !== null) q.clientId = { $in: accessibleIds };
    }
    if (filters.status) {
      // Expand the filter to also match legacy statuses that map to it,
      // so e.g. filter status=draft also returns docs still stored as
      // 'brief' or 'review'.
      const legacyEquivalents = Object.entries(LEGACY_STATUS_MAP)
        .filter(([, v]) => v === filters.status)
        .map(([k]) => k);
      q.status =
        legacyEquivalents.length > 0
          ? { $in: [filters.status, ...legacyEquivalents] }
          : filters.status;
    }
    const docs = await this.model.find(q).sort({ updatedAt: -1 }).lean().exec();
    return docs.map((d) => normalizeStatus(d));
  }

  create(dto: UpsertContentDto) {
    return this.model.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
    });
  }

  async update(
    id: string,
    dto: Partial<UpsertContentDto>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    if (dto.clientId && user) await this.clients.assertAccess(dto.clientId, user);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    if (dto.status === 'published') patch.publishedAt = new Date();
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  /**
   * Pieces published during a date range. Used by the public report's
   * Actions Taken section to highlight what content went live in the
   * current cycle.
   */
  async publishedInRange(
    clientId: string,
    from: Date,
    to: Date,
  ): Promise<ContentPiece[]> {
    const docs = await this.model
      .find({
        clientId: new Types.ObjectId(clientId),
        status: 'published',
        publishedAt: { $gte: from, $lte: to },
      })
      .sort({ publishedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => normalizeStatus(d));
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToContent(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Content ${id} not found`);
    return { deleted: true };
  }

  async addAttachment(
    id: string,
    attachment: Partial<ContentAttachment>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    if (!attachment.publicId || !attachment.url) {
      throw new NotFoundException('Attachment missing publicId or url');
    }
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          $push: {
            attachments: {
              ...attachment,
              uploadedAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  async removeAttachment(
    id: string,
    publicId: string,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { $pull: { attachments: { publicId } } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  /**
   * Runs the client's assigned strategist's Google Search Console
   * URL Inspection against this piece's publishedUrl. Persists the
   * verdict + coverage state so the UI can show freshness without
   * a re-check. Preserves any prior indexingRequestedAt timestamp so
   * the "requested at" chip doesn't get cleared by a subsequent
   * check.
   */
  async checkIndexation(id: string, user?: AuthenticatedUser) {
    const piece = await this.ensureAccessToContent(id, user);
    if (!piece.publishedUrl) {
      throw new BadRequestException(
        'This piece has no published URL yet. Add one before checking indexation.',
      );
    }
    const { ownerUserId, siteUrl } = await this.resolveGscContext(
      piece.clientId.toString(),
    );

    const auth = await this.oauth.getAuthorizedClient(ownerUserId);
    const sc = google.searchconsole({ version: 'v1', auth });
    let inspectionResult;
    try {
      const res = await sc.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: piece.publishedUrl,
          siteUrl,
        },
      });
      inspectionResult = res.data.inspectionResult;
    } catch (err) {
      this.logger.error(
        `URL Inspection failed for content ${id}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Google Search Console rejected the check: ${(err as Error).message}`,
      );
    }

    const idx = inspectionResult?.indexStatusResult;
    const patch: ContentIndexationStatus = {
      verdict: idx?.verdict as ContentIndexationStatus['verdict'],
      coverageState: idx?.coverageState || undefined,
      indexingState: idx?.indexingState || undefined,
      robotsTxtState: idx?.robotsTxtState || undefined,
      lastCrawlTime: idx?.lastCrawlTime ? new Date(idx.lastCrawlTime) : undefined,
      pageFetchState: idx?.pageFetchState || undefined,
      googleCanonical: idx?.googleCanonical || undefined,
      userCanonical: idx?.userCanonical || undefined,
      checkedAt: new Date(),
      // Preserve the last indexing-request timestamp — recheck doesn't
      // touch that field, it belongs to the requestIndexing() flow.
      indexingRequestedAt: piece.indexation?.indexingRequestedAt,
    };

    const updated = await this.model
      .findByIdAndUpdate(id, { indexation: patch }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  /**
   * Notifies Google via the Indexing API that the piece's published URL
   * has been updated. Returns the (updated) piece with a fresh
   * indexingRequestedAt timestamp — Google itself doesn't return an
   * indexation verdict from this endpoint, so we don't touch the rest
   * of the indexation shape.
   */
  async requestIndexing(id: string, user?: AuthenticatedUser) {
    const piece = await this.ensureAccessToContent(id, user);
    if (!piece.publishedUrl) {
      throw new BadRequestException(
        'This piece has no published URL yet. Add one before requesting indexing.',
      );
    }
    const { ownerUserId } = await this.resolveGscContext(
      piece.clientId.toString(),
    );

    const auth = await this.oauth.getAuthorizedClient(ownerUserId);
    const indexing = google.indexing({ version: 'v3', auth });
    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url: piece.publishedUrl,
          type: 'URL_UPDATED',
        },
      });
    } catch (err) {
      this.logger.error(
        `Indexing API publish failed for content ${id}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Google Indexing API rejected the request: ${(err as Error).message}`,
      );
    }

    const now = new Date();
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { 'indexation.indexingRequestedAt': now, 'indexation.checkedAt': piece.indexation?.checkedAt ?? now } },
        { new: true, upsert: false },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  /**
   * Resolves the pair of {ownerUserId, siteUrl} we need for any GSC-
   * scoped call from a content piece. Extracted so both the URL
   * Inspection and Indexing API entry points share the same guards.
   */
  private async resolveGscContext(
    clientId: string,
  ): Promise<{ ownerUserId: string; siteUrl: string }> {
    const client = await this.clients.findOne(clientId);
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    const siteUrl = (client as { gscSiteUrl?: string }).gscSiteUrl;
    if (!siteUrl) {
      throw new BadRequestException(
        'This client has no GSC site URL configured. Set it in Clients → Integrations.',
      );
    }
    const owner = (client as { ownerId?: unknown }).ownerId;
    const ownerUserId =
      typeof owner === 'string'
        ? owner
        : owner && typeof owner === 'object'
          ? String((owner as { _id?: unknown })._id ?? '')
          : '';
    if (!ownerUserId) {
      throw new BadRequestException(
        'This client has no owner assigned. Assign a strategist before running GSC calls.',
      );
    }
    return { ownerUserId, siteUrl };
  }
}
