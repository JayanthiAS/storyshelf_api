import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateGenreDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateGenreDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  sort?: string;

  @IsOptional()
  search?: string;
}
