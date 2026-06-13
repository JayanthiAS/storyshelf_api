import { IsOptional, IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateSeriesDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  totalVolumes?: number;
}

export class UpdateSeriesDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  totalVolumes?: number;
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
