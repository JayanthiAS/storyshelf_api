import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async getStats() {
    const [totalUsers, totalBooks, activeSubscriptions, lockedBooks] =
      await Promise.all([
        this.userModel.countDocuments({ deletedAt: null, role: Role.USER }),
        this.bookModel.countDocuments({ deletedAt: null }),
        this.subscriptionModel.countDocuments({
          status: SubscriptionStatus.ACTIVE,
        }),
        this.bookModel.countDocuments({ isLocked: true, deletedAt: null }),
      ]);

    return {
      totalUsers,
      totalBooks,
      activeSubscriptions,
      lockedBooks,
    };
  }

  async getRecentActivity() {
    const [recentUsers, recentBooks] = await Promise.all([
      this.userModel
        .find({ deletedAt: null })
        .sort('-createdAt')
        .limit(5)
        .select('email firstName lastName createdAt'),
      this.bookModel
        .find({ deletedAt: null })
        .sort('-createdAt')
        .limit(5)
        .select('title status createdAt'),
    ]);

    return { recentUsers, recentBooks };
  }
}
