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

  async createForUsers(
    items: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      metadata?: Record<string, string>;
    }>,
  ): Promise<number> {
    if (!items.length) return 0;

    const byUser = new Map<string, (typeof items)[number]>();
    for (const item of items) byUser.set(item.userId, item);

    const users = await this.userModel
      .find({
        _id: { $in: [...byUser.keys()].map((id) => new Types.ObjectId(id)) },
        deletedAt: null,
        isActive: true,
        role: Role.USER,
      })
      .select('_id');
    if (!users.length) return 0;

    const bookId = items[0].metadata?.bookId;
    const already = new Set<string>();
    if (bookId) {
      const existing = await this.notificationModel
        .find({
          userId: { $in: users.map((user) => user._id) },
          type: items[0].type,
          'metadata.bookId': bookId,
          deletedAt: null,
        })
        .select('userId');
      for (const notification of existing) {
        already.add(notification.userId.toString());
      }
    }

    const docs = users
      .filter((user) => !already.has(user._id.toString()))
      .map((user) => {
        const item = byUser.get(user._id.toString())!;
        return {
          userId: user._id,
          type: item.type,
          title: item.title,
          body: item.body,
          metadata: item.metadata ?? {},
        };
      });
    if (!docs.length) return 0;

    await this.notificationModel.insertMany(docs);
    return docs.length;
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
