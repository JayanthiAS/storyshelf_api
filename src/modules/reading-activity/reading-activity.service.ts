import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookLike, BookLikeDocument } from './schemas/book-like.schema';
import {
  ReadingProgress,
  ReadingProgressDocument,
} from './schemas/reading-progress.schema';
import {
  ReadingSession,
  ReadingSessionDocument,
} from './schemas/reading-session.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import {
  UpdateProgressDto,
  CreateSessionDto,
  QueryDto,
} from './dto/reading.dto';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { RabbitMQService, QUEUES } from '../../common/services/rabbitmq.service';

@Injectable()
export class ReadingActivityService {
  constructor(
    @InjectModel(BookLike.name) private likeModel: Model<BookLikeDocument>,
    @InjectModel(ReadingProgress.name)
    private progressModel: Model<ReadingProgressDocument>,
    @InjectModel(ReadingSession.name)
    private sessionModel: Model<ReadingSessionDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    private rabbitMQService: RabbitMQService,
  ) {}

  async getLikes(userId: string, query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [data, total] = await Promise.all([
      this.likeModel
        .find(filter)
        .populate('bookId')
        .skip(skip)
        .limit(limit),
      this.likeModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async likeBook(userId: string, bookId: string) {
    const book = await this.bookModel.findById(bookId);
    if (!book || book.deletedAt) throw new NotFoundException('Book not found');

    try {
      const like = await this.likeModel.create({
        userId: new Types.ObjectId(userId),
        bookId: new Types.ObjectId(bookId),
      });
      await this.rabbitMQService.publish(QUEUES.RECOMMENDATIONS_COMPUTE, {
        event: 'book.liked',
        userId,
        bookId,
      });
      return like;
    } catch {
      throw new ConflictException('Book already liked');
    }
  }

  async unlikeBook(userId: string, bookId: string) {
    await this.likeModel.deleteOne({
      userId: new Types.ObjectId(userId),
      bookId: new Types.ObjectId(bookId),
    });
    return { message: 'Book unliked' };
  }

  async getAllProgress(userId: string) {
    return this.progressModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('bookId', 'title coverImageUrl')
      .sort('-lastReadAt');
  }

  async getProgress(userId: string, bookId: string) {
    const progress = await this.progressModel.findOne({
      userId: new Types.ObjectId(userId),
      bookId: new Types.ObjectId(bookId),
    });
    if (!progress) throw new NotFoundException('Progress not found');
    return progress;
  }

  async updateProgress(
    userId: string,
    bookId: string,
    dto: UpdateProgressDto,
  ) {
    const book = await this.bookModel.findById(bookId);
    if (!book) throw new NotFoundException('Book not found');

    const progress = await this.progressModel.findOneAndUpdate(
      {
        userId: new Types.ObjectId(userId),
        bookId: new Types.ObjectId(bookId),
      },
      {
        ...dto,
        totalPages: dto.totalPages || book.pageCount || 0,
        lastReadAt: new Date(),
      },
      { upsert: true, new: true },
    );
    return progress;
  }

  async createSession(userId: string, dto: CreateSessionDto) {
    const book = await this.bookModel.findById(dto.bookId);
    if (!book) throw new NotFoundException('Book not found');

    const session = await this.sessionModel.create({
      userId: new Types.ObjectId(userId),
      bookId: new Types.ObjectId(dto.bookId),
      genreIds: book.genreIds,
      authorId: book.authorId,
      durationSeconds: dto.durationSeconds,
      startedAt: new Date(dto.startedAt),
      endedAt: new Date(dto.endedAt),
    });

    await this.rabbitMQService.publish(QUEUES.RECOMMENDATIONS_COMPUTE, {
      event: 'reading.session.completed',
      userId,
      bookId: dto.bookId,
    });

    return session;
  }

  async getHistory(userId: string, query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { userId: new Types.ObjectId(userId) };
    const [data, total] = await Promise.all([
      this.progressModel
        .find(filter)
        .populate('bookId', 'title coverImageUrl authorId')
        .sort('-lastReadAt')
        .skip(skip)
        .limit(limit),
      this.progressModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }
}
