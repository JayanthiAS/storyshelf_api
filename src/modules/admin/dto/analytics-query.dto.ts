import { IsIn, IsOptional } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['day', 'month', 'year'])
  granularity?: 'day' | 'month' | 'year';
}
