import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
} from 'class-validator';
import { PlanInterval } from '../../../common/enums/plan-interval.enum';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PlanInterval)
  interval: PlanInterval;

  @IsOptional()
  @IsArray()
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  unlocksLockedBooks?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsArray()
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  unlocksLockedBooks?: boolean;
}

export class CheckoutDto {
  @IsString()
  planId: string;
}

export class CheckoutSuccessQueryDto {
  @IsString()
  @IsNotEmpty()
  session_id: string;
}

export class QueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  status?: string;

  @IsOptional()
  planId?: string;
}
