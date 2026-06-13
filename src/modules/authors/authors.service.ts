import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Author, AuthorDocument } from './schemas/author.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { CreateAuthorDto, UpdateAuthorDto, QueryDto } from './dto/author.dto';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { BookStatus } from '../../common/enums/book-status.enum';

@Injectable()
export class AuthorsService {
  constructor(
    @InjectModel(Author.name) private authorModel: Model<AuthorDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
  ) {}

  async findAll(query: QueryDto) {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }
    const [data, total] = await Promise.all([
      this.authorModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.authorModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    const author = await this.authorModel.findOne({ _id: id, deletedAt: null });
    if (!author) throw new NotFoundException('Author not found');
    const bookCount = await this.bookModel.countDocuments({
      authorId: id,
      deletedAt: null,
      status: BookStatus.PUBLISHED,
    });
    return { ...author.toObject(), bookCount };
  }

  async getAuthorBooks(id: string, query: QueryDto) {
    const { page, limit, skip, sort } = parsePagination(query);
    const now = new Date();
    const filter = {
      authorId: id,
      deletedAt: null,
      status: BookStatus.PUBLISHED,
      $or: [{ releaseDate: null }, { releaseDate: { $lte: now } }],
    };
    const [data, total] = await Promise.all([
      this.bookModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.bookModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async create(dto: CreateAuthorDto) {
    return this.authorModel.create(dto);
  }

  async update(id: string, dto: UpdateAuthorDto) {
    const author = await this.authorModel.findOne({ _id: id, deletedAt: null });
    if (!author) throw new NotFoundException('Author not found');
    Object.assign(author, dto);
    await author.save();
    return author;
  }

  async softDelete(id: string) {
    const author = await this.authorModel.findOne({ _id: id, deletedAt: null });
    if (!author) throw new NotFoundException('Author not found');
    author.deletedAt = new Date();
    await author.save();
    return { message: 'Author soft deleted' };
  }

  async restore(id: string) {
    const author = await this.authorModel.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!author) throw new NotFoundException('Deleted author not found');
    author.deletedAt = null;
    await author.save();
    return author;
  }
}
