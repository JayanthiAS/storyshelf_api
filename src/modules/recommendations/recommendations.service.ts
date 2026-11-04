import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { BookLike, BookLikeDocument } from '../reading-activity/schemas/book-like.schema';
import {
  ReadingSession,
  ReadingSessionDocument,
} from '../reading-activity/schemas/reading-session.schema';
import {
  ReadingProgress,
  ReadingProgressDocument,
} from '../reading-activity/schemas/reading-progress.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { BookStatus } from '../../common/enums/book-status.enum';
import { RedisService } from '../../common/services/redis.service';
import { QueryDto } from '../authors/dto/author.dto';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(BookLike.name) private likeModel: Model<BookLikeDocument>,
    @InjectModel(ReadingSession.name)
    private sessionModel: Model<ReadingSessionDocument>,
    @InjectModel(ReadingProgress.name)
    private progressModel: Model<ReadingProgressDocument>,
    private notificationsService: NotificationsService,
    private redisService: RedisService,
  ) {}

  private async getTopGenreAndAuthor(userId: string) {
    const [likes, sessions] = await Promise.all([
      this.likeModel.find({ userId: new Types.ObjectId(userId) }).populate('bookId'),
      this.sessionModel.find({ userId: new Types.ObjectId(userId) }),
    ]);

    const genreScores = new Map<string, number>();
    const authorScores = new Map<string, number>();

    for (const like of likes) {
      const book = like.bookId as unknown as BookDocument;
      if (book?.genreIds) {
        for (const g of book.genreIds) {
          genreScores.set(g.toString(), (genreScores.get(g.toString()) || 0) + 3);
        }
      }
      if (book?.authorId) {
        const aid = book.authorId.toString();
        authorScores.set(aid, (authorScores.get(aid) || 0) + 3);
      }
    }

    for (const session of sessions) {
      for (const g of session.genreIds) {
        genreScores.set(g.toString(), (genreScores.get(g.toString()) || 0) + 1);
      }
      const aid = session.authorId.toString();
      authorScores.set(aid, (authorScores.get(aid) || 0) + 1);
    }

    const topGenre = [...genreScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topAuthor = [...authorScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    return { topGenre, topAuthor, genreScores, authorScores };
  }

  private async getExcludedBookIds(userId: string) {
    const [likes, progress] = await Promise.all([
      this.likeModel.find({ userId: new Types.ObjectId(userId) }).select('bookId'),
      this.progressModel.find({ userId: new Types.ObjectId(userId) }).select('bookId'),
    ]);
    return [
      ...likes.map((l) => l.bookId),
      ...progress.map((p) => p.bookId),
    ];
  }

  private publishedFilter() {
    const now = new Date();
    return {
      deletedAt: null,
      status: BookStatus.PUBLISHED,
      isLocked: false,
      $or: [{ releaseDate: null }, { releaseDate: { $lte: now } }],
    };
  }

  async getRecommendations(userId: string, query: QueryDto) {
    const limit = Math.min(Number(query.limit) || 10, 20);
    const { topGenre, topAuthor, genreScores } =
      await this.getTopGenreAndAuthor(userId);
    const excluded = await this.getExcludedBookIds(userId);

    const filter: Record<string, unknown> = {
      ...this.publishedFilter(),
      _id: { $nin: excluded },
    };

    if (topGenre || topAuthor) {
      filter.$or = [
        ...(topGenre ? [{ genreIds: new Types.ObjectId(topGenre) }] : []),
        ...(topAuthor ? [{ authorId: new Types.ObjectId(topAuthor) }] : []),
      ];
    }

    return this.bookModel
      .find(filter)
      .populate('authorId', 'name')
      .populate('genreIds', 'name')
      .limit(limit)
      .sort('-createdAt');
  }

  async getByGenre(userId: string, genreId: string, query: QueryDto) {
    const limit = Math.min(Number(query.limit) || 10, 20);
    const excluded = await this.getExcludedBookIds(userId);
    return this.bookModel
      .find({
        ...this.publishedFilter(),
        genreIds: new Types.ObjectId(genreId),
        _id: { $nin: excluded },
      })
      .limit(limit)
      .sort('-createdAt');
  }

  async getByAuthor(userId: string, authorId: string, query: QueryDto) {
    const limit = Math.min(Number(query.limit) || 10, 20);
    const excluded = await this.getExcludedBookIds(userId);
    return this.bookModel
      .find({
        ...this.publishedFilter(),
        authorId: new Types.ObjectId(authorId),
        _id: { $nin: excluded },
      })
      .limit(limit)
      .sort('-createdAt');
  }

  async getSimilar(userId: string, bookId: string, query: QueryDto) {
    const limit = Math.min(Number(query.limit) || 10, 20);
    const book = await this.bookModel.findById(bookId);
    if (!book) return [];

    const excluded = await this.getExcludedBookIds(userId);
    excluded.push(new Types.ObjectId(bookId));

    return this.bookModel
      .find({
        ...this.publishedFilter(),
        _id: { $nin: excluded },
        $or: [
          { genreIds: { $in: book.genreIds } },
          { authorId: book.authorId },
        ],
      })
      .limit(limit)
      .sort('-createdAt');
  }

  async processRecommendationEvent(payload: Record<string, unknown>) {
    if (payload.event === 'book.published' && payload.bookId) {
      await this.notifyReadersOfNewBook(String(payload.bookId));
      return;
    }

    const userId = payload.userId as string;
    if (!userId) return;

    const recommendations = await this.getRecommendations(userId, { limit: 3 });
    const maxPerDay = 5;
    const todayKey = `rec:count:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const countStr = await this.redisService.get(todayKey);
    const count = parseInt(countStr || '0', 10);
    if (count >= maxPerDay) return;

    for (const book of recommendations) {
      const dedupKey = `rec:${userId}:${book._id.toString()}`;
      const exists = await this.redisService.exists(dedupKey);
      if (exists) continue;

      await this.notificationsService.create({
        userId,
        type: NotificationType.RECOMMENDATION,
        title: 'Recommended for you',
        body: `Based on your reading, you might enjoy "${book.title}"`,
        metadata: { bookId: book._id.toString() },
      });

      await this.redisService.set(dedupKey, '1', 7 * 24 * 60 * 60);
      await this.redisService.set(todayKey, String(count + 1), 24 * 60 * 60);
      break;
    }
  }

  private async notifyReadersOfNewBook(bookId: string) {
    const announcedKey = `book:announced:${bookId}`;
    if (await this.redisService.exists(announcedKey)) return;

    const book = await this.bookModel.findById(bookId);
    if (!book || book.deletedAt || book.status !== BookStatus.PUBLISHED) return;
    if (book.releaseDate && book.releaseDate > new Date()) return;

    const matches = await this.findReadersForBook(book);
    if (!matches.size) {
      await this.redisService.set(announcedKey, '1', 90 * 24 * 60 * 60);
      return;
    }

    const sent = await this.notificationsService.createForUsers(
      [...matches.entries()].map(([userId, reason]) => ({
        userId,
        type: NotificationType.RELEASE,
        title: 'New book for you',
        body:
          reason === 'author'
            ? `"${book.title}" is new, and it's by an author you've read before.`
            : `"${book.title}" is new and matches genres you've been reading.`,
        metadata: { bookId: book._id.toString() },
      })),
    );

    await this.redisService.set(announcedKey, '1', 90 * 24 * 60 * 60);
    this.logger.log(`Notified ${sent} readers about "${book.title}"`);
  }

  private async findReadersForBook(book: BookDocument) {
    const genreIds = book.genreIds ?? [];
    const authorId = book.authorId.toString();
    const historyFilter: Record<string, unknown>[] = [
      { authorId: book.authorId },
    ];
    if (genreIds.length) historyFilter.push({ genreIds: { $in: genreIds } });

    const relatedBooks = await this.bookModel
      .find({ _id: { $ne: book._id }, $or: historyFilter })
      .select('_id authorId');

    const authorBookIds = relatedBooks
      .filter((related) => related.authorId.toString() === authorId)
      .map((related) => related._id);
    const genreBookIds = relatedBooks
      .filter((related) => related.authorId.toString() !== authorId)
      .map((related) => related._id);

    const [authorProgress, genreProgress, authorSessions, genreSessions] =
      await Promise.all([
        authorBookIds.length
          ? this.progressModel.distinct('userId', { bookId: { $in: authorBookIds } })
          : [],
        genreBookIds.length
          ? this.progressModel.distinct('userId', { bookId: { $in: genreBookIds } })
          : [],
        this.sessionModel.distinct('userId', {
          authorId: book.authorId,
          bookId: { $ne: book._id },
        }),
        genreIds.length
          ? this.sessionModel.distinct('userId', {
              genreIds: { $in: genreIds },
              bookId: { $ne: book._id },
            })
          : [],
      ]);

    const matches = new Map<string, 'author' | 'genre'>();
    const prefer = (userId: unknown, reason: 'author' | 'genre') => {
      const id = String(userId);
      if (!id || matches.get(id) === 'author') return;
      matches.set(id, reason);
    };

    for (const userId of [...genreProgress, ...genreSessions]) prefer(userId, 'genre');
    for (const userId of [...authorProgress, ...authorSessions]) prefer(userId, 'author');
    return matches;
  }
}
