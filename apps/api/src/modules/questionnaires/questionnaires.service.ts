import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { QuestionnaireKind } from '@seo/shared';
import { Questionnaire, QuestionnaireDocument } from './questionnaire.schema';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ActivityLogService } from '../activity-log/activity-log.service';

export interface CreateQuestionnaireInput {
  kind: QuestionnaireKind;
  businessName: string;
  invitedEmail?: string;
  leadId?: string;
  clientId?: string;
}

@Injectable()
export class QuestionnairesService {
  private readonly logger = new Logger(QuestionnairesService.name);

  constructor(
    @InjectModel(Questionnaire.name)
    private readonly model: Model<QuestionnaireDocument>,
    private readonly audit: ActivityLogService,
  ) {}

  /**
   * Creates a pending questionnaire + share token. The caller then
   * either copies the /q/:token link or sends it via the Comms
   * module — sending is done at the caller layer to reuse whatever
   * email template the operator wants.
   */
  async create(input: CreateQuestionnaireInput, user: AuthenticatedUser) {
    if (!input.businessName?.trim()) {
      throw new BadRequestException('Business name is required.');
    }
    const doc = await this.model.create({
      kind: input.kind,
      businessName: input.businessName.trim(),
      invitedEmail: input.invitedEmail?.trim() || undefined,
      leadId: input.leadId ? new Types.ObjectId(input.leadId) : undefined,
      clientId: input.clientId ? new Types.ObjectId(input.clientId) : undefined,
      shareToken: randomBytes(16).toString('base64url'),
      invitedByUserId: new Types.ObjectId(user.userId),
      status: 'pending',
    });
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'questionnaire.created',
      targetType: 'Questionnaire',
      targetId: String(doc._id),
      details: {
        kind: doc.kind,
        businessName: doc.businessName,
        shareToken: doc.shareToken,
      },
    });
    return doc.toObject();
  }

  /** Intake Hub list. Filter by kind + status. Sorted newest first. */
  async list(filters: { kind?: QuestionnaireKind; status?: string } = {}) {
    const q: Record<string, unknown> = {};
    if (filters.kind) q.kind = filters.kind;
    if (filters.status) q.status = filters.status;
    return this.model
      .find(q)
      .populate('invitedByUserId', 'name email')
      .populate('leadId', 'businessName stage')
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string) {
    const doc = await this.model
      .findById(id)
      .populate('invitedByUserId', 'name email')
      .populate('leadId', 'businessName stage')
      .populate('clientId', 'name')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Questionnaire ${id} not found`);
    return doc;
  }

  /** Public: token lookup for the /q/:token page. */
  async findByToken(token: string) {
    const doc = await this.model.findOne({ shareToken: token }).lean().exec();
    if (!doc) throw new NotFoundException('Questionnaire not found.');
    return doc;
  }

  /** Public: submit answers. Idempotent — resubmit is allowed. */
  async submit(token: string, answers: Record<string, unknown>) {
    const doc = await this.model.findOne({ shareToken: token }).exec();
    if (!doc) throw new NotFoundException('Questionnaire not found.');
    doc.answers = answers || {};
    doc.status = 'submitted';
    doc.submittedAt = new Date();
    await doc.save();
    await this.audit.log({
      action: 'questionnaire.submitted',
      targetType: 'Questionnaire',
      targetId: String(doc._id),
      details: {
        kind: doc.kind,
        businessName: doc.businessName,
        answerCount: Object.keys(answers || {}).length,
      },
    });
    return doc.toObject();
  }

  async remove(id: string, user: AuthenticatedUser) {
    const doc = await this.model.findByIdAndDelete(id).lean().exec();
    if (!doc) throw new NotFoundException(`Questionnaire ${id} not found`);
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'questionnaire.deleted',
      targetType: 'Questionnaire',
      targetId: id,
      details: { businessName: doc.businessName },
    });
    return { deleted: true };
  }
}
