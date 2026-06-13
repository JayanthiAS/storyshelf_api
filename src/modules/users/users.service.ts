import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UserQueryDto,
} from './dto/user.dto';
import { Role } from '../../common/enums/role.enum';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  private sanitize(user: UserDocument) {
    const obj = user.toObject();
    delete (obj as Record<string, unknown>).passwordHash;
    return obj;
  }

  private buildFilter(query: UserQueryDto, includeDeleted: boolean) {
    const filter: Record<string, unknown> = includeDeleted
      ? { deletedAt: { $ne: null } }
      : { deletedAt: null };
    if (query.search) {
      filter.$or = [
        { email: { $regex: query.search, $options: 'i' } },
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
      ];
    }
    return filter;
  }

  async findAll(query: UserQueryDto, includeDeleted = false) {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter = this.buildFilter(query, includeDeleted);
    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-passwordHash')
        .exec(),
      this.userModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto, actor: JwtPayload) {
    if (dto.role === Role.ADMIN && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can create admin users');
    }
    if (dto.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can create superadmin');
    }
    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      ...dto,
      passwordHash,
      role: dto.role || Role.USER,
      isSuperAdmin: dto.isSuperAdmin || false,
    });
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: JwtPayload) {
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('User not found');

    if (dto.role === Role.ADMIN && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can assign admin role');
    }
    if (dto.isSuperAdmin !== undefined && !actor.isSuperAdmin) {
      throw new ForbiddenException('Only superadmin can modify superadmin flag');
    }

    Object.assign(user, dto);
    await user.save();
    return this.sanitize(user);
  }

  async softDelete(id: string) {
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('User not found');
    user.deletedAt = new Date();
    user.isActive = false;
    await user.save();
    return { message: 'User soft deleted' };
  }

  async restore(id: string) {
    const user = await this.userModel.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!user) throw new NotFoundException('Deleted user not found');
    user.deletedAt = null;
    user.isActive = true;
    await user.save();
    return this.sanitize(user);
  }

  async activate(id: string, isActive: boolean) {
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = isActive;
    await user.save();
    return this.sanitize(user);
  }

  async getUserSubscription(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .populate('subscriptionPlanId')
      .select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    const subscription = await this.subscriptionModel
      .findOne({ userId })
      .populate('planId');
    return { user, subscription };
  }

  async getProfile(userId: string) {
    return this.findById(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userModel.findOne({ _id: userId, deletedAt: null });
    if (!user) throw new NotFoundException('User not found');
    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
    }
    await user.save();
    return this.sanitize(user);
  }

  async deleteOwnAccount(userId: string) {
    return this.softDelete(userId);
  }
}
