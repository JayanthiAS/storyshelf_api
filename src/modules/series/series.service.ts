import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Series, SeriesDocument } from './schemas/series.schema';
import { Book, BookDocument } from '../books/schemas/book.schema';
import { CreateSeriesDto, UpdateSeriesDto, QueryDto } from './dto/series.dto';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { BookStatus } from '../../common/enums/book-status.enum';

@Injectable()
export class SeriesService {
  constructor(
    @InjectModel(Series.name) private seriesModel: Model<SeriesDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
  ) {}

  async findAll(query: QueryDto) {
    const { page, limit, skip, sort } = parsePagination(query);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.search) {
      filter.title = { $regex: query.search, $options: 'i' };
    }
    const [data, total] = await Promise.all([
      this.seriesModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.seriesModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    const series = await this.seriesModel.findOne({ _id: id, deletedAt: null });
    if (!series) throw new NotFoundException('Series not found');
    return series;
  }

  async getSeriesBooks(id: string, query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const now = new Date();
    const filter = {
      seriesId: id,
      deletedAt: null,
      status: BookStatus.PUBLISHED,
      $or: [{ releaseDate: null }, { releaseDate: { $lte: now } }],
    };
    const [data, total] = await Promise.all([
      this.bookModel.find(filter).sort({ volumeNumber: 1 }).skip(skip).limit(limit),
      this.bookModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async create(dto: CreateSeriesDto) {
    return this.seriesModel.create(dto);
  }

  async update(id: string, dto: UpdateSeriesDto) {
    const series = await this.seriesModel.findOne({ _id: id, deletedAt: null });
    if (!series) throw new NotFoundException('Series not found');
    Object.assign(series, dto);
    await series.save();
    return series;
  }

  async softDelete(id: string) {
    const series = await this.seriesModel.findOne({ _id: id, deletedAt: null });
    if (!series) throw new NotFoundException('Series not found');
    series.deletedAt = new Date();
    await series.save();
    return { message: 'Series soft deleted' };
  }
}
