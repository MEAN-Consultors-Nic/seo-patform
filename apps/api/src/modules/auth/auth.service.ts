import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './user.schema';
import { ActivityLogService } from '../activity-log/activity-log.service';

const SEED_EMAIL = 'joseph.o@mediaspearhead.com';
const SEED_PASSWORD = 'spearhead2026';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: JwtService,
    private readonly audit: ActivityLogService,
  ) {}

  async onApplicationBootstrap() {
    // Ensure the seed user exists and is promoted to root.
    const existing = await this.userModel.findOne({ email: SEED_EMAIL }).exec();
    if (!existing) {
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await this.userModel.create({
        email: SEED_EMAIL,
        passwordHash,
        name: 'Joseph O.',
        role: 'root',
      });
      this.logger.log(`Seed user created: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
    } else if (existing.role !== 'root') {
      existing.role = 'root';
      await existing.save();
      this.logger.log(`Seed user promoted to root: ${SEED_EMAIL}`);
    }
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
    await user.save();
    return { changed: true };
  }

  private toSafeUser(u: UserDocument) {
    const obj = u.toObject() as unknown as Record<string, unknown>;
    delete obj.passwordHash;
    return obj;
  }
}
