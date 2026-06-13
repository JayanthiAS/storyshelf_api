import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateNotificationDto,
  BroadcastNotificationDto,
  QueryDto,
} from './dto/notification.dto';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findAll(userId: string, query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      deletedAt: null,
    };
    if (query.isRead !== undefined) {
      filter.isRead = query.isRead === 'true';
    }
    const [data, total] = await Promise.all([
      this.notificationModel.find(filter).sort('-createdAt').skip(skip).limit(limit),
      this.notificationModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
      deletedAt: null,
    });
    return { count };
  }

  async findById(userId: string, id: string) {
    const notification = await this.notificationModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
      deletedAt: null,
    });
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markRead(userId: string, id: string) {
    const notification = await this.findById(userId, id);
    notification.isRead = true;
    await notification.save();
    return notification;
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
    return { message: 'All notifications marked as read' };
  }

  async softDelete(userId: string, id: string) {
    const notification = await this.findById(userId, id);
    notification.deletedAt = new Date();
    await notification.save();
    return { message: 'Notification deleted' };
  }

  async create(dto: CreateNotificationDto) {
    return this.notificationModel.create({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
    });
  }

  async createFromQueue(payload: Record<string, unknown>) {
    return this.notificationModel.create({
      userId: new Types.ObjectId(payload.userId as string),
      type: payload.type as NotificationType,
      title: payload.title as string,
      body: payload.body as string,
      metadata: (payload.metadata as Record<string, string>) || {},
    });
  }

  async broadcast(dto: BroadcastNotificationDto) {
    let users: UserDocument[];
    if (dto.userIds?.length) {
      users = await this.userModel.find({
        _id: { $in: dto.userIds.map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
      });
    } else {
      users = await this.userModel.find({ deletedAt: null, role: Role.USER });
    }

    const notifications = users.map((user) => ({
      userId: user._id,
      type: dto.type,
      title: dto.title,
      body: dto.body,
    }));

    await this.notificationModel.insertMany(notifications);
    return { message: `Sent to ${notifications.length} users` };
  }

  async adminFindAll(query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = { deletedAt: null };
    const [data, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .populate('userId', 'email')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit),
      this.notificationModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }
}
