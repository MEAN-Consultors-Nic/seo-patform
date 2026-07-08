import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import {
  UserInvite,
  UserInviteDocument,
  UserInvitePurpose,
} from './user-invite.schema';

/**
 * Invite / password-reset token lifecycle. The raw token is what we
 * email; only its hash lives in the DB. Any purpose × userId combo is
 * limited to one live token — issuing a new one invalidates prior
 * pending ones for that user + purpose.
 */
@Injectable()
export class UserInvitesService {
  constructor(
    @InjectModel(UserInvite.name)
    private readonly model: Model<UserInviteDocument>,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    userId: string,
    purpose: UserInvitePurpose,
    ttlHours: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    // A fresh invite / reset request supersedes any pending one for the
    // same user + purpose. Prevents accumulating valid tokens if an
    // admin resends the invite.
    await this.model
      .deleteMany({
        userId: new Types.ObjectId(userId),
        purpose,
        usedAt: { $exists: false },
      })
      .exec();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await this.model.create({
      userId: new Types.ObjectId(userId),
      tokenHash: this.hash(token),
      purpose,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Look up an unused, unexpired invite by raw token. Does not
   * mark it consumed — call `consume()` after the caller has actually
   * done what the token authorizes.
   */
  async findValid(token: string): Promise<UserInviteDocument | null> {
    const tokenHash = this.hash(token);
    return this.model
      .findOne({
        tokenHash,
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  async consume(id: string): Promise<void> {
    const res = await this.model
      .updateOne({ _id: id }, { $set: { usedAt: new Date() } })
      .exec();
    if (res.matchedCount === 0) {
      throw new NotFoundException('Invite token not found');
    }
  }
}
