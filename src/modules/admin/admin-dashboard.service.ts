import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';
import {
  LoginActivity,
  LoginActivityDocument,
} from '../auth/schemas/login-activity.schema';
import {
  ReadingSession,
  ReadingSessionDocument,
} from '../reading-activity/schemas/reading-session.schema';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { Role } from '../../common/enums/role.enum';

type Granularity = 'day' | 'month' | 'year';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(LoginActivity.name)
    private loginActivityModel: Model<LoginActivityDocument>,
    @InjectModel(ReadingSession.name)
    private sessionModel: Model<ReadingSessionDocument>,
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
        .select('email firstName lastName createdAt')
        .lean(),
      this.bookModel
        .find({ deletedAt: null })
        .sort('-createdAt')
        .limit(5)
        .select('title status createdAt')
        .lean(),
    ]);

    const createdAtOf = (doc: { createdAt?: Date }) => doc.createdAt ?? new Date(0);

    return [
      ...recentUsers.map((user) => ({
        type: 'user',
        description: `${user.firstName} ${user.lastName} joined`,
        createdAt: createdAtOf(user as { createdAt?: Date }),
      })),
      ...recentBooks.map((book) => ({
        type: 'book',
        description: `Book added: ${book.title}`,
        createdAt: createdAtOf(book as { createdAt?: Date }),
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);
  }

  async getAnalytics(granularity: Granularity) {
    const { start, end, format } = this.rangeFor(granularity);
    const periods = this.buildPeriods(granularity, start, end);
    const dateFormat = {
      format,
      date: '$startedAt',
      timezone: 'UTC',
    };
    const loginDateFormat = {
      format,
      date: '$loggedInAt',
      timezone: 'UTC',
    };

    const [readingBuckets, loginBuckets, readingUsers, loggedInUsers, newSignups, topBooks] =
      await Promise.all([
        this.sessionModel.aggregate<{ _id: string; count: number }>([
          { $match: { startedAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: { period: { $dateToString: dateFormat }, userId: '$userId' },
            },
          },
          { $group: { _id: '$_id.period', count: { $sum: 1 } } },
        ]),
        this.loginActivityModel.aggregate<{ _id: string; count: number }>([
          {
            $match: {
              loggedInAt: { $gte: start, $lte: end },
              role: Role.USER,
            },
          },
          {
            $group: {
              _id: {
                period: { $dateToString: loginDateFormat },
                userId: '$userId',
              },
            },
          },
          { $group: { _id: '$_id.period', count: { $sum: 1 } } },
        ]),
        this.sessionModel.distinct('userId', {
          startedAt: { $gte: start, $lte: end },
        }),
        this.loginActivityModel.distinct('userId', {
          loggedInAt: { $gte: start, $lte: end },
          role: Role.USER,
        }),
        this.userModel.countDocuments({
          role: Role.USER,
          deletedAt: null,
          createdAt: { $gte: start, $lte: end },
        }),
        this.sessionModel.aggregate<{
          _id: Types.ObjectId;
          readers: Types.ObjectId[];
          readerCount: number;
          sessions: number;
          durationSeconds: number;
          book?: { title?: string };
        }>([
          { $match: { startedAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: '$bookId',
              readers: { $addToSet: '$userId' },
              sessions: { $sum: 1 },
              durationSeconds: { $sum: '$durationSeconds' },
            },
          },
          { $addFields: { readerCount: { $size: '$readers' } } },
          { $sort: { readerCount: -1, sessions: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'books',
              localField: '_id',
              foreignField: '_id',
              as: 'book',
            },
          },
          { $unwind: { path: '$book', preserveNullAndEmptyArrays: true } },
        ]),
      ]);

    const readingMap = new Map(readingBuckets.map((row) => [row._id, row.count]));
    const loginMap = new Map(loginBuckets.map((row) => [row._id, row.count]));

    return {
      granularity,
      from: start.toISOString(),
      to: end.toISOString(),
      totals: {
        readingUsers: readingUsers.length,
        loggedInUsers: loggedInUsers.length,
        newSignups,
      },
      series: periods.map((period) => ({
        period,
        readingUsers: readingMap.get(period) ?? 0,
        loggedInUsers: loginMap.get(period) ?? 0,
      })),
      topBooks: topBooks.map((row) => ({
        bookId: row._id.toString(),
        title: row.book?.title || 'Unknown book',
        readers: row.readerCount ?? row.readers.length,
        sessions: row.sessions,
        minutes: Math.round(row.durationSeconds / 60),
      })),
    };
  }

  private rangeFor(granularity: Granularity) {
    const now = new Date();
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    if (granularity === 'day') {
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      start.setUTCHours(0, 0, 0, 0);
      return { start, end, format: '%Y-%m-%d' };
    }

    if (granularity === 'month') {
      const start = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1),
      );
      return { start, end, format: '%Y-%m' };
    }

    const start = new Date(Date.UTC(end.getUTCFullYear() - 4, 0, 1));
    return { start, end, format: '%Y' };
  }

  private buildPeriods(granularity: Granularity, start: Date, end: Date) {
    const periods: string[] = [];
    const cursor = new Date(start);

    if (granularity === 'day') {
      while (cursor <= end) {
        periods.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return periods;
    }

    if (granularity === 'month') {
      while (cursor <= end) {
        periods.push(cursor.toISOString().slice(0, 7));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      return periods;
    }

    while (cursor.getUTCFullYear() <= end.getUTCFullYear()) {
      periods.push(String(cursor.getUTCFullYear()));
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    }
    return periods;
  }
}
