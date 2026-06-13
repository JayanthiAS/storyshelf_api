import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateAuthorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;
}

export class UpdateAuthorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;
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
