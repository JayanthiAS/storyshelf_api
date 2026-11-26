import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { createReadStream } from 'fs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookStatus } from '../../common/enums/book-status.enum';
import { SubmissionStatus } from '../../common/enums/submission-status.enum';
import { RabbitMQService, QUEUES } from '../../common/services/rabbitmq.service';
import { RedisService } from '../../common/services/redis.service';
import { toSlug } from '../../common/utils/helpers.util';
import { Author, AuthorDocument } from '../authors/schemas/author.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { Genre, GenreDocument } from '../genres/schemas/genre.schema';
import { StorageService } from '../uploads/storage.service';
import {
  CreatePublisherBookDto,
  UpdatePublisherBookDto,
} from './dto/publisher-book.dto';
import { PublishersService } from './publishers.service';

const EDITABLE = new Set<SubmissionStatus>([
  SubmissionStatus.DRAFT,
  SubmissionStatus.CHANGES_REQUESTED,
]);

@Injectable()
export class PublisherBooksService {
  constructor(
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(Author.name) private authorModel: Model<AuthorDocument>,
    @InjectModel(Genre.name) private genreModel: Model<GenreDocument>,
    private publishersService: PublishersService,
    private storageService: StorageService,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
  ) {}

  async listForHouse(userId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, false);
    const books = await this.bookModel
      .find({ organizationId: organization._id, deletedAt: null })
      .populate('authorId', 'name')
      .populate('genreIds', 'name slug')
      .sort({ updatedAt: -1 });
    return books.map((book) => this.present(book));
  }

  async listReviews() {
    const books = await this.bookModel
      .find({
        organizationId: { $ne: null },
        deletedAt: null,
        $or: [
          { submissionStatus: SubmissionStatus.SUBMITTED },
          {
            status: BookStatus.PUBLISHED,
            takedownRequestedAt: { $ne: null },
            takenDownAt: null,
          },
        ],
      })
      .populate('authorId', 'name')
      .populate('organizationId', 'displayName legalName')
      .sort({ submittedAt: 1, takedownRequestedAt: 1 });
    return books.map((book) => this.present(book));
  }

  async getForHouse(userId: string, bookId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, false);
    return this.present(await this.requireHouseBook(bookId, organization._id.toString()));
  }

  async create(userId: string, dto: CreatePublisherBookDto) {
    const { organization } = await this.publishersService.requireStaff(userId, true);
    const title = this.plain(dto.title, 200);
    if (!title) throw new BadRequestException('Add a title.');
    const authorId = await this.resolveAuthor(dto, organization._id.toString());
    try {
      const book = await this.bookModel.create({
        title,
        slug: await this.uniqueSlug(title),
        authorId,
        genreIds: await this.genreIds(dto.genreIds),
        description: this.plain(dto.description || '', 8000),
        shortStory: this.plain(dto.shortStory || '', 5000),
        language: this.plain(dto.language || '', 16).toLowerCase(),
        imprint: this.plain(dto.imprint || '', 120),
        isbn: this.normalizeIsbn(dto.isbn),
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
        status: BookStatus.DRAFT,
        submissionStatus: SubmissionStatus.DRAFT,
        organizationId: organization._id,
        isLocked: false,
        version: 1,
      });
      return this.present(book);
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async update(userId: string, bookId: string, dto: UpdatePublisherBookDto) {
    const { organization } = await this.publishersService.requireStaff(userId, true);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    this.assertEditable(book);
    if (dto.version !== undefined && dto.version !== book.version) {
      throw new ConflictException('Someone else saved this book. Reload and try again.');
    }
    if (dto.title !== undefined) {
      book.title = this.plain(dto.title, 200);
      if (!book.title) throw new BadRequestException('Add a title.');
      book.slug = await this.uniqueSlug(book.title, book._id.toString());
    }
    if (dto.authorId !== undefined || dto.authorName !== undefined) {
      book.authorId = await this.resolveAuthor(dto, organization._id.toString());
    }
    if (dto.description !== undefined) book.description = this.plain(dto.description, 8000);
    if (dto.shortStory !== undefined) book.shortStory = this.plain(dto.shortStory, 5000);
    if (dto.genreIds !== undefined) book.genreIds = await this.genreIds(dto.genreIds);
    if (dto.language !== undefined) book.language = this.plain(dto.language, 16).toLowerCase();
    if (dto.imprint !== undefined) book.imprint = this.plain(dto.imprint, 120);
    if (dto.isbn !== undefined) book.isbn = this.normalizeIsbn(dto.isbn);
    if (dto.releaseDate !== undefined) {
      book.releaseDate = dto.releaseDate ? new Date(dto.releaseDate) : null;
    }
    book.version += 1;
    try {
      await book.save();
    } catch (error) {
      this.rethrowConflict(error);
    }
    return this.present(book);
  }

  async uploadFile(userId: string, bookId: string, file: Express.Multer.File) {
    return this.replaceAsset(userId, bookId, file, 'book');
  }

  async uploadCover(userId: string, bookId: string, file: Express.Multer.File) {
    return this.replaceAsset(userId, bookId, file, 'cover');
  }

  async submit(userId: string, bookId: string) {
    const { organization, membership } = await this.publishersService.requireStaff(userId, true);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    this.assertEditable(book);
    const missing: string[] = [];
    if (!book.title?.trim()) missing.push('a title');
    if (!book.description?.trim()) missing.push('a description');
    if (!book.authorId) missing.push('an author');
    if (!book.genreIds?.length) missing.push('at least one genre');
    if (!book.language?.trim()) missing.push('a language');
    if (!book.coverImageUrl) missing.push('a cover');
    if (!book.fileKey || !existsSync(this.storageService.getAbsolutePath(book.fileKey))) {
      missing.push('a PDF or EPUB file');
    }
    if (missing.length) {
      throw new BadRequestException({
        message: `Add ${missing.join(', ')} before submitting.`,
        code: 'SUBMIT_INCOMPLETE',
      });
    }
    book.submissionStatus = SubmissionStatus.SUBMITTED;
    book.submittedBy = membership.userId;
    book.submittedAt = new Date();
    book.version += 1;
    await book.save();
    return this.present(book);
  }

  async withdraw(userId: string, bookId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, true);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    if (book.submissionStatus !== SubmissionStatus.SUBMITTED) {
      throw new BadRequestException('Only a book that is in review can be withdrawn.');
    }
    book.submissionStatus = SubmissionStatus.DRAFT;
    book.version += 1;
    await book.save();
    return this.present(book);
  }

  async requestTakedown(userId: string, bookId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, true, true);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    if (book.status !== BookStatus.PUBLISHED || book.takenDownAt) {
      throw new BadRequestException('Only a live book can be taken down.');
    }
    if (!book.takedownRequestedAt) {
      book.takedownRequestedAt = new Date();
      book.version += 1;
      await book.save();
    }
    return this.present(book);
  }

  async previewFile(userId: string, bookId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, false);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    if (!book.fileKey || !existsSync(this.storageService.getAbsolutePath(book.fileKey))) {
      throw new NotFoundException('Book file not available');
    }
    return new StreamableFile(createReadStream(this.storageService.getAbsolutePath(book.fileKey)), {
      type: book.fileMimeType || 'application/octet-stream',
      disposition: `inline; filename="${book.slug}"`,
    });
  }

  async approve(bookId: string, reviewerId: string) {
    const book = await this.requireReviewBook(bookId);
    if (
      book.status === BookStatus.PUBLISHED &&
      book.submissionStatus === SubmissionStatus.APPROVED &&
      !book.takenDownAt
    ) {
      return this.present(book);
    }
    if (book.submissionStatus !== SubmissionStatus.SUBMITTED) {
      throw new ConflictException('Only a submitted book can be approved.');
    }
    if (!book.fileKey || !existsSync(this.storageService.getAbsolutePath(book.fileKey))) {
      throw new BadRequestException(
        'The book file is missing. Leave it in review until the house uploads the file again.',
      );
    }
    if (!book.coverImageUrl) {
      throw new BadRequestException('This book has no cover, so it cannot go live.');
    }
    const wasLive = book.status === BookStatus.PUBLISHED && !book.takenDownAt;
    book.status = BookStatus.PUBLISHED;
    book.submissionStatus = SubmissionStatus.APPROVED;
    book.isLocked = false;
    book.reviewNote = null;
    book.reviewedBy = new Types.ObjectId(reviewerId);
    book.reviewedAt = new Date();
    book.takenDownAt = null;
    book.takedownRequestedAt = null;
    await book.save();
    if (!wasLive && this.isReaderVisible(book)) {
      await this.rabbitMQService.publish(QUEUES.RECOMMENDATIONS_COMPUTE, {
        event: 'book.published',
        bookId: book._id.toString(),
      });
    }
    await this.redisService.delByPattern('books:recent:*');
    return this.present(book);
  }

  async requestChanges(bookId: string, reviewerId: string, note: string) {
    const book = await this.requireReviewBook(bookId);
    if (book.submissionStatus !== SubmissionStatus.SUBMITTED) {
      throw new ConflictException('Only a submitted book can be sent back.');
    }
    book.submissionStatus = SubmissionStatus.CHANGES_REQUESTED;
    book.reviewNote = note.trim();
    book.reviewedBy = new Types.ObjectId(reviewerId);
    book.reviewedAt = new Date();
    await book.save();
    return this.present(book);
  }

  async reject(bookId: string, reviewerId: string, note: string) {
    const book = await this.requireReviewBook(bookId);
    if (book.submissionStatus === SubmissionStatus.REJECTED) return this.present(book);
    if (
      book.submissionStatus !== SubmissionStatus.SUBMITTED &&
      book.submissionStatus !== SubmissionStatus.CHANGES_REQUESTED
    ) {
      throw new ConflictException('Only a book in review can be rejected.');
    }
    book.status = BookStatus.DRAFT;
    book.submissionStatus = SubmissionStatus.REJECTED;
    book.reviewNote = note.trim();
    book.reviewedBy = new Types.ObjectId(reviewerId);
    book.reviewedAt = new Date();
    await book.save();
    return this.present(book);
  }

  async confirmTakedown(bookId: string, reviewerId: string) {
    const book = await this.requireReviewBook(bookId);
    if (book.takenDownAt) return this.present(book);
    if (book.status !== BookStatus.PUBLISHED) {
      throw new BadRequestException('This book is not live.');
    }
    book.status = BookStatus.DRAFT;
    book.takenDownAt = new Date();
    book.reviewedBy = new Types.ObjectId(reviewerId);
    book.reviewedAt = new Date();
    await book.save();
    await this.redisService.delByPattern('books:recent:*');
    return this.present(book);
  }

  async createAuthor(userId: string, name: string, bio?: string) {
    const { organization } = await this.publishersService.requireStaff(userId, true);
    const cleanName = this.plain(name, 120);
    if (!cleanName) throw new BadRequestException('Add an author name.');
    return this.authorModel.create({
      name: cleanName,
      bio: this.plain(bio || '', 2000),
      organizationId: organization._id,
    });
  }

  async listAuthors(userId: string) {
    const { organization } = await this.publishersService.requireStaff(userId, false);
    return this.authorModel
      .find({ organizationId: organization._id, deletedAt: null })
      .sort({ name: 1 });
  }

  private async replaceAsset(
    userId: string,
    bookId: string,
    file: Express.Multer.File,
    kind: 'book' | 'cover',
  ) {
    const { organization } = await this.publishersService.requireStaff(userId, true);
    const book = await this.requireHouseBook(bookId, organization._id.toString());
    this.assertEditable(book);
    this.storageService.assert(file, kind);
    if (kind === 'book') {
      if (book.fileKey) await this.storageService.delete(book.fileKey);
      const result = await this.storageService.upload(file, 'books');
      book.fileUrl = result.url;
      book.fileKey = result.key;
      book.fileMimeType = result.mimeType;
      book.fileSizeBytes = result.size;
    } else {
      const result = await this.storageService.upload(file, 'covers');
      book.coverImageUrl = result.url;
    }
    book.version += 1;
    await book.save();
    return this.present(book);
  }

  private assertEditable(book: BookDocument) {
    if (book.takenDownAt || !book.submissionStatus || !EDITABLE.has(book.submissionStatus)) {
      throw new ConflictException(
        'This book cannot be edited while it is in review, rejected, or already decided.',
      );
    }
  }

  private async requireHouseBook(bookId: string, organizationId: string) {
    if (!Types.ObjectId.isValid(bookId)) throw new NotFoundException('Book not found');
    const book = await this.bookModel
      .findOne({ _id: bookId, deletedAt: null })
      .populate('authorId', 'name')
      .populate('genreIds', 'name slug');
    if (!book || book.organizationId?.toString() !== organizationId) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  private async requireReviewBook(bookId: string) {
    if (!Types.ObjectId.isValid(bookId)) throw new NotFoundException('Book not found');
    const book = await this.bookModel.findOne({
      _id: bookId,
      organizationId: { $ne: null },
      deletedAt: null,
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  private async resolveAuthor(
    dto: { authorId?: string; authorName?: string },
    organizationId: string,
  ) {
    if (dto.authorId) {
      if (!Types.ObjectId.isValid(dto.authorId)) {
        throw new BadRequestException('Choose an author that belongs to this house.');
      }
      const author = await this.authorModel.findOne({ _id: dto.authorId, deletedAt: null });
      if (!author || author.organizationId?.toString() !== organizationId) {
        throw new ForbiddenException('Choose an author that belongs to this house.');
      }
      return author._id;
    }
    const name = this.plain(dto.authorName || '', 120);
    if (!name) throw new BadRequestException('Add an author.');
    const created = await this.authorModel.create({
      name,
      bio: '',
      organizationId: new Types.ObjectId(organizationId),
    });
    return created._id;
  }

  private async genreIds(ids?: string[]) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return [];
    if (unique.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('One or more genres are not available.');
    }
    const found = await this.genreModel.countDocuments({
      _id: { $in: unique },
      deletedAt: null,
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more genres are not available.');
    }
    return unique.map((id) => new Types.ObjectId(id));
  }

  private async uniqueSlug(title: string, currentId?: string) {
    const base = toSlug(this.plain(title, 200)) || `book-${randomUUID().slice(0, 8)}`;
    let slug = base;
    let suffix = 2;
    while (true) {
      const existing = await this.bookModel.findOne({ slug }).select('_id');
      if (!existing || (currentId && existing._id.toString() === currentId)) return slug;
      slug = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 50) return `${base}-${randomUUID().slice(0, 8)}`;
    }
  }

  private normalizeIsbn(value?: string) {
    const isbn = (value || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    return isbn || null;
  }

  private plain(value: string, max: number) {
    return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  private isReaderVisible(book: BookDocument) {
    return (
      book.status === BookStatus.PUBLISHED &&
      !book.deletedAt &&
      !book.takenDownAt &&
      (!book.releaseDate || book.releaseDate <= new Date())
    );
  }

  private present(book: BookDocument) {
    const obj = book.toObject() as unknown as Record<string, unknown>;
    delete obj.fileKey;
    return obj;
  }

  private rethrowConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      const key = JSON.stringify((error as { keyPattern?: unknown }).keyPattern || '');
      if (key.includes('isbn')) {
        throw new ConflictException(
          'This ISBN is already on Storyshelf. Contact Storyshelf before submitting it again.',
        );
      }
      throw new ConflictException('A book with this title already exists. Change the title and save again.');
    }
    throw error;
  }
}
