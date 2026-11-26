import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePublisherBookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  shortStory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genreIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  imprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  isbn?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;
}

export class UpdatePublisherBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  shortStory?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genreIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  imprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  isbn?: string;

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  version?: number;
}

export class CreatePublisherAuthorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}

export class ReviewNoteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note: string;
}
