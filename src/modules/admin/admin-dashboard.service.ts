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
import {
  ReadingProgress,
  ReadingProgressDocument,
} from '../reading-activity/schemas/reading-progress.schema';
import {
  PaymentEvent,
  PaymentEventDocument,
} from '../subscriptions/schemas/payment-event.schema';
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
    @InjectModel(ReadingProgress.name)
    private progressModel: Model<ReadingProgressDocument>,
    @InjectModel(PaymentEvent.name)
    private paymentEventModel: Model<PaymentEventDocument>,
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
    const previous = this.previousRange(start, end);
    const [current, prior] = await Promise.all([
      this.summarizeWindow(start, end, granularity, format),
      this.summarizeWindow(previous.start, previous.end),
    ]);

    return {
      granularity,
      from: start.toISOString(),
      to: end.toISOString(),
      previousFrom: previous.start.toISOString(),
      previousTo: previous.end.toISOString(),
      totals: current.totals,
      previousTotals: prior.totals,
      comparison: {
        readingUsers: this.compare(current.totals.readingUsers, prior.totals.readingUsers),
        loggedInUsers: this.compare(current.totals.loggedInUsers, prior.totals.loggedInUsers),
        newSignups: this.compare(current.totals.newSignups, prior.totals.newSignups),
        revenueCents: this.compare(current.totals.revenueCents, prior.totals.revenueCents),
        failedPayments: this.compare(current.totals.failedPayments, prior.totals.failedPayments),
        completionRate: this.compare(current.totals.completionRate, prior.totals.completionRate),
      },
      series: current.series,
      topBooks: current.topBooks,
      genres: current.genres,
      payments: current.payments,
      completion: current.completion,
    };
  }

  async exportAnalytics(granularity: Granularity) {
    const analytics = await this.getAnalytics(granularity);
    const lines = [
      'section,key,current,previous,change',
      this.csvSummary('readingUsers', analytics.comparison.readingUsers),
      this.csvSummary('loggedInUsers', analytics.comparison.loggedInUsers),
      this.csvSummary('newSignups', analytics.comparison.newSignups),
      this.csvSummary('revenueCents', analytics.comparison.revenueCents),
      this.csvSummary('failedPayments', analytics.comparison.failedPayments),
      this.csvSummary('completionRate', analytics.comparison.completionRate),
      '',
      'section,period,readingUsers,loggedInUsers',
      ...analytics.series.map(
        (point) => `series,${point.period},${point.readingUsers},${point.loggedInUsers}`,
      ),
      '',
      'section,genre,readers,sessions',
      ...analytics.genres.map(
        (genre) => `genre,${this.csvCell(genre.name)},${genre.readers},${genre.sessions}`,
      ),
      '',
      'section,title,readers,sessions,minutes',
      ...analytics.topBooks.map(
        (book) =>
          `book,${this.csvCell(book.title)},${book.readers},${book.sessions},${book.minutes}`,
      ),
      '',
      'section,metric,value',
      `payments,succeededCount,${analytics.payments.succeededCount}`,
      `payments,revenueCents,${analytics.payments.revenueCents}`,
      `payments,failedCount,${analytics.payments.failedCount}`,
      `payments,failedAmountCents,${analytics.payments.failedAmountCents}`,
      `completion,activeReaders,${analytics.completion.activeReaders}`,
      `completion,completed,${analytics.completion.completed}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  private async summarizeWindow(
    start: Date,
    end: Date,
    granularity?: Granularity,
    format?: string,
  ) {
    const periods = granularity && format ? this.buildPeriods(granularity, start, end) : [];
    const dateMatch = { $gte: start, $lte: end };
    const [readingBuckets, loginBuckets, readingUsers, loggedInUsers, newSignups, topBooks, genres, activeReaders, completed, payments] =
      await Promise.all([
        periods.length && format
          ? this.sessionModel.aggregate<{ _id: string; count: number }>([
              { $match: { startedAt: dateMatch } },
              {
                $group: {
                  _id: {
                    period: { $dateToString: { format, date: '$startedAt', timezone: 'UTC' } },
                    userId: '$userId',
                  },
                },
              },
              { $group: { _id: '$_id.period', count: { $sum: 1 } } },
            ])
          : Promise.resolve([]),
        periods.length && format
          ? this.loginActivityModel.aggregate<{ _id: string; count: number }>([
              { $match: { loggedInAt: dateMatch, role: Role.USER } },
              {
                $group: {
                  _id: {
                    period: { $dateToString: { format, date: '$loggedInAt', timezone: 'UTC' } },
                    userId: '$userId',
                  },
                },
              },
              { $group: { _id: '$_id.period', count: { $sum: 1 } } },
            ])
          : Promise.resolve([]),
        this.sessionModel.distinct('userId', { startedAt: dateMatch }),
        this.loginActivityModel.distinct('userId', {
          loggedInAt: dateMatch,
          role: Role.USER,
        }),
        this.userModel.countDocuments({
          role: Role.USER,
          deletedAt: null,
          createdAt: dateMatch,
        }),
        this.sessionModel.aggregate<{
          _id: Types.ObjectId;
          readers: Types.ObjectId[];
          readerCount: number;
          sessions: number;
          durationSeconds: number;
          book?: { title?: string };
        }>([
          { $match: { startedAt: dateMatch } },
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
        this.sessionModel.aggregate<{
          _id: Types.ObjectId;
          readers: Types.ObjectId[];
          readerCount: number;
          sessions: number;
          genre?: { name?: string };
        }>([
          { $match: { startedAt: dateMatch } },
          { $unwind: '$genreIds' },
          {
            $group: {
              _id: '$genreIds',
              readers: { $addToSet: '$userId' },
              sessions: { $sum: 1 },
            },
          },
          { $addFields: { readerCount: { $size: '$readers' } } },
          { $sort: { readerCount: -1, sessions: -1 } },
          { $limit: 8 },
          {
            $lookup: {
              from: 'genres',
              localField: '_id',
              foreignField: '_id',
              as: 'genre',
            },
          },
          { $unwind: { path: '$genre', preserveNullAndEmptyArrays: true } },
        ]),
        this.progressModel.countDocuments({ lastReadAt: dateMatch }),
        this.progressModel.countDocuments({
          lastReadAt: dateMatch,
          isCompleted: true,
        }),
        this.paymentEventModel
          .find({
            type: { $in: ['invoice.payment_succeeded', 'invoice.payment_failed'] },
            processedAt: dateMatch,
          })
          .select('type payload')
          .lean(),
      ]);

    const readingMap = new Map(readingBuckets.map((row) => [row._id, row.count]));
    const loginMap = new Map(loginBuckets.map((row) => [row._id, row.count]));
    let revenueCents = 0;
    let succeededCount = 0;
    let failedCount = 0;
    let failedAmountCents = 0;
    for (const event of payments) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (event.type === 'invoice.payment_succeeded') {
        succeededCount += 1;
        revenueCents += this.cents(payload, 'amount_paid');
      } else if (event.type === 'invoice.payment_failed') {
        failedCount += 1;
        failedAmountCents += this.cents(payload, 'amount_due');
      }
    }
    const completionRate = activeReaders ? completed / activeReaders : 0;

    return {
      totals: {
        readingUsers: readingUsers.length,
        loggedInUsers: loggedInUsers.length,
        newSignups,
        revenueCents,
        failedPayments: failedCount,
        completionRate,
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
      genres: genres.map((row) => ({
        genreId: row._id.toString(),
        name: row.genre?.name || 'Unknown genre',
        readers: row.readerCount ?? row.readers.length,
        sessions: row.sessions,
      })),
      payments: {
        succeededCount,
        revenueCents,
        failedCount,
        failedAmountCents,
      },
      completion: {
        activeReaders,
        completed,
        rate: completionRate,
      },
    };
  }

  private compare(current: number, previous: number) {
    return { current, previous, change: current - previous };
  }

  private previousRange(start: Date, end: Date) {
    const length = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    return { start: new Date(previousEnd.getTime() - length), end: previousEnd };
  }

  private cents(payload: Record<string, unknown>, key: string) {
    const value = payload[key];
    return typeof value === 'number' ? value : 0;
  }

  private csvSummary(key: string, value: { current: number; previous: number; change: number }) {
    return `summary,${key},${value.current},${value.previous},${value.change}`;
  }

  private csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
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
