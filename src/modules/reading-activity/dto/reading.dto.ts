import { IsOptional, IsNumber, IsDateString, IsString } from 'class-validator';

export class UpdateProgressDto {
  @IsNumber()
  currentPage: number;

  @IsOptional()
  @IsNumber()
  totalPages?: number;

  @IsOptional()
  @IsNumber()
  percentComplete?: number;
}

export class CreateSessionDto {
  @IsString()
  bookId: string;

  @IsNumber()
  durationSeconds: number;

  @IsDateString()
  startedAt: string;

  @IsDateString()
  endedAt: string;
}

export class UpdateSessionDto {
  @IsNumber()
  durationSeconds: number;

  @IsDateString()
  endedAt: string;
}

export class QueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
