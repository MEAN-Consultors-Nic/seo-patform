import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LEGACY_ROLE_MAP, UserRole } from '@seo/shared';
import { randomBytes } from 'crypto';
import { User, UserDocument } from '../auth/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MailService } from '../mail/mail.service';
import { UserInvitesService } from '../user-invites/user-invites.service';

const INVITE_TTL_HOURS = 72;

interface LegacySupervisorDoc {
  _id: Types.ObjectId;
  name: string;
  active: boolean;
  createdAt?: Date;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    @InjectModel('Supervisor')
    private readonly supervisorModel: Model<LegacySupervisorDoc>,
    private readonly audit: ActivityLogService,
    private readonly invites: UserInvitesService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private webBase(): string {
    return (
      this.config.get<string>('PUBLIC_WEB_URL') || 'http://localhost:4200'
    ).replace(/\/$/, '');
  }

  /**
   * Boot-time migration: rewrite legacy role values (`seo-manager` /
   * `seo-strategist`) into the new hierarchy (`manager` / `strategist`).
   * Idempotent — runs a single updateMany that no-ops after the first
   * successful boot.
   */
  async onModuleInit(): Promise<void> {
    try {
      for (const [legacy, target] of Object.entries(LEGACY_ROLE_MAP)) {
        const res = await this.model
          .updateMany(
            { role: legacy as UserRole },
            { $set: { role: target } },
          )
          .exec();
        if (res.modifiedCount > 0) {
          this.logger.log(
            `Migrated ${res.modifiedCount} user(s) from role="${legacy}" to role="${target}".`,
          );
        }
      }
      await this.migrateLegacySupervisors();
      await this.backfillOnboardingFlag();
    } catch (e) {
      this.logger.error(
        `Role migration failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  /**
   * Any user that existed before we introduced the flag is treated as
   * already onboarded — otherwise every current member would get pushed
   * through the wizard on their next login. Only truly new (invited)
   * users start with onboardingCompleted=false.
   */
  private async backfillOnboardingFlag(): Promise<void> {
    const res = await this.model
      .updateMany(
        { onboardingCompleted: { $exists: false } },
        { $set: { onboardingCompleted: true } },
      )
      .exec();
    if (res.modifiedCount > 0) {
      this.logger.log(
        `Backfilled onboardingCompleted=true on ${res.modifiedCount} pre-existing user(s).`,
      );
    }
  }

  /**
   * One-shot migration from the legacy PIN-gated Supervisor collection
   * into standard User docs with role='supervisor'. Each row maps to
   * a User with a placeholder email (name-slug@supervisor.local) and
   * a random temporary password — the admin resets it from the Users
   * page. Legacy Supervisor docs are left in place for audit; the
   * Supervisor Settings tab + /supervisor portal are being retired.
   */
  private async migrateLegacySupervisors(): Promise<void> {
    let supervisors: LegacySupervisorDoc[];
    try {
      supervisors = await this.supervisorModel.find().lean().exec();
    } catch {
      return;
    }
    if (!supervisors?.length) return;
    let migrated = 0;
    for (const s of supervisors) {
      const slug = (s.name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'supervisor';
      const email = `${slug}@supervisor.local`;
      const exists = await this.model.exists({ email });
      if (exists) continue;
      const tempPassword = randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await this.model.create({
        email,
        name: s.name || slug,
        role: 'supervisor',
        active: s.active !== false,
        passwordHash,
      });
      migrated++;
      this.logger.log(
        `Migrated legacy supervisor "${s.name}" -> user ${email} (temp password: ${tempPassword} — reset via Users page).`,
      );
    }
    if (migrated > 0) {
      this.logger.log(
        `Migrated ${migrated} legacy supervisor(s) to standard User docs.`,
      );
    }
  }

  private toSafe(u: UserDocument) {
    const o = u.toObject() as unknown as Record<string, unknown>;
    delete o.passwordHash;
    return o;
  }

  async findAll() {
    const users = await this.model
      .find()
      .populate('managerId', 'name email role')
      .sort({ role: 1, name: 1 })
      .exec();
    return users.map((u) => this.toSafe(u));
  }

  /**
   * Used by the "Owner" dropdown on the Client form. Includes anyone
   * who can own a client — strategist and up. Excludes the client
   * portal role.
   */
  async findAssignable() {
    const eligible: UserRole[] = ['root', 'owner', 'admin', 'manager', 'strategist'];
    const users = await this.model
      .find({ active: true, role: { $in: eligible } }, { passwordHash: 0 })
      .sort({ name: 1 })
      .lean()
      .exec();
    return users;
  }

  async findOne(id: string) {
    const user = await this.model
      .findById(id)
      .populate('managerId', 'name email role')
      .exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toSafe(user);
  }

  /**
   * Returns the set of strategist userIds that report (directly) to
   * the given manager. Used by ownerScopeFilter to compute the "my
   * team's clients" scope.
   */
  async listTeamMemberIds(managerId: string): Promise<Types.ObjectId[]> {
    const rows = await this.model
      .find({ managerId: new Types.ObjectId(managerId) }, { _id: 1 })
      .lean()
      .exec();
    return rows.map((r) => r._id as Types.ObjectId);
  }

  /**
   * Create-user via invite. The user gets a random placeholder
   * passwordHash so nothing can log in with it — they must claim the
   * account via /set-password using the emailed invite link.
   */
  async create(dto: CreateUserDto, invitedByName?: string) {
    const existing = await this.model
      .findOne({ email: dto.email.toLowerCase() })
      .exec();
    if (existing) throw new ConflictException('Email already in use');
    // Placeholder hash of an unguessable value — never used for login.
    const placeholder = randomBytes(32).toString('base64url');
    const passwordHash = await bcrypt.hash(placeholder, 10);
    const user = await this.model.create({
      email: dto.email.toLowerCase(),
      name: dto.name,
      role: dto.role,
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : undefined,
      active: dto.active ?? true,
      passwordHash,
      onboardingCompleted: false,
    });
    await this.audit.log({
      action: 'user.created',
      targetType: 'User',
      targetId: String(user._id),
      details: { email: user.email, role: user.role },
    });
    // Fire the invite email. We log but don't roll back on mail
    // failure — the admin can hit "Resend invite" instead of losing
    // the user record.
    await this.issueInvite(user, invitedByName).catch((err) => {
      this.logger.error(
        `Invite email failed for ${user.email}: ${(err as Error).message}`,
      );
    });
    return this.toSafe(user);
  }

  /**
   * Issue a fresh invite token and email the link. Also used by
   * `resendInvite` — the invites service auto-invalidates any pending
   * prior token for the same purpose.
   */
  private async issueInvite(user: UserDocument, invitedByName?: string) {
    const { token, expiresAt } = await this.invites.issue(
      String(user._id),
      'invite',
      INVITE_TTL_HOURS,
    );
    const actionUrl = `${this.webBase()}/set-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendInvite({
      recipientName: user.name,
      recipientEmail: user.email,
      invitedBy: invitedByName,
      role: user.role,
      actionUrl,
      expiresAt,
    });
    await this.audit.log({
      action: 'user.invite.sent',
      targetType: 'User',
      targetId: String(user._id),
      details: { email: user.email, expiresAt },
    });
    return { expiresAt };
  }

  async resendInvite(id: string, invitedByName?: string) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (user.passwordSetAt) {
      throw new BadRequestException(
        'This user has already claimed their account. Use "Reset password" instead.',
      );
    }
    const { expiresAt } = await this.issueInvite(user, invitedByName);
    return { ok: true, expiresAt };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (user.role === 'root' && dto.role && dto.role !== 'root') {
      const otherRoots = await this.model
        .countDocuments({ role: 'root', _id: { $ne: user._id } })
        .exec();
      if (otherRoots === 0) {
        throw new BadRequestException(
          'Cannot demote the last root user. Promote another user to root first.',
        );
      }
    }
    const changed: Record<string, unknown> = {};
    if (dto.name !== undefined && dto.name !== user.name) {
      changed.name = { from: user.name, to: dto.name };
      user.name = dto.name;
    }
    if (dto.role !== undefined && dto.role !== user.role) {
      changed.role = { from: user.role, to: dto.role };
      user.role = dto.role;
    }
    if (dto.managerId !== undefined) {
      const prev = user.managerId?.toString();
      const next = dto.managerId || undefined;
      if (prev !== next) {
        changed.managerId = { from: prev, to: next };
        user.managerId = next ? new Types.ObjectId(next) : undefined;
      }
    }
    if (dto.active !== undefined && dto.active !== user.active) {
      changed.active = { from: user.active, to: dto.active };
      user.active = dto.active;
    }
    await user.save();
    if (Object.keys(changed).length) {
      await this.audit.log({
        action: 'user.updated',
        targetType: 'User',
        targetId: id,
        details: changed,
      });
    }
    return this.toSafe(user);
  }

  async resetPassword(id: string, password: string) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordSetAt = new Date();
    await user.save();
    await this.audit.log({
      action: 'user.password-reset',
      targetType: 'User',
      targetId: id,
      details: { email: user.email },
    });
    return { ok: true };
  }

  async remove(id: string) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (user.role === 'root') {
      const otherRoots = await this.model
        .countDocuments({ role: 'root', _id: { $ne: user._id } })
        .exec();
      if (otherRoots === 0) {
        throw new BadRequestException('Cannot delete the last root user');
      }
    }
    await user.deleteOne();
    await this.audit.log({
      action: 'user.deleted',
      targetType: 'User',
      targetId: id,
      details: { email: user.email, role: user.role },
    });
    return { deleted: true };
  }
}
