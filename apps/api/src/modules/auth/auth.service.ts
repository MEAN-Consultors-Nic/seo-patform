import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './user.schema';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { MailService } from '../mail/mail.service';
import { UserInvitesService } from '../user-invites/user-invites.service';

const PASSWORD_RESET_TTL_HOURS = 2;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: JwtService,
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

  async validate(email: string, password: string) {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase(), active: true })
      .exec();
    if (!user) {
      // Log the miss with just the email + no userId so brute-force
      // attempts against unknown accounts still leave a trail.
      await this.audit.log({
        action: 'auth.login.failed',
        userEmail: email.toLowerCase(),
        details: { reason: 'unknown-email-or-inactive' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.audit.log({
        userId: String(user._id),
        userEmail: user.email,
        action: 'auth.login.failed',
        details: { reason: 'wrong-password' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.toSafeUser(user);
  }

  async login(email: string, password: string) {
    const user = await this.validate(email, password);
    // Refuse internal-app login for portal-only accounts. The client
    // portal (Phase 6+) will issue its own scoped tokens through a
    // separate route; letting a client-role user log in here would
    // give them an internal JWT they shouldn't have.
    if (user.role === 'client') {
      await this.audit.log({
        userId: String(user._id),
        userEmail: String(user.email),
        action: 'auth.login.blocked',
        details: { reason: 'client-role-cannot-use-internal-app' },
      });
      throw new UnauthorizedException(
        'This account is a client portal account and cannot sign in here.',
      );
    }
    const payload = { sub: user._id, email: user.email, role: user.role };
    await this.audit.log({
      userId: String(user._id),
      userEmail: String(user.email),
      action: 'auth.login.success',
      details: { role: user.role },
    });
    return {
      accessToken: this.jwt.sign(payload),
      user,
    };
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) return null;
    return this.toSafeUser(user);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password incorrect');
    user.passwordHash = await bcrypt.hash(next, 10);
    user.passwordSetAt = new Date();
    await user.save();
    return { changed: true };
  }

  /**
   * Check a token's validity without consuming it — used by the
   * /set-password and /reset-password pages to render a "token invalid"
   * state before the user starts filling in the form.
   */
  async peekToken(rawToken: string) {
    const invite = await this.invites.findValid(rawToken);
    if (!invite) return { valid: false as const };
    const user = await this.userModel.findById(invite.userId).exec();
    if (!user || !user.active) return { valid: false as const };
    return {
      valid: true as const,
      email: user.email,
      name: user.name,
      purpose: invite.purpose,
    };
  }

  /**
   * Consumes a valid invite/reset token, sets a new password, verifies
   * the email if this was the initial invite, and returns a signed JWT
   * so the user lands logged-in.
   */
  async setPasswordFromToken(rawToken: string, newPassword: string) {
    const invite = await this.invites.findValid(rawToken);
    if (!invite) {
      throw new BadRequestException(
        'This link is invalid or has expired. Ask your admin to resend the invite.',
      );
    }
    const user = await this.userModel.findById(invite.userId).exec();
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    if (!user.active) {
      throw new UnauthorizedException(
        'This account is disabled. Contact your admin.',
      );
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordSetAt = new Date();
    if (invite.purpose === 'invite') {
      user.emailVerifiedAt = new Date();
    }
    await user.save();
    await this.invites.consume(String(invite._id));
    await this.audit.log({
      userId: String(user._id),
      userEmail: user.email,
      action:
        invite.purpose === 'invite'
          ? 'auth.invite.accepted'
          : 'auth.password.reset',
      details: {},
    });
    const safe = this.toSafeUser(user);
    const payload = { sub: user._id, email: user.email, role: user.role };
    return {
      accessToken: this.jwt.sign(payload),
      user: safe,
    };
  }

  /**
   * Kick off a password-reset email. Idempotent from the caller's
   * perspective — we always resolve with the same shape so an attacker
   * can't enumerate valid emails by watching the response.
   */
  async requestPasswordReset(email: string) {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase(), active: true })
      .exec();
    if (!user) {
      // Log the miss so unusual patterns leave a trail, but return OK
      // to the caller so response timing / shape doesn't reveal
      // whether the email exists.
      await this.audit.log({
        userEmail: email.toLowerCase(),
        action: 'auth.password-reset.requested-unknown',
        details: {},
      });
      return { ok: true };
    }
    const { token, expiresAt } = await this.invites.issue(
      String(user._id),
      'password_reset',
      PASSWORD_RESET_TTL_HOURS,
    );
    const actionUrl = `${this.webBase()}/set-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.sendPasswordReset({
        recipientName: user.name,
        recipientEmail: user.email,
        actionUrl,
        expiresAt,
      });
    } catch (err) {
      this.logger.error(
        `Password reset email failed for ${user.email}: ${(err as Error).message}`,
      );
    }
    await this.audit.log({
      userId: String(user._id),
      userEmail: user.email,
      action: 'auth.password-reset.requested',
      details: { expiresAt },
    });
    return { ok: true };
  }

  /**
   * Mark the current user as onboarded. Idempotent — clicking the
   * "Finish" button on the wizard multiple times is a no-op after the
   * first call.
   */
  async completeOnboarding(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new UnauthorizedException();
    if (!user.onboardingCompleted) {
      user.onboardingCompleted = true;
      await user.save();
      await this.audit.log({
        userId,
        userEmail: user.email,
        action: 'user.onboarding.completed',
        details: {},
      });
    }
    return this.toSafeUser(user);
  }

  private toSafeUser(u: UserDocument) {
    const obj = u.toObject() as unknown as Record<string, unknown>;
    delete obj.passwordHash;
    return obj;
  }
}
