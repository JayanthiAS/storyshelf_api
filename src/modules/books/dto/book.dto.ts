import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsArray,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { BookStatus } from '../../../common/enums/book-status.enum';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  authorId: string;

  @IsOptional()
  @IsArray()
  genreIds?: string[];

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsNumber()
  volumeNumber?: number;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  shortStory?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsArray()
  genreIds?: string[];

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsNumber()
  volumeNumber?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shortStory?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;
}

export class BookQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  sort?: string;

  @IsOptional()
  search?: string;

  @IsOptional()
  genre?: string;

  @IsOptional()
  author?: string;

  @IsOptional()
  series?: string;

  @IsOptional()
  isLocked?: string;
}

export class LockBookDto {
  @IsBoolean()
  isLocked: boolean;
}
