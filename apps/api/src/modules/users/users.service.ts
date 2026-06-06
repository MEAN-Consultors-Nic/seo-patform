import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../auth/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
  ) {}

  private toSafe(u: UserDocument) {
    const o = u.toObject() as unknown as Record<string, unknown>;
    delete o.passwordHash;
    return o;
  }

  async findAll() {
    const users = await this.model.find().sort({ role: 1, name: 1 }).exec();
    return users.map((u) => this.toSafe(u));
  }

  async findAssignable() {
    // Used for the Owner dropdown on the Client form.
    // Includes managers/strategists (anyone who can own a client).
    const users = await this.model
      .find({ active: true, role: { $in: ['seo-manager', 'seo-strategist', 'root'] } }, { passwordHash: 0 })
      .sort({ name: 1 })
      .lean()
      .exec();
    return users;
  }

  async findOne(id: string) {
    const user = await this.model.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.toSafe(user);
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
