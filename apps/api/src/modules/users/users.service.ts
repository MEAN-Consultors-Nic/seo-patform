import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LEGACY_ROLE_MAP, UserRole } from '@seo/shared';
import { User, UserDocument } from '../auth/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
  ) {}

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
    } catch (e) {
      this.logger.error(
        `Role migration failed: ${(e as Error).message}`,
        (e as Error).stack,
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

  async create(dto: CreateUserDto) {
    const existing = await this.model
      .findOne({ email: dto.email.toLowerCase() })
      .exec();
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.model.create({
      email: dto.email.toLowerCase(),
      name: dto.name,
      role: dto.role,
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : undefined,
      active: dto.active ?? true,
      passwordHash,
    });
    return this.toSafe(user);
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
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.managerId !== undefined) {
      user.managerId = dto.managerId
        ? new Types.ObjectId(dto.managerId)
        : undefined;
    }
    if (dto.active !== undefined) user.active = dto.active;
    await user.save();
    return this.toSafe(user);
  }

  async resetPassword(id: string, password: string) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
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
    return { deleted: true };
  }
}
