import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Genre, GenreDocument } from './schemas/genre.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { CreateGenreDto, UpdateGenreDto, QueryDto } from './dto/genre.dto';
import { toSlug } from '../../common/utils/helpers.util';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { BookStatus } from '../../common/enums/book-status.enum';
import { RedisService } from '../../common/services/redis.service';

@Injectable()
export class GenresService {
  constructor(
    @InjectModel(Genre.name) private genreModel: Model<GenreDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    private redisService: RedisService,
  ) {}

  async findAll(query: QueryDto) {
    const cacheKey = `genres:list:${JSON.stringify(query)}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { page, limit, skip, sort } = parsePagination(query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }
    const [data, total] = await Promise.all([
      this.genreModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.genreModel.countDocuments(filter),
    ]);
    const result = buildPaginatedResult(data, total, page, limit);
    await this.redisService.set(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  async findById(id: string) {
    const genre = await this.genreModel.findOne({ _id: id, deletedAt: null });
    if (!genre) throw new NotFoundException('Genre not found');
    return genre;
  }

  async getGenreBooks(id: string, query: QueryDto) {
    const { page, limit, skip, sort } = parsePagination(query);
    const now = new Date();
    const filter = {
      genreIds: id,
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

  async create(dto: CreateGenreDto) {
    const slug = toSlug(dto.name);
    const existing = await this.genreModel.findOne({ slug });
    if (existing) throw new ConflictException('Genre already exists');
    const genre = await this.genreModel.create({ ...dto, slug });
    return genre;
  }

  async update(id: string, dto: UpdateGenreDto) {
    const genre = await this.genreModel.findOne({ _id: id, deletedAt: null });
    if (!genre) throw new NotFoundException('Genre not found');
    if (dto.name) genre.slug = toSlug(dto.name);
    Object.assign(genre, dto);
    await genre.save();
    return genre;
  }

  async softDelete(id: string) {
    const genre = await this.genreModel.findOne({ _id: id, deletedAt: null });
    if (!genre) throw new NotFoundException('Genre not found');
    genre.deletedAt = new Date();
    await genre.save();
    return { message: 'Genre soft deleted' };
  }

  async restore(id: string) {
    const genre = await this.genreModel.findOne({ _id: id, deletedAt: { $ne: null } });
    if (!genre) throw new NotFoundException('Deleted genre not found');
    genre.deletedAt = null;
    await genre.save();
    return genre;
  }
}
