import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  StreamableFile,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createReadStream } from 'fs';
import { Book, BookDocument } from './schemas/book.schema';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
} from './dto/book.dto';
import { toSlug } from '../../common/utils/helpers.util';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { BookStatus } from '../../common/enums/book-status.enum';
import { StorageService } from '../uploads/storage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Role } from '../../common/enums/role.enum';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { RabbitMQService, QUEUES } from '../../common/services/rabbitmq.service';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class BooksService {
  constructor(
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    private storageService: StorageService,
    private subscriptionsService: SubscriptionsService,
    private rabbitMQService: RabbitMQService,
    private redisService: RedisService,
  ) {}

  private publishedFilter(includeUnreleased = false) {
    const now = new Date();
    const filter: Record<string, unknown> = {
      deletedAt: null,
      status: BookStatus.PUBLISHED,
    };
    if (!includeUnreleased) {
      filter.$or = [{ releaseDate: null }, { releaseDate: { $lte: now } }];
    }
    return filter;
  }

  private buildListFilter(query: BookQueryDto, admin = false) {
    const filter = admin
      ? { deletedAt: null }
      : this.publishedFilter();
    if (query.genre) filter.genreIds = new Types.ObjectId(query.genre);
    if (query.author) filter.authorId = new Types.ObjectId(query.author);
    if (query.series) filter.seriesId = new Types.ObjectId(query.series);
    if (query.isLocked !== undefined) filter.isLocked = query.isLocked === 'true';
    if (query.search) {
      filter.$text = { $search: query.search };
    }
    return filter;
  }

  async checkAccess(
    book: BookDocument,
    user?: JwtPayload,
    adminBypass = false,
  ): Promise<void> {
    if (book.deletedAt) {
      throw new NotFoundException('Book not found');
    }
    if (adminBypass && user?.role === Role.ADMIN) {
      return;
    }
    if (book.releaseDate && book.releaseDate > new Date()) {
      throw new ForbiddenException({
        message: 'Book is not yet released',
        code: 'BOOK_NOT_RELEASED',
      });
    }
    if (book.isLocked) {
      if (!user || user.role !== Role.USER) {
        throw new ForbiddenException({
          message: 'Subscription required to access this book',
          code: 'BOOK_LOCKED',
        });
      }
      const hasPaid = await this.subscriptionsService.hasActivePaidSubscription(
        user.sub,
      );
      if (!hasPaid) {
        throw new ForbiddenException({
          message: 'Active paid subscription required',
          code: 'SUBSCRIPTION_REQUIRED',
        });
      }
    }
  }

  async findAll(query: BookQueryDto, admin = false) {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter = this.buildListFilter(query, admin);
    const [data, total] = await Promise.all([
      this.bookModel
        .find(filter)
        .populate('authorId', 'name')
        .populate('genreIds', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      this.bookModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findRecentlyAdded(query: BookQueryDto) {
    const cacheKey = `books:recent:${JSON.stringify(query)}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.findAll({ ...query, sort: '-createdAt' });
    await this.redisService.set(cacheKey, JSON.stringify(result), 120);
    return result;
  }

  async findFeatured(query: BookQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { ...this.publishedFilter(), isFeatured: true };
    const [data, total] = await Promise.all([
      this.bookModel.find(filter).sort('-createdAt').skip(skip).limit(limit),
      this.bookModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string, user?: JwtPayload, admin = false) {
    const book = await this.bookModel
      .findById(id)
      .populate('authorId', 'name bio')
      .populate('genreIds', 'name slug')
      .populate('seriesId', 'title');
    if (!book || (!admin && (book.deletedAt || book.status !== BookStatus.PUBLISHED))) {
      throw new NotFoundException('Book not found');
    }

    const obj = book.toObject() as unknown as Record<string, unknown>;

    if (!admin) {
      if (book.releaseDate && book.releaseDate > new Date()) {
        throw new ForbiddenException({
          message: 'Book is not yet released',
          code: 'BOOK_NOT_RELEASED',
        });
      }
      if (book.isLocked) {
        const hasAccess =
          user?.role === Role.USER &&
          (await this.subscriptionsService.hasActivePaidSubscription(user.sub));
        if (!hasAccess) {
          delete obj.fileUrl;
          delete obj.fileKey;
        }
      }
    }

    return obj;
  }

  async getPreview(id: string) {
    const book = await this.bookModel.findOne({
      _id: id,
      deletedAt: null,
      status: BookStatus.PUBLISHED,
    });
    if (!book) throw new NotFoundException('Book not found');
    return {
      title: book.title,
      shortStory: book.shortStory,
      description: book.description,
      coverImageUrl: book.coverImageUrl,
    };
  }

  async getContent(id: string, user?: JwtPayload, admin = false) {
    const book = await this.bookModel.findById(id);
    if (!book || book.deletedAt) throw new NotFoundException('Book not found');
    await this.checkAccess(book, user, admin);
    if (!book.fileKey) throw new NotFoundException('Book file not available');
    const path = this.storageService.getAbsolutePath(book.fileKey);
    const stream = createReadStream(path);
    return new StreamableFile(stream, {
      type: book.fileMimeType || 'application/octet-stream',
      disposition: `inline; filename="${book.slug}"`,
    });
  }

  async create(dto: CreateBookDto) {
    const slug = toSlug(dto.title);
    const book = await this.bookModel.create({
      ...dto,
      slug,
      genreIds: dto.genreIds?.map((id) => new Types.ObjectId(id)) || [],
      authorId: new Types.ObjectId(dto.authorId),
      seriesId: dto.seriesId ? new Types.ObjectId(dto.seriesId) : null,
      releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
    });
    return book;
  }

  async update(id: string, dto: UpdateBookDto) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    if (dto.title) book.slug = toSlug(dto.title);
    if (dto.genreIds) book.genreIds = dto.genreIds.map((g) => new Types.ObjectId(g));
    if (dto.authorId) book.authorId = new Types.ObjectId(dto.authorId);
    if (dto.seriesId) book.seriesId = new Types.ObjectId(dto.seriesId);
    if (dto.releaseDate) book.releaseDate = new Date(dto.releaseDate);
    Object.assign(book, dto);
    await book.save();
    return book;
  }

  async publish(id: string) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    book.status = BookStatus.PUBLISHED;
    await book.save();
    await this.rabbitMQService.publish(QUEUES.RECOMMENDATIONS_COMPUTE, {
      event: 'book.published',
      bookId: id,
    });
    return book;
  }

  async toggleLock(id: string, isLocked: boolean) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    book.isLocked = isLocked;
    await book.save();
    return book;
  }

  async softDelete(id: string) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    book.deletedAt = new Date();
    await book.save();
    return { message: 'Book soft deleted' };
  }

  async restore(id: string) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!book) throw new NotFoundException('Deleted book not found');
    book.deletedAt = null;
    await book.save();
    return book;
  }

  async uploadFile(id: string, file: Express.Multer.File) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    if (book.fileKey) await this.storageService.delete(book.fileKey);
    const result = await this.storageService.upload(file, 'books');
    book.fileUrl = result.url;
    book.fileKey = result.key;
    book.fileMimeType = result.mimeType;
    book.fileSizeBytes = result.size;
    await book.save();
    return book;
  }

  async uploadCover(id: string, file: Express.Multer.File) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    const result = await this.storageService.upload(file, 'covers');
    book.coverImageUrl = result.url;
    await book.save();
    return book;
  }

  async removeFile(id: string) {
    const book = await this.bookModel.findOne({ _id: id, deletedAt: null });
    if (!book) throw new NotFoundException('Book not found');
    if (book.fileKey) await this.storageService.delete(book.fileKey);
    book.fileUrl = null;
    book.fileKey = null;
    book.fileMimeType = null;
    book.fileSizeBytes = null;
    await book.save();
    return { message: 'Book file removed' };
  }

  async searchBooks(q: string, query: BookQueryDto) {
    return this.findAll({ ...query, search: q });
  }
}
